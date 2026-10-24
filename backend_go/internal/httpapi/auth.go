package httpapi

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"math/big"
	"net/http"
	"strings"
	"time"
)

// Node: src/routes/auth.routes.ts, controllers/auth.controller.ts,
// services/auth.service.ts.

const (
	bcryptSaltRounds        = 12
	refreshTokenExpiryDays  = 30
	passwordResetExpiry     = time.Hour
	dummyPasswordHash       = "$2a$12$dummyhashfordummycomparison00000000000000000000000000"
	roleOrderBy             = " ORDER BY ur.`roleId` ASC"
	userRolesByUserIDsQuery = "SELECT ur.`userId` AS __k, r.`name` FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` IN (%s) ORDER BY ur.`userId`, ur.`roleId`"
)

var (
	loginSchema = zObj(
		required("email", zStr().Email()),
		required("password", zStr().Min(6, "")),
	)
	registerDosenSchema = zObj(
		required("email", zStr().Email()),
		required("name", zStr().Min(2, "")),
		optional("fullName", zStr()),
		required("password", zStr().Min(8, "")),
		optional("nidn", zStr()),
		optional("tempatLahir", zStr()),
		optional("tanggalLahir", zStr().Datetime(false)),
		optional("institusi", zStr()),
		optional("programStudi", zStr()),
		optional("alamat", zStr()),
		optional("kontak", zStr()),
	)
	registerMahasiswaSchema = zObj(
		required("email", zStr().Email()),
		required("name", zStr().Min(2, "")),
		optional("fullName", zStr()),
		required("password", zStr().Min(8, "")),
		optional("nim", zStr()),
		optional("prodi", zStr()),
		optional("noHp", zStr()),
		optional("alamat", zStr()),
	)
	refreshTokenSchema   = zObj(required("refreshToken", zStr().Min(1, "")))
	forgotPasswordSchema = zObj(required("email", zStr().Email()))
	resetPasswordSchema  = zObj(
		required("token", zStr().Min(1, "")),
		required("newPassword", zStr().Min(8, "")),
	)
)

func (s *Server) registerAuthRoutes() {
	g := s.group("/api/v1/auth")
	g.post("/login", s.authLimiter, validateBody(loginSchema), s.login)
	g.post("/refresh", validateBody(refreshTokenSchema), s.refreshToken)
	g.post("/logout", validateBody(refreshTokenSchema), s.logout)
	g.post("/logout-all", s.authenticate, s.logoutAll)
	g.post("/register/dosen", s.registerLimiter, validateBody(registerDosenSchema), s.registerDosen)
	g.post("/register/mahasiswa", s.registerLimiter, validateBody(registerMahasiswaSchema), s.registerMahasiswa)
	g.post("/forgot-password", s.authLimiter, validateBody(forgotPasswordSchema), s.forgotPassword)
	g.post("/reset-password", s.authLimiter, validateBody(resetPasswordSchema), s.resetPassword)
	g.get("/me", s.authenticate, s.me)
	g.post("/verify-email/resend", s.authenticate, s.authLimiter, s.resendVerificationEmail) // baru (W-18)
	g.post("/verify-email", s.authLimiter, validateBody(verifyEmailSchema), s.verifyEmail)   // baru (W-18)
}

type userWithRoles struct {
	ID       int64
	Email    string
	Name     string
	FullName sql.NullString
	Password string
	Status   string
	Roles    []string
}

func (s *Server) findUserWithRoles(ctx context.Context, where string, arg any) (*userWithRoles, error) {
	var u userWithRoles
	err := s.db.QueryRowContext(ctx,
		"SELECT `id`,`email`,`name`,`fullName`,`password`,`status` FROM `User` WHERE "+where+" LIMIT 1", arg).
		Scan(&u.ID, &u.Email, &u.Name, &u.FullName, &u.Password, &u.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.Roles, err = s.rolesOf(ctx, s.db, u.ID)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Server) rolesOf(ctx context.Context, q dbtx, userID int64) ([]string, error) {
	rows, err := q.QueryContext(ctx,
		"SELECT r.`name` FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = ?"+roleOrderBy, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		roles = append(roles, name)
	}
	return roles, rows.Err()
}

// secureDelay mirrors `300 + Math.random() * 200` ms.
func (s *Server) secureDelay() {
	n, _ := rand.Int(rand.Reader, big.NewInt(200))
	s.sleep(300*time.Millisecond + time.Duration(n.Int64())*time.Millisecond)
}

func (s *Server) createTokenPair(ctx context.Context, q dbtx, u *userWithRoles) (string, string, error) {
	access, err := s.signToken(u.ID, u.Email, u.Roles, s.cfg.JWTAccessSecret, s.cfg.JWTAccessExpiry)
	if err != nil {
		return "", "", plainError(err.Error())
	}
	refresh, err := s.signToken(u.ID, u.Email, u.Roles, s.cfg.JWTRefreshSecret, s.cfg.JWTRefreshExpiry)
	if err != nil {
		return "", "", plainError(err.Error())
	}
	now := s.nowMs()
	expiresAt := addDaysLocal(now, refreshTokenExpiryDays)
	if _, err := q.ExecContext(ctx,
		"INSERT INTO `RefreshToken` (`token`,`userId`,`expiresAt`,`revoked`,`createdAt`) VALUES (?,?,?,?,?)",
		refresh, u.ID, expiresAt, false, now); err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

func (s *Server) login(c *Ctx) error {
	body := c.bodyMap()
	email, _ := getString(body, "email")
	password, _ := getString(body, "password")
	ctx := c.r.Context()

	user, err := s.findUserWithRoles(ctx, "`email` = ?", email)
	if err != nil {
		return err
	}
	valid := false
	if user != nil {
		valid = passwordMatches(user.Password, password)
	} else {
		_ = passwordMatches(dummyPasswordHash, password)
	}
	s.secureDelay()
	if user == nil || !valid {
		return plainError("Invalid credentials")
	}
	if user.Status != "approved" {
		return plainError("Account not approved yet")
	}
	access, refresh, err := s.createTokenPair(ctx, s.db, user)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{UserID: user.ID, Action: "LOGIN", Detail: "Login berhasil"}); err != nil {
		return err
	}
	var fullName any
	if user.FullName.Valid {
		fullName = user.FullName.String
	}
	return c.ok("Login successful", O{
		{"accessToken", access},
		{"refreshToken", refresh},
		{"user", O{
			{"id", user.ID}, {"name", user.Name}, {"fullName", fullName},
			{"email", user.Email}, {"status", user.Status}, {"roles", user.Roles},
		}},
	})
}

// requiredStringField mirrors getRequiredStringField in auth.controller.ts.
func requiredStringField(c *Ctx, name string) (string, bool) {
	v, _ := c.bodyField(name)
	s, ok := v.(string)
	if !ok || strings.TrimSpace(s) == "" {
		return "", false
	}
	return s, true
}

func (s *Server) refreshToken(c *Ctx) error {
	token, ok := requiredStringField(c, "refreshToken")
	if !ok {
		return c.fail(http.StatusBadRequest, "Refresh token required")
	}
	ctx := c.r.Context()
	var id int64
	var expiresAt time.Time
	var revoked bool
	err := s.db.QueryRowContext(ctx, "SELECT `id`,`expiresAt`,`revoked` FROM `RefreshToken` WHERE `token` = ?", token).
		Scan(&id, &expiresAt, &revoked)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && (revoked || expiresAt.Before(s.now()))) {
		return plainError("Refresh token invalid or expired")
	}
	if err != nil {
		return err
	}
	payload, err := s.verifyToken(token, s.cfg.JWTRefreshSecret)
	if err != nil {
		return err
	}
	user, err := s.findUserWithRoles(ctx, "`id` = ?", payload.UserID)
	if err != nil {
		return err
	}
	if user == nil {
		return plainError("User not found")
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE `RefreshToken` SET `revoked` = ? WHERE `id` = ?", true, id); err != nil {
		return err
	}
	access, refresh, err := s.createTokenPair(ctx, s.db, user)
	if err != nil {
		return err
	}
	return c.ok("Token refreshed", O{{"accessToken", access}, {"refreshToken", refresh}})
}

func (s *Server) logout(c *Ctx) error {
	token, ok := requiredStringField(c, "refreshToken")
	if !ok {
		return c.fail(http.StatusBadRequest, "Refresh token required")
	}
	if _, err := s.db.ExecContext(c.r.Context(), "UPDATE `RefreshToken` SET `revoked` = ? WHERE `token` = ?", true, token); err != nil {
		return err
	}
	return c.ok("Logged out successfully", noData)
}

func (s *Server) logoutAll(c *Ctx) error {
	if _, err := s.db.ExecContext(c.r.Context(),
		"UPDATE `RefreshToken` SET `revoked` = ? WHERE `userId` = ? AND `revoked` = ?", true, c.user.UserID, false); err != nil {
		return err
	}
	return c.ok("Logged out from all devices", noData)
}

func (s *Server) roleID(ctx context.Context, q dbtx, name string) (int64, error) {
	var id int64
	err := q.QueryRowContext(ctx, "SELECT `id` FROM `Role` WHERE `name` = ?", name).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, notFoundRecord("Role")
	}
	return id, err
}

// registerUser mirrors authService.registerDosen/registerMahasiswa.
func (s *Server) registerUser(c *Ctx, role string, optionalFields []string) error {
	body := c.bodyMap()
	ctx := c.r.Context()
	password, _ := getString(body, "password")
	hash, err := hashPassword(password, bcryptSaltRounds)
	if err != nil {
		return err
	}
	roleID, err := s.roleID(ctx, s.db, role)
	if err != nil {
		return err
	}
	now := s.nowMs()
	columns := []string{"email", "name", "password", "status", "createdAt", "updatedAt"}
	email, _ := getString(body, "email")
	name, _ := getString(body, "name")
	args := []any{email, name, hash, "pending", now, now}
	for _, field := range optionalFields {
		value, ok := getString(body, field)
		if !ok {
			continue
		}
		var arg any = value
		if field == "tanggalLahir" {
			t, err := parseJSDate(value)
			if err != nil {
				return plainError("Invalid value for argument `tanggalLahir`: Provided Date object is invalid.")
			}
			arg = t
		}
		columns = append(columns, field)
		args = append(args, arg)
	}
	quoted := make([]string, len(columns))
	for i, col := range columns {
		quoted[i] = "`" + col + "`"
	}
	var id int64
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, "INSERT INTO `User` ("+strings.Join(quoted, ",")+") VALUES ("+placeholders(len(columns))+")", args...)
		if err != nil {
			return err
		}
		id, err = res.LastInsertId()
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "INSERT INTO `UserRole` (`userId`,`roleId`,`createdAt`) VALUES (?,?,?)", id, roleID, now)
		return err
	})
	if err != nil {
		return err
	}
	var storedEmail, storedName, status string
	if err := s.db.QueryRowContext(ctx, "SELECT `email`,`name`,`status` FROM `User` WHERE `id` = ?", id).Scan(&storedEmail, &storedName, &status); err != nil {
		return err
	}
	return c.created("Registration submitted, awaiting approval", O{
		{"id", id}, {"email", storedEmail}, {"name", storedName}, {"status", status},
	})
}

func (s *Server) registerDosen(c *Ctx) error {
	return s.registerUser(c, "dosen", []string{"fullName", "nidn", "tempatLahir", "tanggalLahir", "institusi", "programStudi", "alamat", "kontak"})
}

func (s *Server) registerMahasiswa(c *Ctx) error {
	return s.registerUser(c, "mahasiswa", []string{"fullName", "nim", "prodi", "noHp", "alamat"})
}

func (s *Server) forgotPassword(c *Ctx) error {
	email, _ := getString(c.bodyMap(), "email")
	ctx := c.r.Context()
	s.secureDelay()
	var userID int64
	var userEmail, name string
	err := s.db.QueryRowContext(ctx, "SELECT `id`,`email`,`name` FROM `User` WHERE `email` = ?", email).Scan(&userID, &userEmail, &name)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		if _, err := s.db.ExecContext(ctx, "UPDATE `PasswordResetToken` SET `used` = ? WHERE `userId` = ? AND `used` = ?", true, userID, false); err != nil {
			return err
		}
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			return err
		}
		token := hex.EncodeToString(raw)
		now := s.nowMs()
		if _, err := s.db.ExecContext(ctx,
			"INSERT INTO `PasswordResetToken` (`token`,`userId`,`expiresAt`,`used`,`createdAt`) VALUES (?,?,?,?,?)",
			token, userID, now.Add(passwordResetExpiry), false, now); err != nil {
			return err
		}
		if err := s.sendPasswordResetEmail(userEmail, name, token); err != nil {
			s.logger.Printf("Failed to send password reset email to=%s error=%v", userEmail, err)
			return plainError("Failed to send reset email")
		}
		s.logger.Printf("Password reset email sent to %s", userEmail)
	}
	return c.ok("If your email is registered, you will receive a reset link", noData)
}

func (s *Server) resetPassword(c *Ctx) error {
	body := c.bodyMap()
	token, _ := getString(body, "token")
	newPassword, _ := getString(body, "newPassword")
	ctx := c.r.Context()
	var id, userID int64
	var expiresAt time.Time
	var used bool
	err := s.db.QueryRowContext(ctx, "SELECT `id`,`userId`,`expiresAt`,`used` FROM `PasswordResetToken` WHERE `token` = ?", token).
		Scan(&id, &userID, &expiresAt, &used)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && (used || expiresAt.Before(s.now()))) {
		return plainError("Token invalid or expired")
	}
	if err != nil {
		return err
	}
	hash, err := hashPassword(newPassword, bcryptSaltRounds)
	if err != nil {
		return err
	}
	now := s.nowMs()
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, "UPDATE `User` SET `password` = ?, `updatedAt` = ? WHERE `id` = ?", hash, now, userID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return notFoundRecord("User")
		}
		if _, err := tx.ExecContext(ctx, "UPDATE `PasswordResetToken` SET `used` = ? WHERE `id` = ?", true, id); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "UPDATE `RefreshToken` SET `revoked` = ? WHERE `userId` = ?", true, userID)
		return err
	})
	if err != nil {
		return err
	}
	return c.ok("Password reset successfully", noData)
}

const meProfileColumns = "u.`nidn`,u.`nim`,u.`prodi`,u.`programStudi`,u.`institusi`,u.`kontak`,u.`noHp`,u.`alamat`,u.`tempatLahir`,u.`tanggalLahir`,u.`jabatanFungsional`," +
	"u.`sintaId`,u.`sintaScore`,(SELECT f.`updatedAt` FROM `UserFoto` f WHERE f.`userId` = u.`id`) AS `__foto`,u.`emailVerifiedAt`"

func (s *Server) me(c *Ctx) error {
	ctx := c.r.Context()
	user, err := s.findUserWithRoles(ctx, "`id` = ?", c.user.UserID)
	if err != nil {
		return err
	}
	count, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ReviewerTugasan` WHERE `reviewerId` = ?", c.user.UserID)
	if err != nil {
		return err
	}
	if user == nil {
		return c.fail(http.StatusNotFound, "User not found")
	}
	var fullName any
	if user.FullName.Valid {
		fullName = user.FullName.String
	}
	data := O{
		{"id", user.ID}, {"name", user.Name}, {"fullName", fullName}, {"email", user.Email},
		{"status", user.Status}, {"roles", user.Roles}, {"hasTugasan", count > 0},
	}
	// W-08 (Go saja): field profil ikut dikirim agar frontend bisa langsung menampilkannya.
	profile, err := queryObj(ctx, s.db, "SELECT "+meProfileColumns+" FROM `User` u WHERE u.`id` = ?", c.user.UserID)
	if err != nil {
		return err
	}
	if profile != nil {
		setFotoURL(&profile, c.user.UserID)
		data = append(data, profile...)
	}
	return c.ok("Current user", data)
}

func (s *Server) sendPasswordResetEmail(to, name, token string) error {
	resetURL := s.cfg.FrontendURL + "/reset-password?token=" + token
	if s.cfg.FrontendURL == "" {
		resetURL = "undefined/reset-password?token=" + token
	}
	return sendSMTP(s.cfg, to, name, resetURL)
}
