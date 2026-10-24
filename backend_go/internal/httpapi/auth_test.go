package httpapi

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"lppm-backend-go/internal/config"
)

func TestHealthResponseContract(t *testing.T) {
	recorder := httptest.NewRecorder()
	s := &Server{}

	s.health(recorder, httptest.NewRequest(http.MethodGet, "/health", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["success"] != true || body["message"] != "OK" {
		t.Fatalf("unexpected health response: %#v", body)
	}
	if _, ok := body["timestamp"].(string); !ok {
		t.Fatalf("timestamp missing or not a string: %#v", body["timestamp"])
	}
}

func TestAccessTokenVerificationAndAuthMiddleware(t *testing.T) {
	db, err := sql.Open("mysql", "user:password@tcp(localhost:3306)/db")
	if err != nil {
		t.Fatalf("create sql mock: %v", err)
	}
	defer db.Close()

	s := &Server{
		cfg:    config.Config{JWTAccessSecret: "access-secret", TrustProxy: false},
		db:     db,
		logger: log.New(io.Discard, "", 0),
	}
	user := &authUser{ID: 42, Email: "dosen@example.com", Roles: []string{"dosen"}}
	token, err := s.signToken(user, s.cfg.JWTAccessSecret, testFuture())
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	claims, err := s.verifyToken(token, s.cfg.JWTAccessSecret)
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if claims.UserID != user.ID || claims.Email != user.Email || !reflect.DeepEqual(claims.Roles, user.Roles) {
		t.Fatalf("claims = %#v, want user identity and roles", claims)
	}

	called := false
	handler := s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if currentUser(r).UserID != user.ID {
			t.Errorf("authenticated user ID = %d, want %d", currentUser(r).UserID, user.ID)
		}
		w.WriteHeader(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodGet, "/private", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	recorder := httptest.NewRecorder()
	handler(recorder, request)
	if !called || recorder.Code != http.StatusNoContent {
		t.Fatalf("middleware result called=%v status=%d", called, recorder.Code)
	}
}

func TestAuthMiddlewareRejectsMissingBearer(t *testing.T) {
	s := &Server{cfg: config.Config{JWTAccessSecret: "access-secret"}}
	handler := s.requireAuth(func(http.ResponseWriter, *http.Request) {
		t.Fatal("protected handler should not be called")
	})
	recorder := httptest.NewRecorder()
	handler(recorder, httptest.NewRequest(http.MethodGet, "/private", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
	var body responseEnvelope
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Success || body.Message != "Unauthorized" {
		t.Fatalf("unexpected error response: %#v", body)
	}
}

func TestAllDomainRoutesRegisterWithoutConflicts(t *testing.T) {
	mux := http.NewServeMux()
	s := &Server{}
	s.registerAuthRoutes(mux)
	s.registerUserRoutes(mux)
	s.registerSimpleDomainRoutes(mux)
	s.registerProposalRoutes(mux)
}

func testFuture() time.Time { return time.Now().Add(time.Hour) }
