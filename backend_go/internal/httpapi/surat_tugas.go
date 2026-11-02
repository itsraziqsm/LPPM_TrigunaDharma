package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-sql-driver/mysql"
)

// Baru (W-42), tidak ada di Node: konfigurasi dokumen cetak bersama untuk Admin & Ketua LPPM
// (disimpan di tabel Pengaturan, kunci `cetak.<dokumen>`) serta arsip surat tugas dengan nomor
// otomatis berurutan per tahun: 001/ST/LPPM/<bulan romawi>/<tahun>.

var (
	dokumenCetak = []string{"rekap-proposal", "surat-tugas", "tabel-pengguna", "luaran-dosen"}
	bulanRomawi  = []string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}

	suratTugasListSchema = zObj(
		withDefault("page", zNum().Coerce().Int().Positive(), float64(1)),
		withDefault("limit", zNum().Coerce().Int().Positive().Max(100), float64(20)),
		optional("kegiatanId", zNum().Coerce().Int().Positive()),
		optional("tahun", zNum().Coerce().Int().Positive()),
	)
)

const maksKonfigurasiCetak = 8000 // byte JSON (body dibatasi 10 kb)

func (s *Server) registerCetakRoutes() {
	g := s.group("/api/v1/cetak", s.authenticate, authorize("admin", "ketua_lppm"))
	g.get("/konfigurasi/:dokumen", s.getKonfigurasiCetak)
	g.put("/konfigurasi/:dokumen", s.putKonfigurasiCetak)

	st := s.group("/api/v1/surat-tugas", s.authenticate, authorize("admin", "ketua_lppm"))
	st.get("/", s.validateQuery(suratTugasListSchema), s.listSuratTugas)
	st.post("/", s.createSuratTugas)
	st.get("/:id", s.getSuratTugas)
}

// NomorSuratTugas: 001/ST/LPPM/XI/2026.
func NomorSuratTugas(urut int64, t time.Time) string {
	return fmt.Sprintf("%03d/ST/LPPM/%s/%d", urut, bulanRomawi[t.Month()-1], t.Year())
}

func dokumenCetakParam(c *Ctx) (string, error) {
	d := c.param("dokumen")
	if !contains(dokumenCetak, d) {
		return "", httpError(http.StatusNotFound, "Dokumen cetak tidak dikenal. Pilihan: "+strings.Join(dokumenCetak, ", "))
	}
	return d, nil
}

func (s *Server) konfigurasiCetak(ctx context.Context, dokumen string) (O, error) {
	row, err := queryObj(ctx, s.db,
		"SELECT p.`nilai`, p.`updatedAt`, u.`id` AS `u_id`, u.`name` AS `u_name`, u.`fullName` AS `u_fullName`"+
			" FROM `Pengaturan` p LEFT JOIN `User` u ON u.`id` = p.`updatedById` WHERE p.`kunci` = ?", "cetak."+dokumen)
	if err != nil {
		return nil, err
	}
	var konfigurasi, updatedAt, updatedBy any
	if row != nil {
		if raw, ok := row.Get("nilai").(string); ok && raw != "" {
			var v any
			if json.Unmarshal([]byte(raw), &v) == nil {
				konfigurasi = v
			}
		}
		updatedAt = row.Get("updatedAt")
		if row.Get("u_id") != nil {
			updatedBy = O{{"id", row.Get("u_id")}, {"name", row.Get("u_name")}, {"fullName", row.Get("u_fullName")}}
		}
	}
	return O{{"dokumen", dokumen}, {"konfigurasi", konfigurasi}, {"updatedAt", updatedAt}, {"updatedBy", updatedBy}}, nil
}

func (s *Server) getKonfigurasiCetak(c *Ctx) error {
	d, err := dokumenCetakParam(c)
	if err != nil {
		return err
	}
	data, err := s.konfigurasiCetak(c.r.Context(), d)
	if err != nil {
		return err
	}
	return c.ok("Konfigurasi cetak fetched", data)
}

func (s *Server) putKonfigurasiCetak(c *Ctx) error {
	d, err := dokumenCetakParam(c)
	if err != nil {
		return err
	}
	raw, ok := c.bodyMap()["konfigurasi"]
	if !ok {
		return httpError(http.StatusBadRequest, "konfigurasi wajib dikirim (objek, atau null untuk mengosongkan)")
	}
	var nilai any
	if raw != nil {
		if _, isObj := raw.(map[string]any); !isObj {
			return httpError(http.StatusBadRequest, "konfigurasi harus berupa objek")
		}
		b, err := json.Marshal(raw)
		if err != nil {
			return err
		}
		if len(b) > maksKonfigurasiCetak {
			return httpError(http.StatusBadRequest, fmt.Sprintf("konfigurasi terlalu besar (maks %d byte)", maksKonfigurasiCetak))
		}
		nilai = string(b)
	}
	ctx := c.r.Context()
	if _, err := s.db.ExecContext(ctx,
		"INSERT INTO `Pengaturan` (`kunci`,`nilai`,`updatedAt`,`updatedById`) VALUES (?,?,?,?)"+
			" ON DUPLICATE KEY UPDATE `nilai` = VALUES(`nilai`), `updatedAt` = VALUES(`updatedAt`), `updatedById` = VALUES(`updatedById`)",
		"cetak."+d, nilai, s.nowMs(), c.user.UserID); err != nil {
		return err
	}
	data, err := s.konfigurasiCetak(ctx, d)
	if err != nil {
		return err
	}
	return c.ok("Konfigurasi cetak disimpan", data)
}

// ── surat tugas ──────────────────────────────────────────────────────────

const suratTugasSelect = "SELECT st.`id`,st.`nomor`,st.`tahun`,st.`urut`,st.`kegiatanId`,st.`tipe`,st.`jenis`,st.`judulKegiatan`,st.`tugas`,st.`petugas`," +
	"DATE_FORMAT(st.`tanggalMulai`, '%Y-%m-%d') AS `tanggalMulai`,DATE_FORMAT(st.`tanggalSelesai`, '%Y-%m-%d') AS `tanggalSelesai`,st.`alamat`,st.`penandatangan`,st.`createdAt`," +
	"u.`id` AS `u_id`,u.`name` AS `u_name`,u.`fullName` AS `u_fullName` FROM `SuratTugas` st LEFT JOIN `User` u ON u.`id` = st.`dibuatOlehId`"

func suratTugasItem(r O) O {
	decode := func(key string) any {
		var v any
		if raw, ok := r.Get(key).(string); ok {
			_ = json.Unmarshal([]byte(raw), &v)
		}
		return v
	}
	var oleh any
	if r.Get("u_id") != nil {
		oleh = O{{"id", r.Get("u_id")}, {"name", r.Get("u_name")}, {"fullName", r.Get("u_fullName")}}
	}
	return O{
		{"id", r.Get("id")}, {"nomor", r.Get("nomor")}, {"tahun", r.Get("tahun")}, {"urut", r.Get("urut")},
		{"kegiatanId", r.Get("kegiatanId")}, {"tipe", r.Get("tipe")}, {"jenis", r.Get("jenis")}, {"judulKegiatan", r.Get("judulKegiatan")},
		{"tugas", r.Get("tugas")}, {"petugas", decode("petugas")}, {"tanggalMulai", r.Get("tanggalMulai")}, {"tanggalSelesai", r.Get("tanggalSelesai")},
		{"alamat", r.Get("alamat")}, {"penandatangan", decode("penandatangan")}, {"dibuatOleh", oleh}, {"createdAt", r.Get("createdAt")},
	}
}

func (s *Server) listSuratTugas(c *Ctx) error {
	q := c.validatedQuery
	page, limit := q["page"].(float64), q["limit"].(float64)
	where := " WHERE 1=1"
	args := []any{}
	if v, ok := q["kegiatanId"].(float64); ok {
		where += " AND st.`kegiatanId` = ?"
		args = append(args, int64(v))
	}
	if v, ok := q["tahun"].(float64); ok {
		where += " AND st.`tahun` = ?"
		args = append(args, int64(v))
	}
	ctx := c.r.Context()
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `SuratTugas` st"+where, args...)
	if err != nil {
		return err
	}
	rows, err := queryObjs(ctx, s.db, suratTugasSelect+where+" ORDER BY st.`tahun` DESC, st.`urut` DESC LIMIT ? OFFSET ?",
		append(args, int64(limit), int64((page-1)*limit))...)
	if err != nil {
		return err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		items[i] = suratTugasItem(r)
	}
	return c.okMeta("Surat tugas fetched", items, page, limit, total)
}

func (s *Server) suratTugasByID(ctx context.Context, id int64) (O, error) {
	row, err := queryObj(ctx, s.db, suratTugasSelect+" WHERE st.`id` = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpError(http.StatusNotFound, "Surat tugas tidak ditemukan")
	}
	return suratTugasItem(row), nil
}

func (s *Server) getSuratTugas(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	data, err := s.suratTugasByID(c.r.Context(), id)
	if err != nil {
		return err
	}
	return c.ok("Surat tugas fetched", data)
}

func teksWajib(body map[string]any, field string, maks int) (string, error) {
	v, err := teksRiwayat(body, field, maks, true)
	if err != nil {
		return "", err
	}
	return v.(string), nil
}

func tanggalSurat(v any, field string, wajib bool) (any, error) {
	str, _ := v.(string)
	str = strings.TrimSpace(str)
	if str == "" {
		if wajib {
			return nil, httpError(http.StatusBadRequest, field+" wajib diisi (YYYY-MM-DD)")
		}
		return nil, nil
	}
	if _, err := time.Parse("2006-01-02", str); err != nil {
		return nil, httpError(http.StatusBadRequest, field+" harus berformat YYYY-MM-DD")
	}
	return str, nil
}

// orangSurat membersihkan objek orang (petugas/penandatangan) menjadi field teks tertentu.
func orangSurat(raw any, label string, fields map[string]int, wajib string) (map[string]any, error) {
	m, ok := raw.(map[string]any)
	if !ok {
		return nil, httpError(http.StatusBadRequest, label+" harus berupa objek")
	}
	out := map[string]any{}
	for f, maks := range fields {
		v, exists := m[f]
		if !exists || v == nil {
			out[f] = nil
			continue
		}
		str, ok := v.(string)
		if !ok {
			return nil, httpError(http.StatusBadRequest, label+"."+f+" harus berupa teks")
		}
		str = strings.TrimSpace(str)
		if utf8.RuneCountInString(str) > maks {
			return nil, httpError(http.StatusBadRequest, fmt.Sprintf("%s.%s maksimal %d karakter", label, f, maks))
		}
		if str == "" {
			out[f] = nil
		} else {
			out[f] = str
		}
	}
	if out[wajib] == nil {
		return nil, httpError(http.StatusBadRequest, label+"."+wajib+" wajib diisi")
	}
	return out, nil
}

func (s *Server) createSuratTugas(c *Ctx) error {
	body := c.bodyMap()
	ctx := c.r.Context()
	kid, ok := body["kegiatanId"].(float64)
	if !ok || kid <= 0 || kid != float64(int64(kid)) {
		return httpError(http.StatusBadRequest, "kegiatanId wajib berupa id proposal atau laporan")
	}
	var tipe, jenis, judul, status string
	err := s.db.QueryRowContext(ctx,
		"SELECT k.`tipe`, k.`jenis`, COALESCE(p.`judul`, l.`judul`), COALESCE(p.`status`, l.`status`) FROM `Kegiatan` k"+
			" LEFT JOIN `Proposal` p ON p.`id` = k.`id` LEFT JOIN `Laporan` l ON l.`id` = k.`id` WHERE k.`id` = ?", int64(kid)).
		Scan(&tipe, &jenis, &judul, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError(http.StatusNotFound, "Kegiatan tidak ditemukan")
	}
	if err != nil {
		return err
	}
	if tipe == "proposal" && status != "disetujui" {
		return httpError(http.StatusBadRequest, "Surat tugas hanya untuk proposal yang sudah disetujui atau laporan")
	}
	if t, ok := body["tipe"].(string); ok && t != "" && t != tipe {
		return httpError(http.StatusBadRequest, "tipe tidak sesuai dengan kegiatan ("+tipe+")")
	}
	tugas, err := teksWajib(body, "tugas", 2000)
	if err != nil {
		return err
	}
	alamat, err := teksWajib(body, "alamat", 1000)
	if err != nil {
		return err
	}
	mulai, err := tanggalSurat(body["tanggalMulai"], "tanggalMulai", true)
	if err != nil {
		return err
	}
	selesai, err := tanggalSurat(body["tanggalSelesai"], "tanggalSelesai", false)
	if err != nil {
		return err
	}
	if selesai != nil && selesai.(string) < mulai.(string) {
		return httpError(http.StatusBadRequest, "tanggalSelesai tidak boleh sebelum tanggalMulai")
	}
	rawPetugas, ok := body["petugas"].([]any)
	if !ok || len(rawPetugas) == 0 || len(rawPetugas) > 50 {
		return httpError(http.StatusBadRequest, "petugas wajib berisi 1–50 orang")
	}
	petugas := make([]map[string]any, len(rawPetugas))
	for i, p := range rawPetugas {
		o, err := orangSurat(p, fmt.Sprintf("petugas[%d]", i), map[string]int{"nama": 200, "identitas": 50, "peran": 100}, "nama")
		if err != nil {
			return err
		}
		petugas[i] = o
	}
	ttd, err := orangSurat(body["penandatangan"], "penandatangan", map[string]int{"nama": 200, "nidn": 50, "jabatan": 100}, "nama")
	if err != nil {
		return err
	}
	petugasJSON, _ := json.Marshal(petugas)
	ttdJSON, _ := json.Marshal(ttd)

	now := s.now().In(s.backupLoc())
	tahun := int64(now.Year())
	var id int64
	var nomor string
	for coba := 0; coba < 3; coba++ { // nomor unik (tahun, urut); ulangi bila bentrok bersamaan
		err = s.withTx(ctx, func(tx *sql.Tx) error {
			var maxUrut sql.NullInt64
			if err := tx.QueryRowContext(ctx, "SELECT MAX(`urut`) FROM `SuratTugas` WHERE `tahun` = ? FOR UPDATE", tahun).Scan(&maxUrut); err != nil {
				return err
			}
			urut := maxUrut.Int64 + 1
			nomor = NomorSuratTugas(urut, now)
			res, err := tx.ExecContext(ctx,
				"INSERT INTO `SuratTugas` (`nomor`,`tahun`,`urut`,`kegiatanId`,`tipe`,`jenis`,`judulKegiatan`,`tugas`,`petugas`,`tanggalMulai`,`tanggalSelesai`,`alamat`,`penandatangan`,`dibuatOlehId`,`createdAt`)"+
					" VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
				nomor, tahun, urut, int64(kid), tipe, jenis, truncateRunes(judul, 500), tugas, string(petugasJSON), mulai, selesai, alamat, string(ttdJSON), c.user.UserID, s.nowMs())
			if err != nil {
				return err
			}
			id, err = res.LastInsertId()
			return err
		})
		var me *mysql.MySQLError
		if errors.As(err, &me) && me.Number == 1062 {
			continue
		}
		break
	}
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "dokumen.surat_tugas", EntityType: tipe, EntityID: int64(kid),
		Detail: "Surat tugas " + nomor + " dibuat untuk \"" + judul + "\"",
	}); err != nil {
		return err
	}
	data, err := s.suratTugasByID(ctx, id)
	if err != nil {
		return err
	}
	return c.created("Surat tugas dibuat", data)
}

func truncateRunes(str string, n int) string {
	r := []rune(str)
	if len(r) <= n {
		return str
	}
	return string(r[:n])
}
