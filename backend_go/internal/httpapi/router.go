package httpapi

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
)

// errStop tells the router that a step already wrote the response.
var errStop = errors.New("response already sent")

// Ctx carries the per-request state that Express keeps on req/res.
type Ctx struct {
	s      *Server
	w      http.ResponseWriter
	r      *http.Request
	params map[string]string
	query  url.Values
	user   *tokenPayload
	// body mirrors req.body: map[string]any for JSON/urlencoded/multipart
	// fields ({} when no parser ran), or any other JSON value.
	body any
	// file mirrors multer's req.file.
	file *uploadedFile
	// validatedQuery mirrors req.query after validate(schema, "query").
	validatedQuery map[string]any
	ip             string
	ua             string
}

// step is one Express handler/middleware. Returning nil continues with the
// next step, errStop ends the chain, any other error goes to the error
// handler.
type step func(c *Ctx) error

type routeDef struct {
	method string
	segs   []string
	steps  []step
}

type mount struct {
	prefix []string
	use    []step
	routes []routeDef
}

// group mirrors an Express Router mounted with app.use(prefix, router).
func (s *Server) group(prefix string, use ...step) *mount {
	m := &mount{prefix: splitPattern(prefix), use: use}
	s.mounts = append(s.mounts, m)
	return m
}

func (m *mount) handle(method, pattern string, steps ...step) {
	m.routes = append(m.routes, routeDef{method: method, segs: splitPattern(pattern), steps: steps})
}

func (m *mount) get(p string, s ...step)    { m.handle(http.MethodGet, p, s...) }
func (m *mount) post(p string, s ...step)   { m.handle(http.MethodPost, p, s...) }
func (m *mount) patch(p string, s ...step)  { m.handle(http.MethodPatch, p, s...) }
func (m *mount) delete(p string, s ...step) { m.handle(http.MethodDelete, p, s...) }

func splitPattern(pattern string) []string {
	parts := strings.Split(strings.Trim(pattern, "/"), "/")
	if len(parts) == 1 && parts[0] == "" {
		return nil
	}
	return parts
}

// requestSegments splits the raw (still percent-encoded) path like Express:
// one trailing slash is ignored (non-strict routing).
func requestSegments(r *http.Request) []string {
	path := r.URL.EscapedPath()
	path = strings.TrimPrefix(path, "/")
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		return nil
	}
	return strings.Split(path, "/")
}

func matchPrefix(prefix, segs []string) bool {
	if len(segs) < len(prefix) {
		return false
	}
	for i, p := range prefix {
		if !strings.EqualFold(p, segs[i]) {
			return false
		}
	}
	return true
}

func matchRoute(pattern, segs []string) (map[string]string, bool, error) {
	if len(pattern) != len(segs) {
		return nil, false, nil
	}
	params := map[string]string{}
	for i, p := range pattern {
		if strings.HasPrefix(p, ":") {
			if segs[i] == "" {
				return nil, false, nil
			}
			value, err := url.PathUnescape(segs[i])
			if err != nil {
				return nil, true, httpError(http.StatusBadRequest, "Failed to decode param '"+segs[i]+"'")
			}
			params[p[1:]] = value
			continue
		}
		if !strings.EqualFold(p, segs[i]) {
			return nil, false, nil
		}
	}
	return params, true, nil
}

func methodMatches(routeMethod, requestMethod string) bool {
	if routeMethod == requestMethod {
		return true
	}
	return routeMethod == http.MethodGet && requestMethod == http.MethodHead
}

// dispatch runs the mounted routers in order, then the 404 handler.
func (s *Server) dispatch(c *Ctx) {
	segs := requestSegments(c.r)
	for _, m := range s.mounts {
		if !matchPrefix(m.prefix, segs) {
			continue
		}
		rest := segs[len(m.prefix):]
		for _, st := range m.use {
			if err := st(c); err != nil {
				if !errors.Is(err, errStop) {
					s.handleError(c.w, c.r, err)
				}
				return
			}
		}
		for _, rt := range m.routes {
			if !methodMatches(rt.method, c.r.Method) {
				continue
			}
			params, ok, err := matchRoute(rt.segs, rest)
			if err != nil {
				s.handleError(c.w, c.r, err)
				return
			}
			if !ok {
				continue
			}
			c.params = params
			for _, st := range rt.steps {
				if err := st(c); err != nil {
					if !errors.Is(err, errStop) {
						s.handleError(c.w, c.r, err)
					}
					return
				}
			}
			return
		}
	}
	s.writeBody(c.w, c.r, http.StatusNotFound, O{
		{"success", false}, {"message", "Route " + c.r.URL.RequestURI() + " not found"},
	})
}

// Response helpers bound to the context.

func (c *Ctx) ok(message string, data any) error {
	c.s.ok(c.w, c.r, http.StatusOK, message, data)
	return errStop
}

func (c *Ctx) created(message string, data any) error {
	c.s.ok(c.w, c.r, http.StatusCreated, message, data)
	return errStop
}

func (c *Ctx) okMeta(message string, data any, page, limit any, total int64) error {
	c.s.okMeta(c.w, c.r, message, data, page, limit, total)
	return errStop
}

func (c *Ctx) fail(status int, message string) error {
	c.s.fail(c.w, c.r, status, message)
	return errStop
}

func (c *Ctx) param(name string) string { return c.params[name] }

// queryValue mirrors getSingleString(req.query.x): first value, or
// (_, false) when the key is absent.
func (c *Ctx) queryValue(name string) (string, bool) {
	values, ok := c.query[name]
	if !ok || len(values) == 0 {
		return "", false
	}
	return values[0], true
}

// bodyMap returns req.body as an object (empty when it is not one).
func (c *Ctx) bodyMap() map[string]any {
	if m, ok := c.body.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func (c *Ctx) bodyField(name string) (any, bool) {
	m, ok := c.body.(map[string]any)
	if !ok {
		return nil, false
	}
	v, exists := m[name]
	return v, exists
}
