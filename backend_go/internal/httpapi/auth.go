package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type authContextKey struct{}

type tokenPayload struct {
	UserID int64    `json:"userId"`
	Email  string   `json:"email"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}

type authUser struct {
	ID       int64
	Email    string
	Name     string
	FullName sql.NullString
	Password string
	Status   string
	Roles    []string
}

func (s *Server) registerAuthRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/auth/login", s.authLimited(s.login))
	mux.HandleFunc("POST /api/v1/auth/refresh", s.refreshToken)
	mux.HandleFunc("POST /api/v1/auth/logout", s.logout)
	mux.HandleFunc("POST /api/v1/auth/logout-all", s.requireAuth(s.logoutAll))
	mux.HandleFunc("POST /api/v1/auth/register/dosen", s.registerLimited(s.registerDosen))
	mux.HandleFunc("POST /api/v1/auth/register/mahasiswa", s.registerLimited(s.registerMahasiswa))
	mux.HandleFunc("POST /api/v1/auth/forgot-password", s.authLimited(s.forgotPassword))
	mux.HandleFunc("POST /api/v1/auth/reset-password", s.authLimited(s.resetPassword))
	mux.HandleFunc("GET /api/v1/auth/me", s.requireAuth(s.me))
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain only one JSON value")
	}
	return nil
}

func validateEmail(value string) bool {
	address, err := mail.ParseAddress(value)
	return err == nil && address.Address == value
}

func validateRequiredString(value string, min int) bool {
	return len(strings.TrimSpace(value)) >= min
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	if !validateEmail(body.Email) {
		validationError(w, "email", "Invalid email")
		return
	}
	if len(body.Password) < 6 {
		validationError(w, "password", "Password must contain at least 6 characters")
		return
	}

	user, err := s.findUserByEmail(r.Context(), body.Email)
	passwordHash := "$2a$12$dummyhashfordummycomparison00000000000000000000000000"
	if err == nil {
		passwordHash = user.Password
	} else if !errors.Is(err, sql.ErrNoRows) {
		s.internalError(w, r, err)
		return
	}
	passwordErr := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(body.Password))
	time.Sleep(300*time.Millisecond + time.Duration(time.Now().UnixNano()%200_000_000))
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		s.internalError(w, r, err)
		return
	}
	if errors.Is(err, sql.ErrNoRows) || passwordErr != nil {
		s.internalError(w, r, errors.New("Invalid credentials"))
		return
	}
	if user.Status != "approved" {
		s.internalError(w, r, errors.New("Account not approved yet"))
		return
	}

	access, refresh, err := s.issueTokenPair(r.Context(), user)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if err := s.logActivity(r.Context(), user.ID, "LOGIN", "Login berhasil", clientIP(r, s.cfg.TrustProxy), r.UserAgent()); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Login successful", map[string]any{
		"accessToken":  access,
		"refreshToken": refresh,
		"user": map[string]any{
			"id": user.ID, "name": user.Name, "fullName": nullString(user.FullName),
			"email": user.Email, "status": user.Status, "roles": user.Roles,
		},
	}, http.StatusOK)
}

func (s *Server) refreshToken(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	if body.RefreshToken == "" {
		validationError(w, "refreshToken", "Refresh token is required")
		return
	}

	var id, userID int64
	var expires time.Time
	var revoked bool
	err := s.db.QueryRowContext(r.Context(),
		"SELECT id, userId, expiresAt, revoked FROM RefreshToken WHERE token = ?",
		body.RefreshToken,
	).Scan(&id, &userID, &expires, &revoked)
	if err != nil || revoked || !expires.After(time.Now()) {
		s.internalError(w, r, errors.New("Refresh token invalid or expired"))
		return
	}
	user, err := s.findUserByID(r.Context(), userID)
	if err != nil {
		s.internalError(w, r, errors.New("User not found"))
		return
	}
	if _, err := s.verifyToken(body.RefreshToken, s.cfg.JWTRefreshSecret); err != nil {
		s.internalError(w, r, errors.New("Refresh token invalid or expired"))
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "UPDATE RefreshToken SET revoked = TRUE WHERE id = ?", id); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	access, refresh, err := s.createTokenPairTx(r.Context(), tx, user)
	if err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if err := tx.Commit(); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Token refreshed", map[string]string{"accessToken": access, "refreshToken": refresh}, http.StatusOK)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	if body.RefreshToken == "" {
		validationError(w, "refreshToken", "Refresh token is required")
		return
	}
	if _, err := s.db.ExecContext(r.Context(), "UPDATE RefreshToken SET revoked = TRUE WHERE token = ?", body.RefreshToken); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Logged out successfully", nil, http.StatusOK)
}

func (s *Server) logoutAll(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if _, err := s.db.ExecContext(r.Context(), "UPDATE RefreshToken SET revoked = TRUE WHERE userId = ? AND revoked = FALSE", user.UserID); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Logged out from all devices", nil, http.StatusOK)
}

func (s *Server) registerDosen(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email        string  `json:"email"`
		Name         string  `json:"name"`
		FullName     *string `json:"fullName"`
		Password     string  `json:"password"`
		NIDN         *string `json:"nidn"`
		TempatLahir  *string `json:"tempatLahir"`
		TanggalLahir *string `json:"tanggalLahir"`
		Institusi    *string `json:"institusi"`
		ProgramStudi *string `json:"programStudi"`
		Alamat       *string `json:"alamat"`
		Kontak       *string `json:"kontak"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	if !validateEmail(body.Email) {
		validationError(w, "email", "Invalid email")
		return
	}
	if !validateRequiredString(body.Name, 2) {
		validationError(w, "name", "Name must contain at least 2 characters")
		return
	}
	if len(body.Password) < 8 {
		validationError(w, "password", "Password must contain at least 8 characters")
		return
	}
	var birth any
	if body.TanggalLahir != nil {
		parsed, err := time.Parse(time.RFC3339Nano, *body.TanggalLahir)
		if err != nil {
			sendError(w, "Validation failed", http.StatusBadRequest)
			return
		}
		birth = parsed
	}
	id, err := s.registerUser(r.Context(), "dosen", []string{"email", "name", "fullName", "password", "nidn", "tempatLahir", "tanggalLahir", "institusi", "programStudi", "alamat", "kontak"},
		[]any{body.Email, body.Name, body.FullName, body.Password, body.NIDN, body.TempatLahir, birth, body.Institusi, body.ProgramStudi, body.Alamat, body.Kontak})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Registration submitted, awaiting approval", map[string]any{"id": id, "email": body.Email, "name": body.Name, "status": "pending"}, http.StatusCreated)
}

func (s *Server) registerMahasiswa(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string  `json:"email"`
		Name     string  `json:"name"`
		FullName *string `json:"fullName"`
		Password string  `json:"password"`
		NIM      *string `json:"nim"`
		Prodi    *string `json:"prodi"`
		NoHP     *string `json:"noHp"`
		Alamat   *string `json:"alamat"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	if !validateEmail(body.Email) {
		validationError(w, "email", "Invalid email")
		return
	}
	if !validateRequiredString(body.Name, 2) {
		validationError(w, "name", "Name must contain at least 2 characters")
		return
	}
	if len(body.Password) < 8 {
		validationError(w, "password", "Password must contain at least 8 characters")
		return
	}
	id, err := s.registerUser(r.Context(), "mahasiswa", []string{"email", "name", "fullName", "password", "nim", "prodi", "noHp", "alamat"},
		[]any{body.Email, body.Name, body.FullName, body.Password, body.NIM, body.Prodi, body.NoHP, body.Alamat})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Registration submitted, awaiting approval", map[string]any{"id": id, "email": body.Email, "name": body.Name, "status": "pending"}, http.StatusCreated)
}

func (s *Server) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	if !validateEmail(body.Email) {
		validationError(w, "email", "Invalid email")
		return
	}
	time.Sleep(300*time.Millisecond + time.Duration(time.Now().UnixNano()%200_000_000))
	var id int64
	var name string
	err := s.db.QueryRowContext(r.Context(), "SELECT id, name FROM User WHERE email = ?", body.Email).Scan(&id, &name)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		s.internalError(w, r, err)
		return
	}
	if err == nil {
		tx, err := s.db.BeginTx(r.Context(), nil)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
		if _, err = tx.ExecContext(r.Context(), "UPDATE PasswordResetToken SET used = TRUE WHERE userId = ? AND used = FALSE", id); err != nil {
			tx.Rollback()
			s.internalError(w, r, err)
			return
		}
		raw := make([]byte, 32)
		if _, err = rand.Read(raw); err != nil {
			tx.Rollback()
			s.internalError(w, r, err)
			return
		}
		token := hex.EncodeToString(raw)
		if _, err = tx.ExecContext(r.Context(), "INSERT INTO PasswordResetToken (token, userId, expiresAt, used, createdAt) VALUES (?, ?, ?, FALSE, NOW())", token, id, time.Now().Add(time.Hour)); err != nil {
			tx.Rollback()
			s.internalError(w, r, err)
			return
		}
		if err = tx.Commit(); err != nil {
			s.internalError(w, r, err)
			return
		}
		if err := s.sendPasswordResetEmail(body.Email, name, token); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	sendSuccess(w, "If your email is registered, you will receive a reset link", nil, http.StatusOK)
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if decodeJSON(w, r, &body) != nil {
		validationError(w, "body", "Invalid JSON body")
		return
	}
	if body.Token == "" {
		validationError(w, "token", "Token is required")
		return
	}
	if len(body.NewPassword) < 8 {
		validationError(w, "newPassword", "Password must contain at least 8 characters")
		return
	}
	var id, userID int64
	var expires time.Time
	var used bool
	err := s.db.QueryRowContext(r.Context(), "SELECT id, userId, expiresAt, used FROM PasswordResetToken WHERE token = ?", body.Token).Scan(&id, &userID, &expires, &used)
	if err != nil || used || !expires.After(time.Now()) {
		s.internalError(w, r, errors.New("Token invalid or expired"))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcryptCost)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "UPDATE User SET password = ? WHERE id = ?", string(hash), userID); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "UPDATE PasswordResetToken SET used = TRUE WHERE id = ?", id); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if _, err = tx.ExecContext(r.Context(), "UPDATE RefreshToken SET revoked = TRUE WHERE userId = ?", userID); err != nil {
		tx.Rollback()
		s.internalError(w, r, err)
		return
	}
	if err = tx.Commit(); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Password reset successfully", nil, http.StatusOK)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	var name string
	var fullName sql.NullString
	var email, status string
	if err := s.db.QueryRowContext(r.Context(), "SELECT name, fullName, email, status FROM User WHERE id = ?", user.UserID).Scan(&name, &fullName, &email, &status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			sendError(w, "User not found", http.StatusNotFound)
		} else {
			s.internalError(w, r, err)
		}
		return
	}
	rows, err := s.db.QueryContext(r.Context(), "SELECT r.name FROM Role r JOIN UserRole ur ON ur.roleId = r.id WHERE ur.userId = ?", user.UserID)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	defer rows.Close()
	roles := make([]string, 0, 2)
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			s.internalError(w, r, err)
			return
		}
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		s.internalError(w, r, err)
		return
	}
	var taskCount int
	if err := s.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM ReviewerTugasan WHERE reviewerId = ?", user.UserID).Scan(&taskCount); err != nil {
		s.internalError(w, r, err)
		return
	}
	sendSuccess(w, "Current user", map[string]any{
		"id": user.UserID, "name": name, "fullName": nullString(fullName), "email": email, "status": status,
		"roles": roles, "hasTugasan": taskCount > 0,
	}, http.StatusOK)
}

const bcryptCost = 12

func (s *Server) findUserByEmail(ctx context.Context, email string) (*authUser, error) {
	var user authUser
	err := s.db.QueryRowContext(ctx, "SELECT id, email, name, fullName, password, status FROM User WHERE email = ?", email).
		Scan(&user.ID, &user.Email, &user.Name, &user.FullName, &user.Password, &user.Status)
	if err != nil {
		return nil, err
	}
	user.Roles, err = s.userRoles(ctx, user.ID)
	return &user, err
}

func (s *Server) findUserByID(ctx context.Context, id int64) (*authUser, error) {
	var user authUser
	err := s.db.QueryRowContext(ctx, "SELECT id, email, name, fullName, password, status FROM User WHERE id = ?", id).
		Scan(&user.ID, &user.Email, &user.Name, &user.FullName, &user.Password, &user.Status)
	if err != nil {
		return nil, err
	}
	user.Roles, err = s.userRoles(ctx, user.ID)
	return &user, err
}

func (s *Server) userRoles(ctx context.Context, userID int64) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT r.name FROM Role r JOIN UserRole ur ON ur.roleId = r.id WHERE ur.userId = ?", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := make([]string, 0, 2)
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func (s *Server) issueTokenPair(ctx context.Context, user *authUser) (string, string, error) {
	return s.createTokenPair(ctx, nil, user)
}

func (s *Server) createTokenPairTx(ctx context.Context, tx *sql.Tx, user *authUser) (string, string, error) {
	return s.createTokenPair(ctx, tx, user)
}

func (s *Server) createTokenPair(ctx context.Context, tx *sql.Tx, user *authUser) (string, string, error) {
	now := time.Now()
	accessExpiry, err := parseDuration(s.cfg.JWTAccessExpiry)
	if err != nil {
		return "", "", err
	}
	refreshExpiry, err := parseDuration(s.cfg.JWTRefreshExpiry)
	if err != nil {
		return "", "", err
	}
	access, err := s.signToken(user, s.cfg.JWTAccessSecret, now.Add(accessExpiry))
	if err != nil {
		return "", "", err
	}
	refresh, err := s.signToken(user, s.cfg.JWTRefreshSecret, now.Add(refreshExpiry))
	if err != nil {
		return "", "", err
	}
	expiresAt := now.Add(30 * 24 * time.Hour)
	if tx == nil {
		_, err = s.db.ExecContext(ctx, "INSERT INTO RefreshToken (token, userId, expiresAt, revoked, createdAt) VALUES (?, ?, ?, FALSE, NOW())", refresh, user.ID, expiresAt)
	} else {
		_, err = tx.ExecContext(ctx, "INSERT INTO RefreshToken (token, userId, expiresAt, revoked, createdAt) VALUES (?, ?, ?, FALSE, NOW())", refresh, user.ID, expiresAt)
	}
	return access, refresh, err
}

func (s *Server) signToken(user *authUser, secret string, expiry time.Time) (string, error) {
	claims := tokenPayload{
		UserID: user.ID, Email: user.Email, Roles: user.Roles,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(expiry)},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

func (s *Server) verifyToken(token, secret string) (*tokenPayload, error) {
	claims := &tokenPayload{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (s *Server) registerUser(ctx context.Context, role string, fields []string, values []any) (int64, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(values[3].(string)), bcryptCost)
	if err != nil {
		return 0, err
	}
	values[3] = string(hash)
	columns := append(append([]string{}, fields...), "status", "createdAt", "updatedAt")
	marks := strings.TrimSuffix(strings.Repeat("?,", len(columns)), ",")
	quoted := make([]string, len(columns))
	for i, field := range columns {
		quoted[i] = "`" + field + "`"
	}
	args := append(values, "pending", time.Now(), time.Now())
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	result, err := tx.ExecContext(ctx, "INSERT INTO User ("+strings.Join(quoted, ",")+") VALUES ("+marks+")", args...)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO UserRole (userId, roleId, createdAt) SELECT ?, id, NOW() FROM Role WHERE name = ?",
		id, role,
	); err != nil {
		tx.Rollback()
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

func (s *Server) logActivity(ctx context.Context, userID int64, action, detail, ip, userAgent string) error {
	_, err := s.db.ExecContext(ctx, "INSERT INTO ActivityLog (userId, action, detail, ipAddress, userAgent, createdAt) VALUES (?, ?, ?, ?, ?, NOW())",
		userID, action, detail, ip, userAgent)
	return err
}

func nullString(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}

func parseDuration(value string) (time.Duration, error) {
	if duration, err := time.ParseDuration(value); err == nil {
		return duration, nil
	}
	if strings.HasSuffix(value, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(value, "d"))
		if err != nil || days <= 0 {
			return 0, fmt.Errorf("invalid token duration %q", value)
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return 0, fmt.Errorf("invalid token duration %q", value)
}

func (s *Server) sendPasswordResetEmail(to, name, token string) error {
	if s.cfg.SMTPHost == "" {
		return errors.New("SMTP_HOST is required to send reset email")
	}
	resetURL := strings.TrimRight(s.cfg.FrontendURL, "/") + "/reset-password?token=" + url.QueryEscape(token)
	return sendSMTP(s.cfg, to, name, resetURL)
}

func (s *Server) internalError(w http.ResponseWriter, r *http.Request, err error) {
	s.logger.Printf("request error method=%s path=%s: %v", r.Method, r.URL.Path, err)
	status := http.StatusInternalServerError
	message := err.Error()
	if isDuplicateEntry(err) {
		status, message = http.StatusConflict, "Resource already exists"
	} else {
		var apiErr *requestError
		if errors.As(err, &apiErr) {
			status, message = apiErr.status, apiErr.message
		}
	}
	if status == http.StatusInternalServerError && s.cfg.NodeEnv == "production" {
		message = "Internal server error"
	}
	if s.cfg.NodeEnv == "production" || status == http.StatusConflict {
		sendError(w, message, status)
		return
	}
	sendJSON(w, status, responseEnvelope{
		Success: false, Message: message, Stack: string(debug.Stack()),
	})
}

type requestError struct {
	message string
	status  int
}

func (e *requestError) Error() string { return e.message }
