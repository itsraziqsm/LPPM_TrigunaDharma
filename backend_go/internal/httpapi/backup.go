package httpapi

import (
	"compress/gzip"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // zona BACKUP_ZONA tetap terbaca di image tanpa tzdata
)

// Backup database. Tidak ada padanannya di Node: endpoint baru (admin), dokumentasi untuk
// frontend di new-api.md bagian 19.
//   - Otomatis oleh sistem sebulan sekali: tanggal BACKUP_HARI pukul BACKUP_JAM (zona
//     BACKUP_ZONA, default tanggal 1 pukul 02:00 Asia/Jakarta). Bila server mati saat jadwal,
//     backup bulan itu dijalankan begitu server hidup lagi. BACKUP_OTOMATIS=false mematikan.
//   - Manual oleh admin kapan pun (POST /backup, berjalan di latar → 202).
// File .sql.gz disimpan di BACKUP_DIR (default ./backups); tabel BackupLog menyimpan log.
// Hanya satu backup berjalan per database (MySQL GET_LOCK, aman untuk beberapa instance).

const (
	backupLockSQL        = "CONCAT('lppm_backup:', DATABASE())"
	backupCekInterval    = 10 * time.Minute
	backupJedaUlangGagal = 6 * time.Hour
)

var errBackupBerjalan = httpError(http.StatusConflict, "Backup lain sedang berjalan. Tunggu hingga selesai.")

var backupListQuerySchema = zObj(
	withDefault("page", zNum().Coerce().Int().Min(1), float64(1)),
	withDefault("limit", zNum().Coerce().Int().Min(1).Max(100), float64(10)),
	optional("sumber", zEnumOf("sistem", "admin")),
	optional("status", zEnumOf("berjalan", "berhasil", "gagal")),
)

func (s *Server) registerBackupRoutes() {
	g := s.group("/api/v1/backup", s.authenticate, authorize("admin"))
	g.get("/", s.validateQuery(backupListQuerySchema), s.listBackup)
	g.post("/", s.createBackupManual)
	g.get("/jadwal", s.backupJadwal)
	g.get("/:id", s.getBackup)
	g.get("/:id/download", s.downloadBackup)
	g.delete("/:id", s.deleteBackup)
}

func (s *Server) backupLoc() *time.Location {
	loc, err := time.LoadLocation(s.cfg.BackupZona)
	if err != nil {
		return time.UTC
	}
	return loc
}

// ── menjalankan backup ───────────────────────────────────────────────────────────────

// mulaiBackup mengambil kunci backup, mencatat log "berjalan", lalu menjalankan dump di
// latar. userID nil = sistem; periode "YYYY-MM" hanya untuk backup otomatis.
func (s *Server) mulaiBackup(ctx context.Context, sumber string, userID, periode any) (int64, error) {
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return 0, err
	}
	var got sql.NullInt64
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK("+backupLockSQL+", 0)").Scan(&got); err != nil {
		_ = conn.Close()
		return 0, err
	}
	if !got.Valid || got.Int64 != 1 {
		_ = conn.Close()
		return 0, errBackupBerjalan
	}
	release := func() {
		_, _ = conn.ExecContext(context.Background(), "DO RELEASE_LOCK("+backupLockSQL+")")
		_ = conn.Close()
	}
	mulai := s.nowMs()
	res, err := s.db.ExecContext(ctx, "INSERT INTO `BackupLog` (`sumber`,`dibuatOlehId`,`status`,`periode`,`mulaiAt`) VALUES (?,?,'berjalan',?,?)",
		sumber, userID, periode, mulai)
	if err != nil {
		release()
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		release()
		return 0, err
	}
	s.bgWG.Add(1)
	go func() {
		defer s.bgWG.Done()
		defer release()
		s.jalankanBackup(id, sumber, mulai)
	}()
	return id, nil
}

func (s *Server) jalankanBackup(id int64, sumber string, mulai time.Time) {
	nama := fmt.Sprintf("lppm-backup-%s-%s-%d.sql.gz", mulai.In(s.backupLoc()).Format("20060102-150405"), sumber, id)
	tables, rows, size, err := s.tulisFileBackup(nama)
	selesai := s.nowMs()
	ctx := context.Background() // tetap dicatat walau server sedang berhenti
	if err != nil {
		s.logger.Printf("backup #%d (%s) gagal: %v", id, sumber, err)
		if _, uerr := s.db.ExecContext(ctx, "UPDATE `BackupLog` SET `status` = 'gagal', `pesanError` = ?, `selesaiAt` = ? WHERE `id` = ?",
			err.Error(), selesai, id); uerr != nil {
			s.logger.Printf("backup #%d: gagal mencatat log: %v", id, uerr)
		}
		return
	}
	if _, uerr := s.db.ExecContext(ctx, "UPDATE `BackupLog` SET `status` = 'berhasil', `namaFile` = ?, `ukuran` = ?, `jumlahTabel` = ?, `jumlahBaris` = ?, `selesaiAt` = ? WHERE `id` = ?",
		nama, size, tables, rows, selesai, id); uerr != nil {
		s.logger.Printf("backup #%d: gagal mencatat log: %v", id, uerr)
	}
}

// bukaFolderBackup membuka BACKUP_DIR sebagai os.Root: semua operasi file backup dibatasi di
// folder itu, nama file tidak bisa keluar lewat "../" atau symlink.
func (s *Server) bukaFolderBackup() (*os.Root, error) {
	if err := os.MkdirAll(s.cfg.BackupDir, 0o750); err != nil {
		return nil, err
	}
	return os.OpenRoot(s.cfg.BackupDir)
}

// tulisFileBackup menulis dump gzip ke <nama>.part lalu rename (file tidak pernah setengah jadi).
// File hanya bisa dibaca pemilik proses (0600) karena berisi seluruh data.
func (s *Server) tulisFileBackup(nama string) (tables int, rows int64, size int64, err error) {
	root, err := s.bukaFolderBackup()
	if err != nil {
		return 0, 0, 0, err
	}
	defer func() { _ = root.Close() }()
	part := nama + ".part"
	f, err := root.OpenFile(part, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, 0, 0, err
	}
	defer func() {
		if err != nil {
			_ = f.Close()
			_ = root.Remove(part)
		}
	}()
	gz := gzip.NewWriter(f)
	if tables, rows, err = dumpDatabase(s.bgCtx, s.db, gz); err != nil {
		return 0, 0, 0, err
	}
	if err = gz.Close(); err != nil {
		return 0, 0, 0, err
	}
	if err = f.Sync(); err != nil {
		return 0, 0, 0, err
	}
	if err = f.Close(); err != nil {
		return 0, 0, 0, err
	}
	if err = root.Rename(part, nama); err != nil {
		return 0, 0, 0, err
	}
	st, err := root.Stat(nama)
	if err != nil {
		return 0, 0, 0, err
	}
	return tables, rows, st.Size(), nil
}

// bersihkanBackupMacet menandai log "berjalan" sisa server yang mati di tengah backup sebagai
// gagal. Hanya bila kunci bebas (tidak ada instance lain yang sedang backup).
func (s *Server) bersihkanBackupMacet() {
	ctx := context.Background()
	conn, err := s.db.Conn(ctx)
	if err != nil {
		s.logger.Printf("backup: %v", err)
		return
	}
	defer conn.Close()
	var got sql.NullInt64
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK("+backupLockSQL+", 0)").Scan(&got); err != nil || !got.Valid || got.Int64 != 1 {
		return
	}
	defer conn.ExecContext(ctx, "DO RELEASE_LOCK("+backupLockSQL+")") //nolint:errcheck
	if _, err := conn.ExecContext(ctx, "UPDATE `BackupLog` SET `status` = 'gagal', `pesanError` = 'Server berhenti sebelum backup selesai', `selesaiAt` = ? WHERE `status` = 'berjalan'",
		s.nowMs()); err != nil {
		s.logger.Printf("backup: %v", err)
	}
}

// startBackupScheduler: bersihkan log macet, lalu (bila BACKUP_OTOMATIS) cek jadwal tiap 10 menit.
func (s *Server) startBackupScheduler() {
	s.bersihkanBackupMacet()
	if !s.cfg.BackupOtomatis {
		return
	}
	s.bgWG.Add(1)
	go func() {
		defer s.bgWG.Done()
		t := time.NewTicker(backupCekInterval)
		defer t.Stop()
		for {
			if err := s.cekJadwalBackup(); err != nil && !errors.Is(err, errBackupBerjalan) {
				s.logger.Printf("backup otomatis: %v", err)
			}
			select {
			case <-s.bgCtx.Done():
				return
			case <-t.C:
			}
		}
	}()
}

func (s *Server) jadwalBulanIni(now time.Time) time.Time {
	now = now.In(s.backupLoc())
	return time.Date(now.Year(), now.Month(), s.cfg.BackupHari, s.cfg.BackupJam, 0, 0, 0, now.Location())
}

// backupBulanIniSelesai: sudah ada backup otomatis berhasil/berjalan untuk periode ini.
func (s *Server) backupBulanIniSelesai(ctx context.Context, periode string) (bool, error) {
	n, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `BackupLog` WHERE `sumber` = 'sistem' AND `periode` = ? AND `status` IN ('berjalan','berhasil')", periode)
	return n > 0, err
}

func (s *Server) cekJadwalBackup() error {
	ctx := s.bgCtx
	now := s.now().In(s.backupLoc())
	if now.Before(s.jadwalBulanIni(now)) {
		return nil
	}
	periode := now.Format("2006-01")
	selesai, err := s.backupBulanIniSelesai(ctx, periode)
	if err != nil || selesai {
		return err
	}
	// Gagal → dicoba ulang paling cepat 6 jam kemudian.
	gagal, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `BackupLog` WHERE `sumber` = 'sistem' AND `periode` = ? AND `status` = 'gagal' AND `mulaiAt` > ?",
		periode, s.nowMs().Add(-backupJedaUlangGagal))
	if err != nil || gagal > 0 {
		return err
	}
	_, err = s.mulaiBackup(ctx, "sistem", nil, periode)
	return err
}

// ── endpoint ─────────────────────────────────────────────────────────────────────────

const backupSelect = "SELECT b.`id`,b.`sumber`,b.`status`,b.`periode`,b.`namaFile`,b.`ukuran`,b.`jumlahTabel`,b.`jumlahBaris`,b.`pesanError`," +
	"b.`mulaiAt`,b.`selesaiAt`,b.`dihapusAt`," +
	"c.`id` AS `c_id`,c.`name` AS `c_name`,c.`fullName` AS `c_fullName`,c.`email` AS `c_email`," +
	"d.`id` AS `d_id`,d.`name` AS `d_name`,d.`fullName` AS `d_fullName`,d.`email` AS `d_email`" +
	" FROM `BackupLog` b LEFT JOIN `User` c ON c.`id` = b.`dibuatOlehId` LEFT JOIN `User` d ON d.`id` = b.`dihapusOlehId`"

func backupUser(row O, prefix string) any {
	if row.Get(prefix+"id") == nil {
		return nil
	}
	return O{{"id", row.Get(prefix + "id")}, {"name", row.Get(prefix + "name")}, {"fullName", row.Get(prefix + "fullName")}, {"email", row.Get(prefix + "email")}}
}

func displayName(u any) string {
	if o, ok := u.(O); ok {
		if v, _ := o.Get("fullName").(string); v != "" {
			return v
		}
		if v, _ := o.Get("name").(string); v != "" {
			return v
		}
	}
	return "admin (akun dihapus)"
}

// backupItem menyusun bentuk respons satu log backup.
func backupItem(row O) O {
	sumber, _ := row.Get("sumber").(string)
	status, _ := row.Get("status").(string)
	dibuatOleh := backupUser(row, "c_")
	keterangan := "Otomatis oleh sistem (jadwal bulanan)"
	if sumber == "admin" {
		keterangan = "Manual oleh admin " + displayName(dibuatOleh)
	}
	var durasi any
	if a, ok := row.Get("mulaiAt").(JSTime); ok {
		if b, ok := row.Get("selesaiAt").(JSTime); ok {
			durasi = time.Time(b).Sub(time.Time(a)).Milliseconds()
		}
	}
	return O{
		{"id", row.Get("id")},
		{"sumber", sumber},
		{"keterangan", keterangan},
		{"status", status},
		{"periode", row.Get("periode")},
		{"namaFile", row.Get("namaFile")},
		{"ukuran", row.Get("ukuran")},
		{"jumlahTabel", row.Get("jumlahTabel")},
		{"jumlahBaris", row.Get("jumlahBaris")},
		{"pesanError", row.Get("pesanError")},
		{"mulaiAt", row.Get("mulaiAt")},
		{"selesaiAt", row.Get("selesaiAt")},
		{"durasiMs", durasi},
		{"fileTersedia", status == "berhasil" && row.Get("dihapusAt") == nil},
		{"dihapusAt", row.Get("dihapusAt")},
		{"dibuatOleh", dibuatOleh},
		{"dihapusOleh", backupUser(row, "d_")},
	}
}

func (s *Server) backupByID(ctx context.Context, id int64) (O, error) {
	row, err := queryObj(ctx, s.db, backupSelect+" WHERE b.`id` = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpError(http.StatusNotFound, "Log backup tidak ditemukan")
	}
	return backupItem(row), nil
}

func (s *Server) listBackup(c *Ctx) error {
	q := c.validatedQuery
	page, limit := q["page"].(float64), q["limit"].(float64)
	where := []string{}
	args := []any{}
	for _, f := range []string{"sumber", "status"} {
		if v, ok := q[f].(string); ok {
			where = append(where, "b.`"+f+"` = ?")
			args = append(args, v)
		}
	}
	cond := ""
	if len(where) > 0 {
		cond = " WHERE " + strings.Join(where, " AND ")
	}
	ctx := c.r.Context()
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `BackupLog` b"+cond, args...)
	if err != nil {
		return err
	}
	rows, err := queryObjs(ctx, s.db, backupSelect+cond+" ORDER BY b.`mulaiAt` DESC, b.`id` DESC LIMIT ? OFFSET ?",
		append(args, int64(limit), int64((page-1)*limit))...)
	if err != nil {
		return err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		items[i] = backupItem(r)
	}
	return c.okMeta("Log backup fetched", items, page, limit, total)
}

func (s *Server) getBackup(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	item, err := s.backupByID(c.r.Context(), id)
	if err != nil {
		return err
	}
	return c.ok("Log backup fetched", item)
}

func (s *Server) createBackupManual(c *Ctx) error {
	ctx := c.r.Context()
	id, err := s.mulaiBackup(ctx, "admin", c.user.UserID, nil)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "backup.manual", EntityType: "backup", EntityID: id,
		Detail: "Backup database manual dimulai",
	}); err != nil {
		return err
	}
	item, err := s.backupByID(ctx, id)
	if err != nil {
		return err
	}
	c.s.ok(c.w, c.r, http.StatusAccepted, "Backup dimulai. Pantau statusnya lewat GET /backup/:id", item)
	return errStop
}

func (s *Server) backupJadwal(c *Ctx) error {
	ctx := c.r.Context()
	loc := s.backupLoc()
	now := s.now().In(loc)
	jadwal := s.jadwalBulanIni(now)
	var berikutnya any
	if s.cfg.BackupOtomatis {
		selesai, err := s.backupBulanIniSelesai(ctx, now.Format("2006-01"))
		if err != nil {
			return err
		}
		next := jadwal
		if selesai {
			next = time.Date(jadwal.Year(), jadwal.Month()+1, s.cfg.BackupHari, s.cfg.BackupJam, 0, 0, 0, loc)
		} else if now.After(jadwal) {
			next = now // terlewat: dijalankan pada pengecekan berikutnya (≤ 10 menit)
		}
		berikutnya = JSTime(next.UTC().Truncate(time.Millisecond))
	}
	terakhir, err := queryObj(ctx, s.db, backupSelect+" WHERE b.`sumber` = 'sistem' ORDER BY b.`mulaiAt` DESC, b.`id` DESC LIMIT 1")
	if err != nil {
		return err
	}
	var terakhirItem any
	if terakhir != nil {
		terakhirItem = backupItem(terakhir)
	}
	berjalan, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `BackupLog` WHERE `status` = 'berjalan'")
	if err != nil {
		return err
	}
	return c.ok("Jadwal backup fetched", O{
		{"otomatisAktif", s.cfg.BackupOtomatis},
		{"tanggal", s.cfg.BackupHari},
		{"jam", s.cfg.BackupJam},
		{"zonaWaktu", loc.String()},
		{"keterangan", fmt.Sprintf("Setiap tanggal %d pukul %02d:00 (%s)", s.cfg.BackupHari, s.cfg.BackupJam, loc.String())},
		{"berikutnyaAt", berikutnya},
		{"sedangBerjalan", berjalan > 0},
		{"terakhirOtomatis", terakhirItem},
	})
}

// fileBackupSiap memastikan log punya file yang masih ada di server dan mengembalikan nama
// filenya (tanpa folder; dibuka lewat bukaFolderBackup).
func (s *Server) fileBackupSiap(item O) (string, error) {
	switch {
	case item.Get("status") == "berjalan":
		return "", httpError(http.StatusConflict, "Backup masih berjalan")
	case item.Get("status") == "gagal":
		return "", httpError(http.StatusConflict, "Backup gagal, tidak ada file")
	case item.Get("dihapusAt") != nil:
		return "", httpError(http.StatusGone, "File backup sudah dihapus")
	}
	nama, _ := item.Get("namaFile").(string)
	return filepath.Base(nama), nil
}

func (s *Server) downloadBackup(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	item, err := s.backupByID(ctx, id)
	if err != nil {
		return err
	}
	nama, err := s.fileBackupSiap(item)
	if err != nil {
		return err
	}
	root, err := s.bukaFolderBackup()
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()
	f, err := root.Open(nama)
	if errors.Is(err, os.ErrNotExist) {
		return httpError(http.StatusNotFound, "File backup tidak ditemukan di server")
	}
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "backup.download", EntityType: "backup", EntityID: id,
		Detail: "Backup database diunduh: " + nama,
	}); err != nil {
		return err
	}
	h := c.w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Type", "application/gzip")
	h.Set("Content-Disposition", `attachment; filename="`+jsEncodeURIComponent(nama)+`"`)
	h.Set("Content-Length", strconv.FormatInt(st.Size(), 10))
	c.w.WriteHeader(http.StatusOK)
	if c.r.Method != http.MethodHead {
		_, _ = io.Copy(c.w, f)
	}
	return errStop
}

func (s *Server) deleteBackup(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	item, err := s.backupByID(ctx, id)
	if err != nil {
		return err
	}
	nama, err := s.fileBackupSiap(item)
	if err != nil {
		if e, ok := err.(*apiError); ok && e.status == http.StatusGone {
			return httpError(http.StatusConflict, "File backup sudah dihapus")
		}
		return err
	}
	root, err := s.bukaFolderBackup()
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()
	if err := root.Remove(nama); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE `BackupLog` SET `dihapusAt` = ?, `dihapusOlehId` = ? WHERE `id` = ?", s.nowMs(), c.user.UserID, id); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "backup.delete", EntityType: "backup", EntityID: id,
		Detail: "File backup dihapus: " + nama,
	}); err != nil {
		return err
	}
	item, err = s.backupByID(ctx, id)
	if err != nil {
		return err
	}
	return c.ok("File backup berhasil dihapus", item)
}
