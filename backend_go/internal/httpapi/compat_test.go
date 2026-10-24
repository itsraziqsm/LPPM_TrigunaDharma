package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"lppm-backend-go/internal/config"
)

func testServer() *Server {
	s := newServer(config.Config{
		NodeEnv: "development", CORSOrigin: "http://localhost:5173",
		JWTAccessSecret: "access", JWTRefreshSecret: "refresh",
		JWTAccessExpiry: "15m", JWTRefreshExpiry: "7d",
		RateLimitWindowMS: 900000, RateLimitMax: 1000,
	}, nil)
	s.logger = log.New(io.Discard, "", 0)
	return s
}

func do(s *Server, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, r)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	return rec
}

func TestJSONMatchesPrismaSerialisation(t *testing.T) {
	ts := time.Date(2026, 5, 16, 4, 53, 59, 123456789, time.FixedZone("WIB", 7*3600))
	out, err := encodeJSON(O{
		{"b", true}, {"a", Decimal("15000000.00")}, {"d", Decimal("1234.50")},
		{"t", JSTime(ts)}, {"blob", Bytes{37, 80}}, {"n", nil}, {"s", "<&>"},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"b":true,"a":"15000000","d":"1234.5","t":"2026-05-15T21:53:59.123Z","blob":{"0":37,"1":80},"n":null,"s":"<&>"}`
	if string(out) != want {
		t.Fatalf("got  %s\nwant %s", out, want)
	}
}

func TestZodMessages(t *testing.T) {
	_, issues := safeParse(loginSchema, map[string]any{"email": "nope", "password": 5.0})
	got, _ := encodeJSON(fieldErrors(issues))
	want := `{"email":["Invalid email"],"password":["Expected string, received number"]}`
	if string(got) != want {
		t.Fatalf("got %s want %s", got, want)
	}
	_, issues = safeParse(periodeSchema, map[string]any{"nama": "Periode", "tahun": 2026.5, "jenis": "penelitian", "tanggalMulai": "2026-02-30", "tanggalSelesai": "2026-01-01T00:00:00+07:00"})
	got, _ = encodeJSON(fieldErrors(issues))
	want = `{"tahun":["Expected integer, received float"],"tanggalMulai":["Invalid datetime"]}`
	if string(got) != want {
		t.Fatalf("got %s want %s", got, want)
	}
	if _, issues := safeParse(paginationSchema, map[string]any{"page": "2", "limit": "abc"}); issues == nil || issues[0].message != "Expected number, received nan" {
		t.Fatalf("coerce issues = %#v", issues)
	}
}

func TestFileTypeDetection(t *testing.T) {
	var docx bytes.Buffer
	zw := zip.NewWriter(&docx)
	for _, name := range []string{"[Content_Types].xml", "_rels/.rels", "word/document.xml"} {
		w, _ := zw.Create(name)
		w.Write([]byte("<x/>"))
	}
	zw.Close()
	var plainZip bytes.Buffer
	zw = zip.NewWriter(&plainZip)
	w, _ := zw.Create("readme.txt")
	w.Write([]byte("hello"))
	zw.Close()
	cases := map[string][]byte{
		"application/pdf": []byte("%PDF-1.7\n..."),
		mimeDOCX:          docx.Bytes(),
		"application/zip": plainZip.Bytes(),
		"image/png":       {0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0},
		"":                []byte("<html></html>"),
	}
	for want, data := range cases {
		if got := detectFileType(data); got != want {
			t.Errorf("detectFileType = %q, want %q", got, want)
		}
	}
	if _, err := validateFileIsAllowedDocument([]byte("plain text")); err == nil || err.Error() != "Tidak dapat mendeteksi tipe file. Pastikan file tidak corrupt." {
		t.Fatalf("unexpected error %v", err)
	}
}

func TestIndonesianFormatting(t *testing.T) {
	if got := formatIDNumber(15000000.5); got != "15.000.000,5" {
		t.Fatalf("formatIDNumber = %s", got)
	}
	if got := formatIDNumber(1234.5678); got != "1.234,568" {
		t.Fatalf("formatIDNumber = %s", got)
	}
	if got := formatIDNumber(0); got != "0" {
		t.Fatalf("formatIDNumber(0) = %s", got)
	}
	d := time.Date(2026, 3, 5, 12, 0, 0, 0, time.Local)
	if got := formatIDDate(d); got != "5/3/2026" {
		t.Fatalf("formatIDDate = %s", got)
	}
}

func TestJWTCompatibility(t *testing.T) {
	s := testServer()
	for in, want := range map[string]time.Duration{"15m": 15 * time.Minute, "7d": 7 * 24 * time.Hour, "1h": time.Hour, "30 days": 30 * 24 * time.Hour, "60000": time.Minute} {
		got, err := msDuration(in)
		if err != nil || got != want {
			t.Errorf("msDuration(%q) = %v, %v", in, got, err)
		}
	}
	token, err := s.signToken(7, "a@b.c", []string{"dosen", "reviewer"}, "access", "15m")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := s.verifyToken(token, "access")
	if err != nil || claims.UserID != 7 || claims.Email != "a@b.c" || len(claims.Roles) != 2 || claims.IssuedAt == nil {
		t.Fatalf("claims = %#v, err = %v", claims, err)
	}
	if _, err := s.verifyToken(token, "wrong"); err == nil || err.Error() != "invalid signature" {
		t.Fatalf("wrong secret error = %v", err)
	}
}

func TestBcryptAcceptsBcryptjsHashes(t *testing.T) {
	hash, err := hashPassword("rahasia123", 4)
	if err != nil {
		t.Fatal(err)
	}
	// bcryptjs v3 emits "$2b$" hashes; the algorithm is identical.
	if !passwordMatches("$2b$"+hash[4:], "rahasia123") || passwordMatches(hash, "salah") {
		t.Fatal("bcrypt compatibility check failed")
	}
	long := strings.Repeat("x", 80)
	hash, err = hashPassword(long, 4)
	if err != nil || !passwordMatches(hash, long) {
		t.Fatalf("long passwords must be truncated like bcryptjs: %v", err)
	}
}

func TestHTTPBehaviourWithoutDatabase(t *testing.T) {
	s := testServer()

	rec := do(s, http.MethodGet, "/health", "", nil)
	if rec.Code != 200 || !strings.HasPrefix(rec.Body.String(), `{"success":true,"message":"OK","timestamp":"`) {
		t.Fatalf("health: %d %s", rec.Code, rec.Body)
	}
	if rec.Header().Get("X-Frame-Options") != "SAMEORIGIN" || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("missing helmet/cors headers: %v", rec.Header())
	}

	rec = do(s, http.MethodGet, "/api/v1/unknown?x=1", "", nil)
	if rec.Code != 404 || rec.Body.String() != `{"success":false,"message":"Route /api/v1/unknown?x=1 not found"}` {
		t.Fatalf("404: %d %s", rec.Code, rec.Body)
	}

	rec = do(s, http.MethodGet, "/api/v1/proposals/1/anything/else", "", nil)
	if rec.Code != 401 || rec.Body.String() != `{"success":false,"message":"Unauthorized"}` {
		t.Fatalf("router.use(authenticate) should run first: %d %s", rec.Code, rec.Body)
	}

	rec = do(s, http.MethodPost, "/api/v1/auth/login", `{}`, nil)
	if rec.Code != 422 || rec.Body.String() != `{"success":false,"message":"Validation error","errors":{"email":["Required"],"password":["Required"]}}` {
		t.Fatalf("validation: %d %s", rec.Code, rec.Body)
	}

	rec = do(s, http.MethodPost, "/api/v1/auth/login", `{"email":`, nil)
	if rec.Code != 400 {
		t.Fatalf("bad json: %d %s", rec.Code, rec.Body)
	}

	rec = do(s, http.MethodOptions, "/api/v1/auth/login", "", map[string]string{"Origin": "http://localhost:5173"})
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Methods") != "GET,POST,PUT,PATCH,DELETE" {
		t.Fatalf("preflight: %d %v", rec.Code, rec.Header())
	}

	token, _ := s.signToken(1, "dosen@lppm.dev", []string{"dosen"}, "access", "15m")
	rec = do(s, http.MethodGet, "/api/v1/dashboard/stats", "", map[string]string{"Authorization": "Bearer " + token})
	if rec.Code != 403 || rec.Body.String() != `{"success":false,"message":"Forbidden: insufficient permissions"}` {
		t.Fatalf("authorize: %d %s", rec.Code, rec.Body)
	}
	rec = do(s, http.MethodGet, "/api/v1/users/abc", "", map[string]string{"Authorization": "Bearer " + token})
	if rec.Code != 403 {
		t.Fatalf("role check before param parsing: %d %s", rec.Code, rec.Body)
	}

	rec = do(s, http.MethodGet, "/health", "", map[string]string{"If-None-Match": rec.Header().Get("ETag")})
	etag := rec.Header().Get("ETag")
	rec = do(s, http.MethodGet, "/api/v1/unknown", "", nil)
	first := rec.Header().Get("ETag")
	rec = do(s, http.MethodGet, "/api/v1/unknown", "", map[string]string{"If-None-Match": first})
	if etag == "" || rec.Code != 404 {
		t.Fatalf("etag handling: %q %d", etag, rec.Code)
	}

	var body map[string]any
	rec = do(s, http.MethodGet, "/api/v1/auth/me", "", map[string]string{"Authorization": "Bearer nope"})
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if rec.Code != 401 || body["message"] != "Token invalid or expired" {
		t.Fatalf("bad token: %d %s", rec.Code, rec.Body)
	}
}

func TestProductionHidesErrorMessages(t *testing.T) {
	s := testServer()
	s.cfg.NodeEnv = "production"
	rec := httptest.NewRecorder()
	s.handleError(rec, httptest.NewRequest(http.MethodGet, "/", nil), httpError(404, "User not found"))
	if rec.Code != 404 || rec.Body.String() != `{"success":false,"message":"Internal server error"}` {
		t.Fatalf("production error: %d %s", rec.Code, rec.Body)
	}
}
