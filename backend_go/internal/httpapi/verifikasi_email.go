package httpapi

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"time"
)

// Verifikasi email opsional (W-18). Tidak ada padanannya di Node; login tetap
// bisa walau email belum terverifikasi. Status ada di `emailVerifiedAt`
// (/auth/me & profil). Dokumentasi untuk frontend di new-api.md bagian 12.

const emailVerificationExpiry = 24 * time.Hour

var verifyEmailSchema = zObj(required("token", zStr().Min(1, "Token wajib diisi")))

// resendVerificationEmail creates a new token (older unused ones are
// invalidated) and emails the link FRONTEND_URL/verify-email?token=...
func (s *Server) resendVerificationEmail(c *Ctx) error {
	ctx := c.r.Context()
	uid := c.user.UserID
	var email, name string
	var verified sql.NullTime
	err := s.db.QueryRowContext(ctx, "SELECT `email`,`name`,`emailVerifiedAt` FROM `User` WHERE `id` = ?", uid).Scan(&email, &name, &verified)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError(http.StatusNotFound, "User not found")
	}
	if err != nil {
		return err
	}
	if verified.Valid {
		return httpError(http.StatusBadRequest, "Email sudah terverifikasi")
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := hex.EncodeToString(raw)
	now := s.nowMs()
	if _, err := s.db.ExecContext(ctx, "UPDATE `EmailVerificationToken` SET `used` = true WHERE `userId` = ? AND `used` = false", uid); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx,
		"INSERT INTO `EmailVerificationToken` (`token`,`userId`,`expiresAt`,`used`,`createdAt`) VALUES (?,?,?,?,?)",
		token, uid, now.Add(emailVerificationExpiry), false, now); err != nil {
		return err
	}
	if err := s.sendVerificationEmail(email, name, token); err != nil {
		s.logger.Printf("Failed to send verification email to=%s error=%v", email, err)
		return httpError(http.StatusBadGateway, "Gagal mengirim email verifikasi. Coba lagi nanti.")
	}
	return c.ok("Email verifikasi telah dikirim ke "+email, noData)
}

// sendVerificationEmail sends the link. Outside production, an empty
// SMTP_HOST only logs the link (pengembangan lokal tanpa SMTP).
func (s *Server) sendVerificationEmail(to, name, token string) error {
	link := s.cfg.FrontendURL + "/verify-email?token=" + token
	if s.cfg.SMTPHost == "" && s.cfg.NodeEnv != "production" {
		s.logger.Printf("[dev] SMTP_HOST kosong, email verifikasi tidak dikirim. to=%s link=%s", to, link)
		return nil
	}
	html := `
    <h2>Halo, ` + name + `</h2>
    <p>Klik tombol berikut untuk memverifikasi email akun LPPM Anda (berlaku 24 jam):</p>
    <a href="` + link + `" style="display:inline-block;padding:12px 24px;background:#1e3a5f;color:#fff;text-decoration:none;border-radius:6px;">Verifikasi Email</a>
    <p>Jika Anda tidak merasa meminta verifikasi, abaikan email ini.</p>
  `
	return sendMail(s.cfg, to, "Verifikasi Email", html)
}

// verifyEmail (publik) marks the token's user as verified.
func (s *Server) verifyEmail(c *Ctx) error {
	token, _ := getString(c.bodyMap(), "token")
	ctx := c.r.Context()
	var id, userID int64
	var expiresAt time.Time
	var used bool
	err := s.db.QueryRowContext(ctx, "SELECT `id`,`userId`,`expiresAt`,`used` FROM `EmailVerificationToken` WHERE `token` = ?", token).
		Scan(&id, &userID, &expiresAt, &used)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && (used || expiresAt.Before(s.now()))) {
		return httpError(http.StatusBadRequest, "Token verifikasi tidak valid atau kedaluwarsa")
	}
	if err != nil {
		return err
	}
	now := s.nowMs()
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "UPDATE `EmailVerificationToken` SET `used` = true WHERE `id` = ?", id); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, "UPDATE `User` SET `emailVerifiedAt` = COALESCE(`emailVerifiedAt`, ?), `updatedAt` = ? WHERE `id` = ?", now, now, userID)
		return err
	})
	if err != nil {
		return err
	}
	return c.ok("Email berhasil diverifikasi", noData)
}
