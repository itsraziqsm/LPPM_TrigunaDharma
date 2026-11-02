package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"
)

// Baru (W-53), tidak ada di Node: kategori resmi log aktivitas (kolom ActivityLog.kategori,
// diisi logActivity dari awalan action), filter kategori/search/dari/sampai di GET
// /activity-logs, dan ringkasan GET /activity-logs/ringkasan.

var kategoriLogList = []string{"auth", "akun", "proposal", "review", "laporan", "dokumen", "periode", "template", "luaran", "backup", "sistem"}

// kategoriLog memetakan action ke kategori; sama dengan backfill di migrasi
// 20261106000300_activity_log_kategori.
func kategoriLog(action string) string {
	a := strings.ToLower(action)
	switch {
	case strings.HasPrefix(a, "login"), strings.HasPrefix(a, "logout"):
		return "auth"
	case strings.HasPrefix(a, "user."):
		return "akun"
	case strings.HasPrefix(a, "proposal."):
		return "proposal"
	case strings.HasPrefix(a, "reviewer."), strings.HasPrefix(a, "review."):
		return "review"
	case strings.HasPrefix(a, "laporan"):
		return "laporan"
	case strings.HasPrefix(a, "dokumen."):
		return "dokumen"
	case strings.HasPrefix(a, "periode."):
		return "periode"
	case strings.HasPrefix(a, "template."):
		return "template"
	case strings.HasPrefix(a, "luaran."):
		return "luaran"
	case strings.HasPrefix(a, "backup."):
		return "backup"
	}
	return "sistem"
}

// tanggalLokal mengurai YYYY-MM-DD sebagai awal hari di zona BACKUP_ZONA (bawaan Asia/Jakarta).
func (s *Server) tanggalLokal(v, field string) (time.Time, error) {
	t, err := time.ParseInLocation("2006-01-02", v, s.backupLoc())
	if err != nil {
		return time.Time{}, httpError(http.StatusBadRequest, field+" harus berformat YYYY-MM-DD")
	}
	return t, nil
}

// filterLog membangun kondisi tambahan dari query kategori, search, dari, sampai
// (search memakai alias u untuk User yang di-LEFT JOIN).
func (s *Server) filterLog(c *Ctx, pakaiKategori bool) (string, []any, error) {
	where := ""
	args := []any{}
	if pakaiKategori {
		if k, ok := c.queryValue("kategori"); ok && k != "" {
			if !contains(kategoriLogList, k) {
				return "", nil, httpError(http.StatusBadRequest, "kategori tidak valid. Pilihan: "+strings.Join(kategoriLogList, ", "))
			}
			where += " AND a.`kategori` = ?"
			args = append(args, k)
		}
	}
	if q, ok := c.queryValue("search"); ok && strings.TrimSpace(q) != "" {
		like := "%" + strings.TrimSpace(q) + "%"
		where += " AND (a.`action` LIKE ? OR a.`detail` LIKE ? OR a.`ipAddress` LIKE ? OR u.`name` LIKE ? OR u.`fullName` LIKE ? OR u.`email` LIKE ?)"
		args = append(args, like, like, like, like, like, like)
	}
	var dari, sampai time.Time
	if v, ok := c.queryValue("dari"); ok && v != "" {
		t, err := s.tanggalLokal(v, "dari")
		if err != nil {
			return "", nil, err
		}
		dari = t
		where += " AND a.`createdAt` >= ?"
		args = append(args, t.UTC())
	}
	if v, ok := c.queryValue("sampai"); ok && v != "" {
		t, err := s.tanggalLokal(v, "sampai")
		if err != nil {
			return "", nil, err
		}
		sampai = t
		where += " AND a.`createdAt` < ?" // sampai = inklusif sampai akhir hari itu
		args = append(args, t.AddDate(0, 0, 1).UTC())
	}
	if !dari.IsZero() && !sampai.IsZero() && dari.After(sampai) {
		return "", nil, httpError(http.StatusBadRequest, "dari tidak boleh setelah sampai")
	}
	return where, args, nil
}

func (s *Server) ringkasanLog(c *Ctx) error {
	where := "1=1"
	args := []any{}
	if raw, ok := c.queryValue("userId"); ok && raw != "" {
		id, err := jsNumberParam(raw, "userId")
		if err != nil {
			return err
		}
		where += " AND a.`userId` = ?"
		args = append(args, id)
	}
	extra, extraArgs, err := s.filterLog(c, false)
	if err != nil {
		return err
	}
	where += extra
	args = append(args, extraArgs...)
	from := " FROM `ActivityLog` a LEFT JOIN `User` u ON u.`id` = a.`userId` WHERE "
	ctx := c.r.Context()
	rows, err := queryObjs(ctx, s.db, "SELECT a.`kategori`, COUNT(*) AS `n`"+from+where+" GROUP BY a.`kategori`", args...)
	if err != nil {
		return err
	}
	per := map[string]int64{}
	var total int64
	for _, r := range rows {
		k, _ := r.Get("kategori").(string)
		per[k] = r.Int64("n")
		total += r.Int64("n")
	}
	perKategori := O{}
	for _, k := range kategoriLogList {
		perKategori = append(perKategori, KV{k, per[k]})
	}
	hariIni, err := s.ringkasanHariIni(ctx)
	if err != nil {
		return err
	}
	return c.ok("Ringkasan log aktivitas fetched", append(O{{"total", total}, {"perKategori", perKategori}}, hariIni...))
}

// ringkasanHariIni: angka login hari ini (zona BACKUP_ZONA), tidak terpengaruh filter.
func (s *Server) ringkasanHariIni(ctx context.Context) (O, error) {
	now := s.now().In(s.backupLoc())
	awal := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).UTC()
	login, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ActivityLog` WHERE `action` = 'LOGIN' AND `createdAt` >= ?", awal)
	if err != nil {
		return nil, err
	}
	gagal, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ActivityLog` WHERE `action` = 'LOGIN_GAGAL' AND `createdAt` >= ?", awal)
	if err != nil {
		return nil, err
	}
	aktif, err := countRows(ctx, s.db, "SELECT COUNT(DISTINCT `userId`) FROM `ActivityLog` WHERE `createdAt` >= ?", awal)
	if err != nil {
		return nil, err
	}
	return O{{"loginHariIni", login}, {"loginGagalHariIni", gagal}, {"penggunaAktifHariIni", aktif}}, nil
}
