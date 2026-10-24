package httpapi

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Akun milik sendiri — Grup B daftar waiting API (Go saja, tidak ada di Node;
// dokumentasi untuk frontend di new-api.md bagian 11):
//   W-04  sintaId / sintaScore (diisi lewat PATCH /users/profile/me)
//   W-07  foto profil: POST/DELETE /users/profile/foto, GET /users/:id/foto (publik)
//   W-20  unduh data akun: GET /users/profile/export
//   W-21  hapus akun sendiri (nonaktif + anonimkan): DELETE /users/profile/me

const deletedUserName = "Pengguna Dihapus"

var deleteAccountSchema = zObj(required("password", zStr().Min(1, "Password wajib diisi")))

// registerUserFotoRoutes mounts the public photo route before the
// authenticated /users router (a mount's middleware runs for every path
// under its prefix, so the public route needs its own earlier mount).
func (s *Server) registerUserFotoRoutes() {
	g := s.group("/api/v1/users")
	g.get("/:id/foto", s.getUserFoto)
}

// setFotoURL replaces the internal `__foto` column (UserFoto.updatedAt or
// NULL) with `fotoUrl`, a path relative to the API base URL. The `v` query
// changes on every upload so browsers can cache the image safely.
func setFotoURL(o *O, userID int64) {
	for i := range *o {
		if (*o)[i].K != "__foto" {
			continue
		}
		var url any
		if t, ok := (*o)[i].V.(JSTime); ok {
			url = fmt.Sprintf("/users/%d/foto?v=%d", userID, time.Time(t).UnixMilli())
		}
		(*o)[i] = KV{"fotoUrl", url}
		return
	}
}

func parseSintaScore(value any) (any, error) {
	invalid := httpError(http.StatusBadRequest, "sintaScore harus bilangan bulat 0 atau lebih")
	switch v := value.(type) {
	case nil:
		return nil, nil
	case float64:
		if v < 0 || v != math.Trunc(v) || v > math.MaxInt32 {
			return nil, invalid
		}
		return int64(v), nil
	case string:
		if strings.TrimSpace(v) == "" {
			return nil, nil
		}
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 32)
		if err != nil || n < 0 {
			return nil, invalid
		}
		return n, nil
	}
	return nil, invalid
}

// ── foto profil (W-07) ───────────────────────────────────────────────────

func (s *Server) uploadProfileFoto(c *Ctx) error {
	if c.file == nil {
		return httpError(http.StatusBadRequest, "File foto tidak ditemukan dalam request.")
	}
	detected := detectFileType(c.file.data)
	if detected != "image/jpeg" && detected != "image/png" && detected != "image/webp" {
		return httpError(http.StatusBadRequest, "Isi file bukan gambar JPG, PNG, atau WebP yang valid.")
	}
	ctx := c.r.Context()
	uid := c.user.UserID
	if _, err := s.ensureUserExists(ctx, uid); err != nil {
		return err
	}
	now := s.nowMs()
	if _, err := s.db.ExecContext(ctx,
		"INSERT INTO `UserFoto` (`userId`,`fotoBlob`,`fotoMime`,`fotoUkuran`,`updatedAt`) VALUES (?,?,?,?,?)"+
			" ON DUPLICATE KEY UPDATE `fotoBlob` = VALUES(`fotoBlob`), `fotoMime` = VALUES(`fotoMime`), `fotoUkuran` = VALUES(`fotoUkuran`), `updatedAt` = VALUES(`updatedAt`)",
		uid, c.file.data, detected, c.file.size, now); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{UserID: uid, Action: "user.foto.upload", EntityType: "user", EntityID: uid}); err != nil {
		return err
	}
	return c.ok("Foto profil berhasil diperbarui", O{
		{"fotoUrl", fmt.Sprintf("/users/%d/foto?v=%d", uid, now.UnixMilli())},
		{"fotoMime", detected}, {"fotoUkuran", c.file.size},
	})
}

func (s *Server) deleteProfileFoto(c *Ctx) error {
	ctx := c.r.Context()
	res, err := s.db.ExecContext(ctx, "DELETE FROM `UserFoto` WHERE `userId` = ?", c.user.UserID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpError(http.StatusNotFound, "Foto profil belum ada")
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{UserID: c.user.UserID, Action: "user.foto.delete", EntityType: "user", EntityID: c.user.UserID}); err != nil {
		return err
	}
	return c.ok("Foto profil dihapus", noData)
}

// getUserFoto sends the image without authentication so it can be used
// directly in <img src>. Cross-Origin-Resource-Policy is relaxed for this
// response only (helmet's same-origin would block the frontend origin).
func (s *Server) getUserFoto(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	var blob []byte
	var mime string
	err = s.db.QueryRowContext(c.r.Context(), "SELECT `fotoBlob`,`fotoMime` FROM `UserFoto` WHERE `userId` = ?", id).Scan(&blob, &mime)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError(http.StatusNotFound, "Foto tidak ditemukan")
	}
	if err != nil {
		return err
	}
	h := c.w.Header()
	h.Set("Content-Type", mime)
	h.Set("Content-Length", strconv.Itoa(len(blob)))
	h.Set("Cache-Control", "public, max-age=86400")
	h.Set("Cross-Origin-Resource-Policy", "cross-origin")
	h.Set("X-Content-Type-Options", "nosniff")
	c.w.WriteHeader(http.StatusOK)
	if c.r.Method != http.MethodHead {
		_, _ = c.w.Write(blob)
	}
	return errStop
}

// ── unduh data akun (W-20) ───────────────────────────────────────────────

// exportAccount sends a JSON file (attachment) with the user's data. File
// contents (blob) are never included, only their metadata.
func (s *Server) exportAccount(c *Ctx) error {
	ctx := c.r.Context()
	uid := c.user.UserID
	profil, err := s.profileByID(ctx, uid)
	if err != nil {
		return err
	}
	if profil == nil {
		return httpError(http.StatusNotFound, "User not found")
	}
	sections := []struct {
		key   string
		query string
	}{
		{"proposal", "SELECT `id`,`tipe`,`judul`,`abstrak`,`jenis`,`status`,`anggaran`,`luaran`,`skema`,`mitra`,`catatanRevisi`,`periodeId`,`dokumenUrl`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`submittedAt`,`approvedAt`,`createdAt`,`updatedAt` FROM `Proposal` WHERE `pengusulId` = ? ORDER BY `id`"},
		{"laporan", "SELECT `id`,`proposalId`,`judul`,`jenis`,`status`,`luaranTercapai`,`ringkasanHasil`,`realisasiAnggaran`,`catatanRevisi`,`dokumenUrl`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`submittedAt`,`approvedAt`,`createdAt`,`updatedAt` FROM `Laporan` WHERE `pengusulId` = ? ORDER BY `id`"},
		{"keanggotaan", "SELECT a.`id`,a.`proposalId`,p.`judul`,p.`jenis`,a.`peran`,a.`statusUndangan`,a.`createdAt` FROM `ProposalAnggota` a LEFT JOIN `Proposal` p ON p.`id` = a.`proposalId` WHERE a.`userId` = ? ORDER BY a.`id`"},
		{"laporanHarian", "SELECT `id`,`proposalId`,`tanggal`,`kegiatan`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`linkGdrive`,`createdAt`,`updatedAt` FROM `LaporanHarian` WHERE `userId` = ? ORDER BY `id`"},
		{"review", "SELECT " + reviewColumns + " FROM `ProposalReview` WHERE `reviewerId` = ? ORDER BY `id`"},
		{"notifikasi", "SELECT `id`,`type`,`judul`,`pesan`,`isRead`,`refId`,`refType`,`createdAt` FROM `Notification` WHERE `userId` = ? ORDER BY `id`"},
		{"aktivitas", "SELECT `id`,`action`,`entityType`,`entityId`,`detail`,`proposalId`,`ipAddress`,`userAgent`,`createdAt` FROM `ActivityLog` WHERE `userId` = ? ORDER BY `id`"},
	}
	payload := O{{"exportedAt", JSTime(s.nowMs())}, {"profil", profil}}
	for _, sec := range sections {
		rows, err := queryObjs(ctx, s.db, sec.query, uid)
		if err != nil {
			return err
		}
		payload = append(payload, KV{sec.key, rows})
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{UserID: uid, Action: "user.export", EntityType: "user", EntityID: uid}); err != nil {
		return err
	}
	c.w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="data-akun-%d.json"`, uid))
	s.writeBody(c.w, c.r, http.StatusOK, payload)
	return errStop
}

// ── hapus akun sendiri (W-21) ────────────────────────────────────────────

// deleteOwnAccount deactivates and anonymises the account. Proposals,
// reviews, laporan and history stay intact (FK RESTRICT + arsip LPPM).
func (s *Server) deleteOwnAccount(c *Ctx) error {
	password, _ := getString(c.bodyMap(), "password")
	ctx := c.r.Context()
	uid := c.user.UserID
	hash, err := s.ensureUserExists(ctx, uid)
	if err != nil {
		return err
	}
	if !passwordMatches(hash, password) {
		return httpError(http.StatusBadRequest, "Password salah")
	}
	roles, err := s.rolesOf(ctx, s.db, uid)
	if err != nil {
		return err
	}
	if hasAnyRole(roles, "admin") {
		others, err := countRows(ctx, s.db,
			"SELECT COUNT(*) FROM `User` u JOIN `UserRole` ur ON ur.`userId` = u.`id` JOIN `Role` r ON r.`id` = ur.`roleId` WHERE r.`name` = 'admin' AND u.`status` = 'approved' AND u.`id` <> ?", uid)
		if err != nil {
			return err
		}
		if others == 0 {
			return httpError(http.StatusBadRequest, "Akun admin terakhir tidak dapat dihapus")
		}
	}
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return err
	}
	newHash, err := hashPassword(hex.EncodeToString(random), bcryptSaltRounds)
	if err != nil {
		return err
	}
	now := s.nowMs()
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			"UPDATE `User` SET `name` = ?, `fullName` = NULL, `email` = ?, `password` = ?, `status` = 'rejected',"+
				" `nidn` = NULL, `nim` = NULL, `prodi` = NULL, `programStudi` = NULL, `institusi` = NULL, `kontak` = NULL, `noHp` = NULL,"+
				" `alamat` = NULL, `tempatLahir` = NULL, `tanggalLahir` = NULL, `jabatanFungsional` = NULL, `sintaId` = NULL, `sintaScore` = NULL, `emailVerifiedAt` = NULL,"+
				" `deletedAt` = ?, `updatedAt` = ? WHERE `id` = ?",
			deletedUserName, fmt.Sprintf("deleted-%d@deleted.invalid", uid), newHash, now, now, uid); err != nil {
			return err
		}
		for _, q := range []string{
			"DELETE FROM `UserFoto` WHERE `userId` = ?",
			"DELETE FROM `PasswordResetToken` WHERE `userId` = ?",
			"DELETE FROM `EmailVerificationToken` WHERE `userId` = ?",
			"UPDATE `RefreshToken` SET `revoked` = true WHERE `userId` = ?",
			// Undangan yang belum dijawab dianggap ditolak agar pengusul tidak terhambat saat submit.
			"UPDATE `ProposalAnggota` SET `statusUndangan` = 'ditolak' WHERE `userId` = ? AND `statusUndangan` = 'pending'",
		} {
			if _, err := tx.ExecContext(ctx, q, uid); err != nil {
				return err
			}
		}
		return s.logActivity(ctx, tx, c, activityEntry{UserID: uid, Action: "user.hapus_akun", EntityType: "user", EntityID: uid, Detail: "Akun dinonaktifkan dan dianonimkan oleh pemiliknya"})
	})
	if err != nil {
		return err
	}
	return c.ok("Akun berhasil dihapus", noData)
}
