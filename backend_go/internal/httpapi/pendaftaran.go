package httpapi

import (
	"errors"
	"database/sql"
	"net/http"
	"regexp"
	"strings"
	"time"

	"lppm-backend-go/internal/sqlb"
)

// Baru (W-48), tidak ada di Node: satu identitas (email + NIDN/NIRM) satu pendaftaran.
// Pendaftar yang statusnya pending/approved mendapat 409 ber-`code`; yang rejected boleh
// mendaftar ulang (baris lama diperbarui).

var (
	nidnRe = regexp.MustCompile(`^\d{10,}$`)
	nirmRe = regexp.MustCompile(`^\d{10}$`)

	registerStatusSchema = zObj(required("email", zStr().Trim().Lower().Email()))
)

const (
	pesanNIDN = "NIDN wajib berupa angka minimal 10 digit"
	pesanNIRM = "NIRM wajib tepat 10 digit angka"
)

// samarkanEmail: "budi.santoso@kampus.ac.id" → "bu***@kampus.ac.id".
func samarkanEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return "***"
	}
	local, domain := email[:at], email[at:]
	keep := 2
	if len([]rune(local)) <= 2 {
		keep = 1
	}
	r := []rune(local)
	if len(r) < keep {
		keep = len(r)
	}
	return string(r[:keep]) + "***" + domain
}

// conflictCode mengirim 409 { success:false, code, message[, data] }.
func (c *Ctx) conflictCode(code, message string, data any) error {
	body := O{{"success", false}, {"code", code}, {"message", message}}
	if data != nil {
		body = append(body, KV{"data", data})
	}
	c.s.writeBody(c.w, c.r, http.StatusConflict, body)
	return errStop
}

const (
	identitasDosenQuery     = "SELECT `id`,`email`,`status`,`createdAt` FROM `User` WHERE `email` = ? OR `nidn` = ? ORDER BY `id`"
	identitasMahasiswaQuery = "SELECT `id`,`email`,`status`,`createdAt` FROM `User` WHERE `email` = ? OR `nim` = ? ORDER BY `id`"
)

// cekIdentitasDaftar mencari user dengan email ATAU nidn/nim yang sama. Mengembalikan id user
// rejected yang boleh didaftar ulang (0 = identitas baru); pending/approved/bentrok → 409.
func (s *Server) cekIdentitasDaftar(c *Ctx, body map[string]any, idField string) (int64, error) {
	email, _ := getString(body, "email")
	nomor, _ := getString(body, idField)
	q := identitasDosenQuery
	if idField == "nim" {
		q = identitasMahasiswaQuery
	}
	rows, err := queryObjs(c.r.Context(), s.db, q, email, nomor)
	if err != nil {
		return 0, err
	}
	switch {
	case len(rows) == 0:
		return 0, nil
	case len(rows) > 1:
		return 0, c.conflictCode("IDENTITAS_BENTROK",
			"Email dan NIDN/NIRM ini terdaftar pada akun yang berbeda. Hubungi admin LPPM.", nil)
	}
	u := rows[0]
	switch u.Get("status") {
	case "pending":
		return 0, c.conflictCode("PENDAFTARAN_MENUNGGU",
			"Pendaftaran dengan identitas ini sudah terkirim dan menunggu persetujuan admin.",
			O{{"email", samarkanEmail(u.Get("email").(string))}, {"createdAt", u.Get("createdAt")}})
	case "approved":
		return 0, c.conflictCode("AKUN_SUDAH_AKTIF", "Akun sudah aktif, silakan masuk.",
			O{{"email", samarkanEmail(u.Get("email").(string))}})
	}
	return u.Int64("id"), nil // rejected → daftar ulang
}

// daftarUlang memperbarui baris user rejected menjadi pendaftaran baru (status pending, profil &
// peran diganti isi formulir), lalu membalas 201 seperti pendaftaran baru.
func (s *Server) daftarUlang(c *Ctx, id int64, roleID int64, hash string, optionalFields []string) error {
	body := c.bodyMap()
	ctx := c.r.Context()
	now := s.nowMs()
	email, _ := getString(body, "email")
	name, _ := getString(body, "name")
	cols := []string{"email", "name", "password", "status", "deletedAt", "emailVerifiedAt", "wajibGantiPassword", "createdAt", "updatedAt"}
	args := []any{email, name, hash, "pending", nil, nil, false, now, now}
	for _, field := range optionalFields {
		var arg any
		if value, ok := getString(body, field); ok {
			arg = value
			if field == "tanggalLahir" {
				t, err := parseJSDate(value)
				if err != nil {
					return plainError("Invalid value for argument `tanggalLahir`: Provided Date object is invalid.")
				}
				arg = t
			}
		}
		cols = append(cols, field) // field yang tidak dikirim dikosongkan
		args = append(args, arg)
	}
	args = append(args, id)
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, sqlb.UpdateByID("User", cols), args...); err != nil {
			return err
		}
		for _, q := range []string{
			"DELETE FROM `UserRole` WHERE `userId` = ?",
			"UPDATE `RefreshToken` SET `revoked` = true WHERE `userId` = ?",
			"DELETE FROM `PasswordResetToken` WHERE `userId` = ?",
			"DELETE FROM `EmailVerificationToken` WHERE `userId` = ?",
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return err
			}
		}
		_, err := tx.ExecContext(ctx, "INSERT INTO `UserRole` (`userId`,`roleId`,`createdAt`) VALUES (?,?,?)", id, roleID, now)
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

// registerStatus: POST /auth/register/status { email } → { status } (dibatasi authLimiter).
func (s *Server) registerStatus(c *Ctx) error {
	email, _ := getString(c.bodyMap(), "email")
	s.secureDelay()
	var status string
	var createdAt time.Time
	err := s.db.QueryRowContext(c.r.Context(), "SELECT `status`,`createdAt` FROM `User` WHERE `email` = ? AND `deletedAt` IS NULL", email).Scan(&status, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return c.ok("Status pendaftaran", O{{"status", "tidak_ada"}})
	}
	if err != nil {
		return err
	}
	return c.ok("Status pendaftaran", O{{"status", status}, {"createdAt", JSTime(createdAt)}})
}

// cekNomorIdentitas memvalidasi NIDN/NIRM baru saat profil diubah (nilai lama yang sama dibiarkan).
func cekNomorIdentitas(field string, value any, lama sql.NullString) error {
	str, ok := value.(string)
	if !ok || str == "" || (lama.Valid && lama.String == str) {
		return nil
	}
	if field == "nidn" && !nidnRe.MatchString(str) {
		return httpError(http.StatusBadRequest, pesanNIDN)
	}
	if field == "nim" && !nirmRe.MatchString(str) {
		return httpError(http.StatusBadRequest, pesanNIRM)
	}
	return nil
}
