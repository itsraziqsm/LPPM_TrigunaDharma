package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Baru (W-50), tidak ada di Node: kontak admin (nomor WhatsApp) untuk tombol Hubungi Admin,
// dibaca semua peran yang login dan diubah admin tanpa build ulang frontend. Disimpan di
// tabel key-value Pengaturan.

const kontakAdminNamaBawaan = "Admin LPPM"

var (
	kontakAdminKunci = []string{"kontak_admin.whatsapp", "kontak_admin.nama", "kontak_admin.jamLayanan"}
	waBersihRe       = regexp.MustCompile(`[\s\-().]`)
	waValidRe        = regexp.MustCompile(`^62\d{8,13}$`)
)

func (s *Server) registerKontakAdminRoutes() {
	g := s.group("/api/v1/kontak-admin", s.authenticate)
	g.get("/", s.getKontakAdmin)
	g.patch("/", authorize("admin"), s.updateKontakAdmin)
}

// normalisasiWhatsApp: buang spasi/tanda baca & "+", awalan 0 → 62; hasil wajib 62 + 8–13 digit.
func normalisasiWhatsApp(v string) (string, bool) {
	n := strings.TrimPrefix(waBersihRe.ReplaceAllString(strings.TrimSpace(v), ""), "+")
	if strings.HasPrefix(n, "0") {
		n = "62" + n[1:]
	}
	return n, waValidRe.MatchString(n)
}

func (s *Server) kontakAdmin(ctx context.Context) (O, error) {
	rows, err := queryObjs(ctx, s.db,
		"SELECT p.`kunci`, p.`nilai`, p.`updatedAt`, u.`id` AS `u_id`, u.`name` AS `u_name`, u.`fullName` AS `u_fullName`"+
			" FROM `Pengaturan` p LEFT JOIN `User` u ON u.`id` = p.`updatedById` WHERE p.`kunci` LIKE 'kontak\\_admin.%'")
	if err != nil {
		return nil, err
	}
	nilai := map[string]any{}
	var updatedAt, updatedBy any
	var terbaru JSTime
	for _, r := range rows {
		nilai[r.Get("kunci").(string)] = r.Get("nilai")
		if t, ok := r.Get("updatedAt").(JSTime); ok && (updatedAt == nil || time.Time(t).After(time.Time(terbaru))) {
			terbaru, updatedAt = t, t
			updatedBy = nil
			if r.Get("u_id") != nil {
				updatedBy = O{{"id", r.Get("u_id")}, {"name", r.Get("u_name")}, {"fullName", r.Get("u_fullName")}}
			}
		}
	}
	nama := nilai["kontak_admin.nama"]
	if nama == nil {
		nama = kontakAdminNamaBawaan
	}
	return O{
		{"whatsapp", nilai["kontak_admin.whatsapp"]},
		{"nama", nama},
		{"jamLayanan", nilai["kontak_admin.jamLayanan"]},
		{"updatedAt", updatedAt},
		{"updatedBy", updatedBy},
	}, nil
}

func (s *Server) getKontakAdmin(c *Ctx) error {
	data, err := s.kontakAdmin(c.r.Context())
	if err != nil {
		return err
	}
	return c.ok("Kontak admin fetched", data)
}

func (s *Server) updateKontakAdmin(c *Ctx) error {
	body := c.bodyMap()
	ubah := map[string]any{}
	if _, ok := body["whatsapp"]; ok {
		v, err := teksRiwayat(body, "whatsapp", 30, false)
		if err != nil {
			return err
		}
		if v != nil {
			n, valid := normalisasiWhatsApp(v.(string))
			if !valid {
				return httpError(http.StatusBadRequest, "Nomor WhatsApp tidak valid. Gunakan format 62xxxxxxxxxx atau 08xxxxxxxxxx (10–15 digit)")
			}
			v = n
		}
		ubah["kontak_admin.whatsapp"] = v
	}
	if _, ok := body["nama"]; ok {
		v, err := teksRiwayat(body, "nama", 100, false)
		if err != nil {
			return err
		}
		ubah["kontak_admin.nama"] = v
	}
	if _, ok := body["jamLayanan"]; ok {
		v, err := teksRiwayat(body, "jamLayanan", 100, false)
		if err != nil {
			return err
		}
		ubah["kontak_admin.jamLayanan"] = v
	}
	if len(ubah) == 0 {
		return httpError(http.StatusBadRequest, "Tidak ada perubahan: kirim minimal satu dari whatsapp, nama, jamLayanan")
	}
	ctx := c.r.Context()
	now := s.nowMs()
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		for _, k := range kontakAdminKunci {
			v, ok := ubah[k]
			if !ok {
				continue
			}
			if _, err := tx.ExecContext(ctx,
				"INSERT INTO `Pengaturan` (`kunci`,`nilai`,`updatedAt`,`updatedById`) VALUES (?,?,?,?)"+
					" ON DUPLICATE KEY UPDATE `nilai` = VALUES(`nilai`), `updatedAt` = VALUES(`updatedAt`), `updatedById` = VALUES(`updatedById`)",
				k, v, now, c.user.UserID); err != nil {
				return err
			}
		}
		return s.logActivity(ctx, tx, c, activityEntry{UserID: c.user.UserID, Action: "pengaturan.kontak_admin", EntityType: "pengaturan", Detail: "Kontak admin diperbarui"})
	})
	if err != nil {
		return err
	}
	data, err := s.kontakAdmin(ctx)
	if err != nil {
		return err
	}
	return c.ok("Kontak admin diperbarui", data)
}
