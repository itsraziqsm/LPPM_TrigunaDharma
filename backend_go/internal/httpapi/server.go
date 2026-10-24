package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	mysql "github.com/go-sql-driver/mysql"

	"lppm-backend-go/internal/config"
)

type Server struct {
	cfg       config.Config
	db        *sql.DB
	logger    *log.Logger
	accessLog *os.File
	limiter   *rateLimiter
	handler   http.Handler
}

func New(cfg config.Config, db *sql.DB) (*Server, error) {
	if err := os.MkdirAll("logs", 0750); err != nil {
		return nil, fmt.Errorf("create logs directory: %w", err)
	}
	accessLog, err := os.OpenFile(filepath.Join("logs", "access.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0640)
	if err != nil {
		return nil, fmt.Errorf("open access log: %w", err)
	}
	s := &Server{
		cfg: cfg, db: db,
		logger:    log.New(os.Stdout, "", log.LstdFlags|log.LUTC),
		accessLog: accessLog,
		limiter:   newRateLimiter(),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	s.registerAuthRoutes(mux)
	s.registerUserRoutes(mux)
	s.registerSimpleDomainRoutes(mux)
	s.registerProposalRoutes(mux)
	notFound := func(w http.ResponseWriter, r *http.Request) {
		sendError(w, "Route "+r.URL.RequestURI()+" not found", http.StatusNotFound)
	}
	mux.HandleFunc("/api/v1/", notFound)
	mux.HandleFunc("/", notFound)
	s.handler = s.middleware(mux)
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *Server) Close() error {
	return s.accessLog.Close()
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	sendJSON(w, http.StatusOK, map[string]any{
		"success": true, "message": "OK", "timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		w.Header().Set("Content-Security-Policy", "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
		w.Header().Set("Origin-Agent-Cluster", "?1")
		w.Header().Set("X-DNS-Prefetch-Control", "off")
		w.Header().Set("X-Download-Options", "noopen")
		w.Header().Set("X-Permitted-Cross-Domain-Policies", "none")
		w.Header().Set("X-XSS-Protection", "0")
		if s.cfg.NodeEnv == "production" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		origin := r.Header.Get("Origin")
		if s.cfg.CORSOrigin == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin == s.cfg.CORSOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			s.writeAccessLog(r, http.StatusNoContent, started)
			return
		}
		remoteIP := clientIP(r, s.cfg.TrustProxy)
		if !s.limiter.allow("global:"+remoteIP, time.Duration(s.cfg.RateLimitWindowMS)*time.Millisecond, s.cfg.RateLimitMax) {
			w.Header().Set("RateLimit-Policy", fmt.Sprintf("%d;w=%d", s.cfg.RateLimitMax, s.cfg.RateLimitWindowMS/1000))
			sendJSON(w, http.StatusTooManyRequests, responseEnvelope{Success: false, Message: "Too many requests, please try again later."})
			s.writeAccessLog(r, http.StatusTooManyRequests, started)
			return
		}
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		s.writeAccessLog(r, recorder.status, started)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (s *Server) writeAccessLog(r *http.Request, status int, started time.Time) {
	if os.Getenv("BENCHMARK") == "true" {
		return
	}
	ip := clientIP(r, s.cfg.TrustProxy)
	agent := strings.ReplaceAll(r.UserAgent(), `"`, `\"`)
	line := fmt.Sprintf("%s - - [%s] \"%s %s %s\" %d - \"%s\" \"%s\"\n",
		ip, started.Format("02/Jan/2006:15:04:05 -0700"), r.Method, r.URL.RequestURI(), r.Proto,
		status, r.Referer(), agent)
	if _, err := s.accessLog.WriteString(line); err != nil {
		s.logger.Printf("failed to write access log: %v", err)
	}
	if s.cfg.NodeEnv != "production" {
		s.logger.Printf("%s %s %d %s", r.Method, r.URL.RequestURI(), status, time.Since(started).Round(time.Millisecond))
	}
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") || strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")) == "" {
			sendError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		claims, err := s.verifyToken(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), s.cfg.JWTAccessSecret)
		if err != nil {
			sendError(w, "Token invalid or expired", http.StatusUnauthorized)
			return
		}
		s.logger.Printf("auth_access userId=%d email=%s method=%s path=%s ip=%s userAgent=%q",
			claims.UserID, claims.Email, r.Method, r.URL.RequestURI(), clientIP(r, s.cfg.TrustProxy), r.UserAgent())
		ctx := contextWithUser(r, claims)
		next(w, r.WithContext(ctx))
	}
}

func (s *Server) requireRoles(next http.HandlerFunc, allowed ...string) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(authContextKey{}).(*tokenPayload)
		if !ok {
			sendError(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		for _, userRole := range claims.Roles {
			for _, role := range allowed {
				if userRole == role {
					next(w, r)
					return
				}
			}
		}
		sendError(w, "Forbidden: insufficient permissions", http.StatusForbidden)
	})
}

func currentUser(r *http.Request) *tokenPayload {
	user, _ := r.Context().Value(authContextKey{}).(*tokenPayload)
	return user
}

func contextWithUser(r *http.Request, user *tokenPayload) context.Context {
	return context.WithValue(r.Context(), authContextKey{}, user)
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			return strings.TrimSpace(strings.Split(forwarded, ",")[0])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func isDuplicateEntry(err error) bool {
	var mysqlErr *mysql.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1062
}

func (s *Server) authLimited(next http.HandlerFunc) http.HandlerFunc {
	return s.limit(next, 10, 15*time.Minute, "auth")
}

func (s *Server) registerLimited(next http.HandlerFunc) http.HandlerFunc {
	return s.limit(next, 5, time.Hour, "register")
}

func (s *Server) limit(next http.HandlerFunc, max int, window time.Duration, kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		message := "Too many attempts, try again in 15 minutes."
		if kind == "register" {
			message = "Too many registrations from this IP."
		}
		if !s.limiter.allow(kind+":"+clientIP(r, s.cfg.TrustProxy), window, max) {
			sendJSON(w, http.StatusTooManyRequests, responseEnvelope{Success: false, Message: message})
			return
		}
		next(w, r)
	}
}

type rateRecord struct {
	start time.Time
	count int
}

type rateLimiter struct {
	mu      sync.Mutex
	records map[string]rateRecord
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{records: make(map[string]rateRecord)}
}

func (l *rateLimiter) allow(key string, window time.Duration, max int) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	record := l.records[key]
	if record.start.IsZero() || now.Sub(record.start) >= window {
		record = rateRecord{start: now}
	}
	if record.count >= max {
		l.records[key] = record
		return false
	}
	record.count++
	l.records[key] = record
	if len(l.records) > 10000 {
		for k, v := range l.records {
			if now.Sub(v.start) > window {
				delete(l.records, k)
			}
		}
	}
	return true
}