package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"
)

// Baru (W-47), tidak ada di Node: riwayat halaman yang dibuka & hasil pencarian yang dipilih,
// per user, disimpan di server agar sinkron antarperangkat (tabel UserRiwayat).

const (
	riwayatMaksHalaman = 50
	riwayatMaksCari    = 4
)

func (s *Server) registerRiwayatRoutes(g *mount) {
	g.get("/profile/riwayat", s.getRiwayat)
	g.post("/profile/riwayat/halaman", s.catatRiwayatHalaman)
	g.post("/profile/riwayat/cari", s.catatRiwayatCari)
	g.delete("/profile/riwayat/cari", s.hapusRiwayatCari)
}

// teksRiwayat membaca field string dari body: wajib bila required, dipangkas, maks n karakter.
func teksRiwayat(body map[string]any, field string, maks int, required bool) (any, error) {
	v, ok := body[field]
	if !ok || v == nil {
		if required {
			return nil, httpError(http.StatusBadRequest, field+" wajib diisi")
		}
		return nil, nil
	}
	str, ok := v.(string)
	if !ok {
		return nil, httpError(http.StatusBadRequest, field+" harus berupa teks")
	}
	str = strings.TrimSpace(str)
	if str == "" {
		if required {
			return nil, httpError(http.StatusBadRequest, field+" wajib diisi")
		}
		return nil, nil
	}
	if utf8.RuneCountInString(str) > maks {
		return nil, httpError(http.StatusBadRequest, field+" maksimal "+itoa(int64(maks))+" karakter")
	}
	return str, nil
}

// pathRiwayat: path relatif aplikasi frontend, harus diawali "/" (bukan "//", tanpa skema).
func pathRiwayat(body map[string]any, field string) (string, error) {
	v, err := teksRiwayat(body, field, 500, true)
	if err != nil {
		return "", err
	}
	p := v.(string)
	if !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.ContainsAny(p, " \t\r\n\\") {
		return "", httpError(http.StatusBadRequest, field+" harus berupa path aplikasi yang diawali \"/\"")
	}
	return p, nil
}

func (s *Server) riwayatData(ctx context.Context, userID int64) (O, error) {
	halaman, err := queryObjs(ctx, s.db,
		"SELECT `kunci` AS `path`, `at` FROM `UserRiwayat` WHERE `userId` = ? AND `jenis` = 'halaman' ORDER BY `at` DESC, `id` DESC LIMIT ?",
		userID, riwayatMaksHalaman)
	if err != nil {
		return nil, err
	}
	rows, err := queryObjs(ctx, s.db,
		"SELECT `kunci`, `data`, `at` FROM `UserRiwayat` WHERE `userId` = ? AND `jenis` = 'cari' ORDER BY `at` DESC, `id` DESC LIMIT ?",
		userID, riwayatMaksCari)
	if err != nil {
		return nil, err
	}
	cari := make([]O, 0, len(rows))
	for _, r := range rows {
		var d struct {
			Title    *string `json:"title"`
			Subtitle *string `json:"subtitle"`
			Badge    *string `json:"badge"`
		}
		if raw, ok := r.Get("data").(string); ok {
			_ = json.Unmarshal([]byte(raw), &d)
		}
		cari = append(cari, O{
			{"to", r.Get("kunci")}, {"title", strPtrAny(d.Title)}, {"subtitle", strPtrAny(d.Subtitle)},
			{"badge", strPtrAny(d.Badge)}, {"at", r.Get("at")},
		})
	}
	return O{{"halaman", halaman}, {"cari", cari}}, nil
}

func strPtrAny(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func (s *Server) getRiwayat(c *Ctx) error {
	data, err := s.riwayatData(c.r.Context(), c.user.UserID)
	if err != nil {
		return err
	}
	return c.ok("Riwayat fetched", data)
}

// simpanRiwayat menyisipkan/menyegarkan satu entri lalu memangkas entri lama melebihi batas.
func (s *Server) simpanRiwayat(ctx context.Context, userID int64, jenis, kunci string, data any, maks int) error {
	now := s.nowMs()
	return s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO `UserRiwayat` (`userId`,`jenis`,`kunci`,`data`,`at`) VALUES (?,?,?,?,?)"+
				" ON DUPLICATE KEY UPDATE `data` = VALUES(`data`), `at` = VALUES(`at`)",
			userID, jenis, kunci, data, now); err != nil {
			return err
		}
		// MySQL tidak mengizinkan LIMIT di subquery IN; pakai tabel turunan.
		_, err := tx.ExecContext(ctx,
			"DELETE FROM `UserRiwayat` WHERE `userId` = ? AND `jenis` = ? AND `id` NOT IN"+
				" (SELECT `id` FROM (SELECT `id` FROM `UserRiwayat` WHERE `userId` = ? AND `jenis` = ? ORDER BY `at` DESC, `id` DESC LIMIT ?) t)",
			userID, jenis, userID, jenis, maks)
		return err
	})
}

func (s *Server) catatRiwayatHalaman(c *Ctx) error {
	path, err := pathRiwayat(c.bodyMap(), "path")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.simpanRiwayat(ctx, c.user.UserID, "halaman", path, nil, riwayatMaksHalaman); err != nil {
		return err
	}
	data, err := s.riwayatData(ctx, c.user.UserID)
	if err != nil {
		return err
	}
	return c.ok("Riwayat halaman dicatat", data)
}

func (s *Server) catatRiwayatCari(c *Ctx) error {
	body := c.bodyMap()
	to, err := pathRiwayat(body, "to")
	if err != nil {
		return err
	}
	title, err := teksRiwayat(body, "title", 200, true)
	if err != nil {
		return err
	}
	subtitle, err := teksRiwayat(body, "subtitle", 300, false)
	if err != nil {
		return err
	}
	badge, err := teksRiwayat(body, "badge", 50, false)
	if err != nil {
		return err
	}
	raw, err := json.Marshal(map[string]any{"title": title, "subtitle": subtitle, "badge": badge})
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.simpanRiwayat(ctx, c.user.UserID, "cari", to, string(raw), riwayatMaksCari); err != nil {
		return err
	}
	data, err := s.riwayatData(ctx, c.user.UserID)
	if err != nil {
		return err
	}
	return c.ok("Riwayat pencarian dicatat", data)
}

func (s *Server) hapusRiwayatCari(c *Ctx) error {
	ctx := c.r.Context()
	if _, err := s.db.ExecContext(ctx, "DELETE FROM `UserRiwayat` WHERE `userId` = ? AND `jenis` = 'cari'", c.user.UserID); err != nil {
		return err
	}
	data, err := s.riwayatData(ctx, c.user.UserID)
	if err != nil {
		return err
	}
	return c.ok("Riwayat pencarian dihapus", data)
}
