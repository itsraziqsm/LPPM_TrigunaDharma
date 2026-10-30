package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"

	mysql "github.com/go-sql-driver/mysql"
)

// noData marks a response without a "data" key (Node: sendSuccess(res, msg)).
type noDataType struct{}

var noData = noDataType{}

// apiError mirrors errors thrown in the Node services that carry a
// statusCode/status property. They go through the global error handler,
// which hides the message in production.
type apiError struct {
	status  int
	message string
}

func (e *apiError) Error() string { return e.message }

func httpError(status int, message string) error {
	return &apiError{status: status, message: message}
}

// plainError mirrors `throw new Error(message)` in Node: the global error
// handler answers with HTTP 500 and the message (outside production).
func plainError(message string) error {
	return &apiError{status: http.StatusInternalServerError, message: message}
}

// writeBody sends a JSON body the way Express' res.json does: compact JSON,
// "application/json; charset=utf-8", a weak ETag, and 304 handling for
// fresh conditional GET/HEAD requests.
func (s *Server) writeBody(w http.ResponseWriter, r *http.Request, status int, payload any) {
	body, err := encodeJSON(payload)
	if err != nil {
		s.logger.Printf("encode response: %v", err)
		body = []byte(`{"success":false,"message":"Internal server error"}`)
		status = http.StatusInternalServerError
	}
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	etag := weakETag(body)
	h.Set("ETag", etag)
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) &&
		((status >= 200 && status < 300) || status == http.StatusNotModified) &&
		requestIsFresh(r, etag) {
		h.Del("Content-Type")
		h.Del("Content-Length")
		w.WriteHeader(http.StatusNotModified)
		return
	}
	h.Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

// weakETag: format sama dengan modul etag Express (W/"<panjang hex>-<27 karakter base64>"),
// tetapi hash memakai SHA-256 (Express: SHA-1). ETag bersifat opak bagi klien, jadi nilai yang
// berbeda dari Node tidak memengaruhi perilaku (304 tetap jalan).
func weakETag(body []byte) string {
	sum := sha256.Sum256(body)
	hash := base64.StdEncoding.EncodeToString(sum[:])[:27]
	return `W/"` + strconv.FormatInt(int64(len(body)), 16) + "-" + hash + `"`
}

// requestIsFresh implements the `fresh` package used by Express.
func requestIsFresh(r *http.Request, etag string) bool {
	modifiedSince := r.Header.Get("If-Modified-Since")
	noneMatch := r.Header.Get("If-None-Match")
	if modifiedSince == "" && noneMatch == "" {
		return false
	}
	if cc := r.Header.Get("Cache-Control"); cc != "" && strings.Contains(strings.ToLower(cc), "no-cache") {
		return false
	}
	if noneMatch != "" && noneMatch != "*" {
		matched := false
		for _, candidate := range strings.Split(noneMatch, ",") {
			candidate = strings.TrimSpace(candidate)
			if candidate == etag || candidate == "W/"+etag || "W/"+candidate == etag {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if modifiedSince != "" {
		// No Last-Modified header is ever sent, so the response is stale.
		return false
	}
	return true
}

// ok sends {success:true,message,data?}.
func (s *Server) ok(w http.ResponseWriter, r *http.Request, status int, message string, data any) {
	payload := O{{"success", true}, {"message", message}}
	if _, omit := data.(noDataType); !omit {
		payload = append(payload, KV{"data", data})
	}
	s.writeBody(w, r, status, payload)
}

// okMeta sends {success:true,message,data,meta:{page,limit,total}}.
func (s *Server) okMeta(w http.ResponseWriter, r *http.Request, message string, data any, page, limit any, total int64) {
	s.writeBody(w, r, http.StatusOK, O{
		{"success", true}, {"message", message}, {"data", data},
		{"meta", O{{"page", page}, {"limit", limit}, {"total", total}}},
	})
}

// fail mirrors sendError(res, message, status): {success:false,message}.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, status int, message string) {
	s.writeBody(w, r, status, O{{"success", false}, {"message", message}})
}

// validationFailed mirrors the validate() middleware: HTTP 422 with zod's
// flattened fieldErrors.
func (s *Server) validationFailed(w http.ResponseWriter, r *http.Request, fieldErrors O) {
	s.writeBody(w, r, http.StatusUnprocessableEntity, O{
		{"success", false}, {"message", "Validation error"}, {"errors", fieldErrors},
	})
}

// handleError mirrors error.middleware.ts.
func (s *Server) handleError(w http.ResponseWriter, r *http.Request, err error) {
	s.logger.Printf("error method=%s url=%s: %v", r.Method, r.URL.RequestURI(), err)
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 {
		s.writeBody(w, r, http.StatusConflict, O{{"success", false}, {"message", "Resource already exists"}})
		return
	}
	status := http.StatusInternalServerError
	message := err.Error()
	var apiErr *apiError
	if errors.As(err, &apiErr) {
		status = apiErr.status
		message = apiErr.message
	} else if errors.As(err, &mysqlErr) {
		message = prismaStyleMessage(mysqlErr)
	}
	if s.cfg.NodeEnv == "production" {
		s.writeBody(w, r, status, O{{"success", false}, {"message", "Internal server error"}})
		return
	}
	stack := "Error: " + message + "\n" + indentStack(string(debug.Stack()))
	s.writeBody(w, r, status, O{{"success", false}, {"message", message}, {"stack", stack}})
}

func indentStack(stack string) string {
	lines := strings.Split(strings.TrimSpace(stack), "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "goroutine ") {
			continue
		}
		out = append(out, "    at "+line)
	}
	return strings.Join(out, "\n")
}

func prismaStyleMessage(err *mysql.MySQLError) string {
	switch err.Number {
	case 1451, 1452:
		return "Foreign key constraint violated: " + err.Message
	default:
		return fmt.Sprintf("Database error %d: %s", err.Number, err.Message)
	}
}

// notFoundRecord mirrors Prisma's P2025 error (findUniqueOrThrow, update,
// delete on a missing row). Node answers it with HTTP 500.
func notFoundRecord(model string) error {
	return plainError(fmt.Sprintf("No %s found", model))
}

// invalidArgument mirrors a Prisma validation error caused by a value of the
// wrong type (e.g. NaN ids). Node answers it with HTTP 500.
func invalidArgument(field string, value any) error {
	return plainError(fmt.Sprintf("Invalid value for argument `%s`: %v. Expected Int.", field, value))
}
