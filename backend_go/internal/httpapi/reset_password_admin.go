package httpapi

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"math/big"
	"net/http"
	"strings"
)

// Baru (W-52), tidak ada di Node: admin mereset password user yang tidak bisa memakai alur
// lupa password (email). Password asli tidak pernah bisa dibaca (bcrypt), jadi backend membuat
// password sementara acak yang hanya dikirim sekali di respons ini, lalu menandai user
// `wajibGantiPassword` sampai ia mengganti password (PATCH /users/profile/password).

var resetPasswordAdminSchema = zObj(required("password", zStr().Min(1, "Password Anda wajib diisi sebagai konfirmasi")))

// Tanpa karakter yang mudah tertukar (0/O, 1/l/I).
const (
	sandiHurufKecil = "abcdefghijkmnopqrstuvwxyz"
	sandiHurufBesar = "ABCDEFGHJKLMNPQRSTUVWXYZ"
	sandiAngka      = "23456789"
	panjangSandi    = 14
)

func acakDari(set string) (byte, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(len(set))))
	if err != nil {
		return 0, err
	}
	return set[n.Int64()], nil
}

// buatPasswordSementara: 14 karakter acak (crypto/rand), minimal satu huruf kecil, huruf besar, dan angka.
func buatPasswordSementara() (string, error) {
	semua := sandiHurufKecil + sandiHurufBesar + sandiAngka
	out := make([]byte, panjangSandi)
	for i, set := range []string{sandiHurufKecil, sandiHurufBesar, sandiAngka} {
		b, err := acakDari(set)
		if err != nil {
			return "", err
		}
		out[i] = b
	}
	for i := 3; i < panjangSandi; i++ {
		b, err := acakDari(semua)
		if err != nil {
			return "", err
		}
		out[i] = b
	}
	// Acak posisi (Fisher–Yates) agar tiga karakter wajib tidak selalu di depan.
	for i := panjangSandi - 1; i > 0; i-- {
		j, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return "", err
		}
		out[i], out[j.Int64()] = out[j.Int64()], out[i]
	}
	return string(out), nil
}

func (s *Server) resetPasswordOlehAdmin(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	password, _ := getString(c.bodyMap(), "password")
	ctx := c.r.Context()
	adminHash, err := s.ensureUserExists(ctx, c.user.UserID)
	if err != nil {
		return err
	}
	if !passwordMatches(adminHash, password) {
		return httpError(http.StatusBadRequest, "Password salah")
	}
	if id == c.user.UserID {
		return httpError(http.StatusBadRequest, "Gunakan Ganti Password untuk mengubah password akun sendiri")
	}
	var name, email string
	var fullName sql.NullString
	var deletedAt sql.NullTime
	err = s.db.QueryRowContext(ctx, "SELECT `name`,`fullName`,`email`,`deletedAt` FROM `User` WHERE `id` = ?", id).
		Scan(&name, &fullName, &email, &deletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError(http.StatusNotFound, "User tidak ditemukan")
	}
	if err != nil {
		return err
	}
	if deletedAt.Valid {
		return httpError(http.StatusBadRequest, "Akun ini sudah dihapus dan tidak dapat direset")
	}
	sementara, err := buatPasswordSementara()
	if err != nil {
		return err
	}
	hash, err := hashPassword(sementara, bcryptSaltRounds)
	if err != nil {
		return err
	}
	now := s.nowMs()
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "UPDATE `User` SET `password` = ?, `wajibGantiPassword` = true, `updatedAt` = ? WHERE `id` = ?", hash, now, id); err != nil {
			return err
		}
		for _, q := range []string{
			"UPDATE `RefreshToken` SET `revoked` = true WHERE `userId` = ?",
			"UPDATE `PasswordResetToken` SET `used` = true WHERE `userId` = ?",
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return err
			}
		}
		if err := s.createNotification(ctx, tx, notification{
			UserID: id, PengirimID: c.user.UserID, Type: "password_direset", Judul: "Password Direset Admin",
			Pesan: "Password akun Anda telah direset oleh Admin. Masuk dengan password sementara dari Admin lalu segera ganti password.",
			RefID: id, RefType: "user",
		}); err != nil {
			return err
		}
		return s.logActivity(ctx, tx, c, activityEntry{
			UserID: c.user.UserID, Action: "user.reset_password", EntityType: "user", EntityID: id,
			Detail: "Password " + email + " direset ke password sementara oleh admin",
		})
	})
	if err != nil {
		return err
	}
	var fn any
	if fullName.Valid {
		fn = fullName.String
	}
	c.w.Header().Set("Cache-Control", "no-store")
	return c.ok("Password berhasil direset. Password sementara hanya ditampilkan sekali.", O{
		{"passwordSementara", sementara},
		{"wajibGantiPassword", true},
		{"user", O{{"id", id}, {"name", name}, {"fullName", fn}, {"email", email}}},
	})
}

// passwordBaruValid dipakai saat user wajib ganti password (setelah reset admin).
func passwordBaruValid(oldPassword, newPassword string) error {
	if len([]rune(strings.TrimSpace(newPassword))) < 8 {
		return httpError(http.StatusBadRequest, "Password baru minimal 8 karakter")
	}
	if newPassword == oldPassword {
		return httpError(http.StatusBadRequest, "Password baru harus berbeda dari password sementara")
	}
	return nil
}
