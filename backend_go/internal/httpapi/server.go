package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"lppm-backend-go/internal/config"
)

// Server is the HTTP API; it reproduces the Express app in src/app.ts.
type Server struct {
	cfg       config.Config
	db        *sql.DB
	logger    *log.Logger
	accessLog io.WriteCloser
	logMu     sync.Mutex
	limiter   *rateLimiter
	mounts    []*mount
	// now is overridable in tests.
	now func() time.Time
	// sleep is used for the anti-enumeration delay (overridable in tests).
	sleep func(time.Duration)
}

// New builds the server and registers every route of the Node backend.
func New(cfg config.Config, db *sql.DB) (*Server, error) {
	if err := os.MkdirAll("logs", 0o750); err != nil {
		return nil, fmt.Errorf("create logs directory: %w", err)
	}
	accessLog, err := os.OpenFile(filepath.Join("logs", "access.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o640)
	if err != nil {
		return nil, fmt.Errorf("open access log: %w", err)
	}
	s := newServer(cfg, db)
	s.accessLog = accessLog
	return s, nil
}

func newServer(cfg config.Config, db *sql.DB) *Server {
	s := &Server{
		cfg:     cfg,
		db:      db,
		logger:  log.New(os.Stdout, "", log.LstdFlags),
		limiter: newRateLimiter(),
		now:     time.Now,
		sleep:   time.Sleep,
	}
	s.registerRoutes()
	return s
}

// Close releases the access log file.
func (s *Server) Close() error {
	if s.accessLog != nil {
		return s.accessLog.Close()
	}
	return nil
}

// registerRoutes mirrors registerApiRoutes() in app.ts (same mount order),
// plus the Go-only laporan routes.
func (s *Server) registerRoutes() {
	s.registerAuthRoutes()
	s.registerUserFotoRoutes() // publik, harus sebelum router /users yang ber-authenticate
	s.registerUserRoutes()
	s.registerPeriodeRoutes()
	s.registerProposalRoutes()
	s.registerProposalDosenRoutes()
	s.registerLaporanHarianRoutes()
	s.registerReviewerRoutes()
	s.registerLaporanKegiatanRoutes() // baru, tidak ada di Node
	s.registerProgramStudiRoutes()    // baru, tidak ada di Node
	s.registerLuaranRoutes()          // baru, tidak ada di Node
	s.registerKepercayaanRoutes()     // baru, tidak ada di Node
	s.registerMasterRoutes()          // baru, tidak ada di Node
	s.registerNotificationRoutes()
	s.registerDashboardRoutes()
	s.registerActivityLogRoutes()
	s.registerExportRoutes()
}

// nowMs returns the current time truncated to milliseconds, like JS Date.
func (s *Server) nowMs() time.Time {
	return s.now().Truncate(time.Millisecond)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
	c := &Ctx{s: s, w: rec, r: r, query: r.URL.Query(), body: map[string]any{}}
	c.ip = s.clientIP(r)
	c.ua = r.UserAgent()
	defer func() {
		if p := recover(); p != nil {
			s.logger.Printf("panic: %v", p)
			if !rec.wrote {
				s.handleError(rec, r, fmt.Errorf("%v", p))
			}
		}
		s.writeAccessLog(c, rec, started)
	}()

	s.setSecurityHeaders(rec)
	if s.handleCORS(rec, r) {
		return
	}
	if !s.limiter.check(rec, "global:"+c.ip, time.Duration(s.cfg.RateLimitWindowMS)*time.Millisecond, s.cfg.RateLimitMax, true,
		"Too many requests, please try again later.", s, r) {
		return
	}
	if err := s.parseBody(c); err != nil {
		s.handleError(rec, r, err)
		return
	}
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && strings.EqualFold(strings.TrimSuffix(r.URL.Path, "/"), "/health") {
		s.writeBody(rec, r, http.StatusOK, O{
			{"success", true}, {"message", "OK"}, {"timestamp", formatJSTime(time.Now())},
		})
		return
	}
	s.dispatch(c)
}

type responseRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
	wrote  bool
}

func (r *responseRecorder) WriteHeader(status int) {
	if r.wrote {
		return
	}
	r.status = status
	r.wrote = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *responseRecorder) Write(p []byte) (int, error) {
	if !r.wrote {
		r.WriteHeader(http.StatusOK)
	}
	n, err := r.ResponseWriter.Write(p)
	r.bytes += n
	return n, err
}

// setSecurityHeaders reproduces helmet() v8 defaults.
func (s *Server) setSecurityHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Content-Security-Policy", "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests")
	h.Set("Cross-Origin-Opener-Policy", "same-origin")
	h.Set("Cross-Origin-Resource-Policy", "same-origin")
	h.Set("Origin-Agent-Cluster", "?1")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-DNS-Prefetch-Control", "off")
	h.Set("X-Download-Options", "noopen")
	h.Set("X-Frame-Options", "SAMEORIGIN")
	h.Set("X-Permitted-Cross-Domain-Policies", "none")
	h.Set("X-XSS-Protection", "0")
}

// handleCORS reproduces the `cors` package with a fixed origin string.
// It returns true when the request was a preflight that has been answered.
func (s *Server) handleCORS(w http.ResponseWriter, r *http.Request) bool {
	h := w.Header()
	origin := s.cfg.CORSOrigin
	h.Set("Access-Control-Allow-Origin", origin)
	if origin != "*" {
		h.Add("Vary", "Origin")
	}
	if r.Method != http.MethodOptions {
		return false
	}
	h.Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE")
	h.Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
	h.Set("Content-Length", "0")
	w.WriteHeader(http.StatusNoContent)
	return true
}

// clientIP mirrors req.ip. Without trust proxy it is the socket address
// (Node reports IPv4 peers as IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1);
// with "trust proxy" = 1 it is the right-most X-Forwarded-For entry.
func (s *Server) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.To4() != nil && !strings.Contains(host, ":") {
		host = "::ffff:" + host
	}
	if s.cfg.TrustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	return host
}

// writeAccessLog writes the morgan "combined" line to logs/access.log and a
// short "dev" line to stdout outside production.
func (s *Server) writeAccessLog(c *Ctx, rec *responseRecorder, started time.Time) {
	if os.Getenv("BENCHMARK") == "true" {
		return
	}
	length := rec.Header().Get("Content-Length")
	if length == "" {
		length = "-"
	}
	referrer := c.r.Referer()
	if referrer == "" {
		referrer = "-"
	}
	agent := c.ua
	if agent == "" {
		agent = "-"
	}
	line := fmt.Sprintf("%s - - [%s] \"%s %s HTTP/%d.%d\" %d %s \"%s\" \"%s\"\n",
		c.ip, started.UTC().Format("02/Jan/2006:15:04:05 +0000"), c.r.Method, c.r.URL.RequestURI(),
		c.r.ProtoMajor, c.r.ProtoMinor, rec.status, length, referrer, agent)
	if s.accessLog != nil {
		s.logMu.Lock()
		if _, err := io.WriteString(s.accessLog, line); err != nil {
			s.logger.Printf("failed to write access log: %v", err)
		}
		s.logMu.Unlock()
	}
	if s.cfg.NodeEnv == "production" {
		s.logger.Print(strings.TrimSpace(line))
	} else {
		s.logger.Printf("%s %s %d %.3f ms - %s", c.r.Method, c.r.URL.RequestURI(), rec.status,
			float64(time.Since(started).Microseconds())/1000, length)
	}
}

// parseBody mirrors express.json({limit:"10kb"}) followed by
// express.urlencoded({extended:true}).
func (s *Server) parseBody(c *Ctx) error {
	r := c.r
	hasBody := len(r.TransferEncoding) > 0 || r.Header.Get("Transfer-Encoding") != "" || r.Header.Get("Content-Length") != "" || r.ContentLength != 0
	if !hasBody {
		return nil
	}
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	switch mediaType {
	case "application/json":
		data, err := readLimited(r, 10*1024)
		if err != nil {
			return err
		}
		trimmed := bytes.TrimSpace(data)
		if len(trimmed) == 0 {
			c.body = map[string]any{}
			return nil
		}
		if trimmed[0] != '{' && trimmed[0] != '[' {
			return httpError(http.StatusBadRequest, jsonSyntaxMessage(string(trimmed)))
		}
		var decoded any
		if err := json.Unmarshal(trimmed, &decoded); err != nil {
			return httpError(http.StatusBadRequest, jsonSyntaxMessage(string(trimmed)))
		}
		c.body = decoded
	case "application/x-www-form-urlencoded":
		data, err := readLimited(r, 100*1024)
		if err != nil {
			return err
		}
		values, err := url.ParseQuery(string(data))
		if err != nil {
			return httpError(http.StatusBadRequest, "Bad Request")
		}
		body := map[string]any{}
		for key, list := range values {
			if len(list) == 1 {
				body[key] = list[0]
			} else {
				items := make([]any, len(list))
				for i, v := range list {
					items[i] = v
				}
				body[key] = items
			}
		}
		c.body = body
	}
	return nil
}

func readLimited(r *http.Request, limit int64) ([]byte, error) {
	if r.ContentLength > limit {
		return nil, httpError(http.StatusRequestEntityTooLarge, "request entity too large")
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, limit+1))
	if err != nil {
		return nil, httpError(http.StatusBadRequest, "request aborted")
	}
	if int64(len(data)) > limit {
		return nil, httpError(http.StatusRequestEntityTooLarge, "request entity too large")
	}
	return data, nil
}

func jsonSyntaxMessage(body string) string {
	first, _ := utf8.DecodeRuneInString(body)
	preview := body
	if len(preview) > 30 {
		preview = preview[:30] + "..."
	}
	return fmt.Sprintf("Unexpected token '%c', %q is not valid JSON", first, preview)
}

// ── Rate limiting (express-rate-limit, MemoryStore, fixed window) ─────────

type rateRecord struct {
	reset time.Time
	count int
}

type rateLimiter struct {
	mu      sync.Mutex
	records map[string]*rateRecord
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{records: make(map[string]*rateRecord)}
}

// check increments the hit counter for key and writes the rate-limit
// headers. It returns false (after answering 429) when the limit is hit.
// standard=true writes draft-6 RateLimit-* headers, false writes the legacy
// X-RateLimit-* headers.
func (l *rateLimiter) check(w http.ResponseWriter, key string, window time.Duration, max int, standard bool, message string, s *Server, r *http.Request) bool {
	now := time.Now()
	l.mu.Lock()
	rec := l.records[key]
	if rec == nil || !now.Before(rec.reset) {
		rec = &rateRecord{reset: now.Add(window)}
		l.records[key] = rec
	}
	rec.count++
	count, reset := rec.count, rec.reset
	if len(l.records) > 50000 {
		for k, v := range l.records {
			if !now.Before(v.reset) {
				delete(l.records, k)
			}
		}
	}
	l.mu.Unlock()

	remaining := max - count
	if remaining < 0 {
		remaining = 0
	}
	secondsLeft := int(reset.Sub(now).Seconds() + 0.999)
	if secondsLeft < 0 {
		secondsLeft = 0
	}
	h := w.Header()
	if standard {
		h.Set("RateLimit-Policy", fmt.Sprintf("%d;w=%d", max, int(window.Seconds())))
		h.Set("RateLimit-Limit", strconv.Itoa(max))
		h.Set("RateLimit-Remaining", strconv.Itoa(remaining))
		h.Set("RateLimit-Reset", strconv.Itoa(secondsLeft))
	} else {
		h.Set("X-RateLimit-Limit", strconv.Itoa(max))
		h.Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
		h.Set("X-RateLimit-Reset", strconv.FormatInt((reset.UnixMilli()+999)/1000, 10))
	}
	if count > max {
		h.Set("Retry-After", strconv.Itoa(secondsLeft))
		s.writeBody(w, r, http.StatusTooManyRequests, O{{"success", false}, {"message", message}})
		return false
	}
	return true
}

func (s *Server) authLimiter(c *Ctx) error {
	if !s.limiter.check(c.w, "auth:"+c.ip, 15*time.Minute, 10, true, "Too many attempts, try again in 15 minutes.", s, c.r) {
		return errStop
	}
	return nil
}

func (s *Server) registerLimiter(c *Ctx) error {
	if !s.limiter.check(c.w, "register:"+c.ip, time.Hour, 5, false, "Too many registrations from this IP.", s, c.r) {
		return errStop
	}
	return nil
}
