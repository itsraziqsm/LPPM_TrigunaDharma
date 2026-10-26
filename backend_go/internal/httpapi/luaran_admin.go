package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Luaran untuk admin: melihat & mengunduh luaran yang dibuat dosen. Tidak ada padanannya di
// Node: endpoint baru, dokumentasi untuk frontend di new-api.md bagian 25.
//   - GET /luaran            daftar semua item luaran + proposal + dosen (filter, paginasi)
//   - GET /luaran/unduh-csv  rekap luaran (sesuai filter) sebagai CSV untuk Excel
//   - GET /luaran/unduh-zip  semua file bukti (sesuai filter) + daftar-luaran.csv dalam satu ZIP
//   - GET /luaran/:id/bukti  satu file bukti (endpoint lama, admin sudah boleh)
// Plus GET /luaran/jenis (semua user login): daftar jenis luaran, jurnal & poster di atas.

const luaranZipMax = 1000

var luaranAdminFilterFields = []zField{
	optional("jenis", zEnumOf(luaranJenis...)),
	optional("status", zEnumOf("belum", "tercapai")),
	optional("jenisKegiatan", zEnumOf(jenisKegiatan...)),
	optional("proposalId", zNum().Coerce().Int().Positive()),
	optional("periodeId", zNum().Coerce().Int().Positive()),
	optional("tahun", zNum().Coerce().Int().Min(2000)),
	optional("search", zStr().Trim()),
	optional("prioritas", zEnumOf("true", "false")),
	optional("adaBukti", zEnumOf("true", "false")),
	optional("dapatDiklaim", zEnumOf("true", "false")),
	optional("pemisah", zEnumOf("koma", "titikkoma")),
}

var (
	luaranAdminListSchema = zObj(append(append([]zField{}, luaranAdminFilterFields...),
		withDefault("page", zNum().Coerce().Int().Min(1), float64(1)),
		withDefault("limit", zNum().Coerce().Int().Min(1).Max(100), float64(20)),
	)...)
	luaranAdminUnduhSchema = zObj(luaranAdminFilterFields...)
)

const luaranAdminFrom = " FROM `LuaranKegiatan` lk JOIN `Proposal` p ON p.`id` = lk.`proposalId` JOIN `User` u ON u.`id` = p.`pengusulId`" +
	" LEFT JOIN `Periode` pe ON pe.`id` = p.`periodeId` LEFT JOIN `Laporan` l ON l.`proposalId` = p.`id`"

const luaranAdminSelect = "SELECT lk.`id`,lk.`jenis`,lk.`target`,lk.`targetTanggal`,lk.`status`,lk.`judulCapaian`,lk.`keterangan`,lk.`tercapaiAt`," +
	"lk.`buktiUrl`,lk.`buktiNama`,lk.`buktiMime`,lk.`buktiUkuran`,lk.`createdAt`,lk.`updatedAt`," +
	"p.`id` AS `p_id`,p.`judul` AS `p_judul`,p.`jenis` AS `p_jenis`,p.`status` AS `p_status`," +
	"pe.`id` AS `pe_id`,pe.`nama` AS `pe_nama`,pe.`tahun` AS `pe_tahun`," +
	"u.`id` AS `u_id`,u.`name` AS `u_name`,u.`fullName` AS `u_fullName`,u.`nidn` AS `u_nidn`,u.`programStudi` AS `u_programStudi`," +
	"l.`status` AS `l_status`"

func (s *Server) registerLuaranAdminRoutes(g *mount) {
	g.get("/jenis", s.luaranJenisList)
	g.get("/", authorize("admin"), s.validateQuery(luaranAdminListSchema), s.luaranAdminList)
	g.get("/unduh-csv", authorize("admin"), s.validateQuery(luaranAdminUnduhSchema), s.luaranAdminCSV)
	g.get("/unduh-zip", authorize("admin"), s.validateQuery(luaranAdminUnduhSchema), s.luaranAdminZip)
}

func (s *Server) luaranJenisList(c *Ctx) error {
	items := make([]O, len(luaranJenis))
	for i, j := range luaranJenis {
		items[i] = O{{"kode", j}, {"label", luaranLabel[j]}, {"prioritas", luaranPrioritas[j]}}
	}
	return c.ok("Jenis luaran fetched", items)
}

func luaranAdminWhere(q map[string]any) (string, []any) {
	where := []string{}
	args := []any{}
	add := func(cond string, v ...any) { where = append(where, cond); args = append(args, v...) }
	if v, ok := q["jenis"].(string); ok {
		add("lk.`jenis` = ?", v)
	}
	if v, ok := q["status"].(string); ok {
		add("lk.`status` = ?", v)
	}
	if v, ok := q["jenisKegiatan"].(string); ok {
		add("p.`jenis` = ?", v)
	}
	if v, ok := q["proposalId"].(float64); ok {
		add("lk.`proposalId` = ?", int64(v))
	}
	if v, ok := q["periodeId"].(float64); ok {
		add("p.`periodeId` = ?", int64(v))
	}
	if v, ok := q["tahun"].(float64); ok {
		add("pe.`tahun` = ?", int64(v))
	}
	if v, ok := q["search"].(string); ok && v != "" {
		like := "%" + v + "%"
		add("(lk.`target` LIKE ? OR lk.`judulCapaian` LIKE ? OR p.`judul` LIKE ? OR u.`name` LIKE ? OR u.`fullName` LIKE ? OR u.`nidn` LIKE ?)", like, like, like, like, like, like)
	}
	switch q["prioritas"] {
	case "true":
		add("lk.`jenis` IN ('jurnal','poster')")
	case "false":
		add("lk.`jenis` NOT IN ('jurnal','poster')")
	}
	switch q["adaBukti"] {
	case "true":
		add("(lk.`buktiBlob` IS NOT NULL OR lk.`buktiUrl` IS NOT NULL)")
	case "false":
		add("lk.`buktiBlob` IS NULL AND lk.`buktiUrl` IS NULL")
	}
	switch q["dapatDiklaim"] {
	case "true":
		add("lk.`status` = 'tercapai' AND l.`status` = 'disetujui'")
	case "false":
		add("NOT (lk.`status` = 'tercapai' AND COALESCE(l.`status`, '') = 'disetujui')")
	}
	if len(where) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(where, " AND "), args
}

const luaranAdminOrder = " ORDER BY lk.`jenis` IN ('jurnal','poster') DESC, lk.`updatedAt` DESC, lk.`id` DESC"

func luaranAdminItem(r O) O {
	jenis := r.Str("jenis")
	lapStatus, _ := r.Get("l_status").(string)
	var bukti any
	if r.Get("buktiUkuran") != nil {
		bukti = O{{"nama", r.Get("buktiNama")}, {"mime", r.Get("buktiMime")}, {"ukuran", r.Get("buktiUkuran")},
			{"unduhUrl", "/luaran/" + itoa(r.Int64("id")) + "/bukti"}}
	}
	var periode any
	if r.Get("pe_id") != nil {
		periode = O{{"id", r.Get("pe_id")}, {"nama", r.Get("pe_nama")}, {"tahun", r.Get("pe_tahun")}}
	}
	item := O{
		{"id", r.Get("id")},
		{"jenis", jenis},
		{"jenisLabel", luaranLabel[jenis]},
		{"prioritas", luaranPrioritas[jenis]},
		{"target", r.Get("target")},
		{"targetTanggal", r.Get("targetTanggal")},
		{"status", r.Get("status")},
		{"judulCapaian", r.Get("judulCapaian")},
		{"keterangan", r.Get("keterangan")},
		{"tercapaiAt", r.Get("tercapaiAt")},
		{"buktiUrl", r.Get("buktiUrl")},
		{"buktiFile", bukti},
		{"dapatDiklaim", r.Str("status") == "tercapai" && lapStatus == "disetujui"},
		{"proposal", O{{"id", r.Get("p_id")}, {"judul", r.Get("p_judul")}, {"jenis", r.Get("p_jenis")}, {"status", r.Get("p_status")},
			{"laporanStatus", r.Get("l_status")}, {"periode", periode}}},
		{"pengusul", O{{"id", r.Get("u_id")}, {"name", r.Get("u_name")}, {"fullName", r.Get("u_fullName")}, {"nidn", r.Get("u_nidn")}, {"programStudi", r.Get("u_programStudi")}}},
		{"createdAt", r.Get("createdAt")},
		{"updatedAt", r.Get("updatedAt")},
	}
	list := []O{item}
	withTepatWaktu(list)
	return list[0]
}

func (s *Server) luaranAdminList(c *Ctx) error {
	q := c.validatedQuery
	ctx := c.r.Context()
	page, limit := q["page"].(float64), q["limit"].(float64)
	cond, args := luaranAdminWhere(q)
	total, err := countRows(ctx, s.db, "SELECT COUNT(*)"+luaranAdminFrom+cond, args...)
	if err != nil {
		return err
	}
	rows, err := queryObjs(ctx, s.db, luaranAdminSelect+luaranAdminFrom+cond+luaranAdminOrder+" LIMIT ? OFFSET ?",
		append(args, int64(limit), int64((page-1)*limit))...)
	if err != nil {
		return err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		items[i] = luaranAdminItem(r)
	}
	return c.okMeta("Luaran fetched", items, page, limit, total)
}

// ── CSV & ZIP ────────────────────────────────────────────────────────────

func (s *Server) luaranAdminRows(c *Ctx) ([]O, error) {
	cond, args := luaranAdminWhere(c.validatedQuery)
	ctx := c.r.Context()
	total, err := countRows(ctx, s.db, "SELECT COUNT(*)"+luaranAdminFrom+cond, args...)
	if err != nil {
		return nil, err
	}
	if total > luaranZipMax {
		return nil, httpError(http.StatusBadRequest, fmt.Sprintf("Terlalu banyak luaran (%d). Persempit filter, maksimal %d per unduhan.", total, luaranZipMax))
	}
	rows, err := queryObjs(ctx, s.db, luaranAdminSelect+luaranAdminFrom+cond+luaranAdminOrder, args...)
	if err != nil {
		return nil, err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		items[i] = luaranAdminItem(r)
	}
	return items, nil
}

var unsafeFileChars = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func safeFileName(s string, max int) string {
	s = strings.Trim(unsafeFileChars.ReplaceAllString(s, "_"), "_.")
	if len(s) > max {
		s = s[:max]
	}
	if s == "" {
		s = "file"
	}
	return s
}

// zipBuktiName: bukti/<jenis>/<id>_<nama dosen>_<nama file asli>.
func zipBuktiName(item O) string {
	p := item.Get("pengusul").(O)
	nama, _ := p.Get("fullName").(string)
	if nama == "" {
		nama, _ = p.Get("name").(string)
	}
	asli := "bukti"
	if f, ok := item.Get("buktiFile").(O); ok {
		if n, _ := f.Get("nama").(string); n != "" {
			asli = n
		}
	}
	return "bukti/" + item.Str("jenis") + "/" + itoa(item.Int64("id")) + "_" + safeFileName(nama, 40) + "_" + safeFileName(asli, 80)
}

func fmtTanggal(v any) string {
	if t, ok := v.(JSTime); ok {
		return time.Time(t).UTC().Format("2006-01-02")
	}
	return ""
}

func yaTidak(v any) string {
	switch v {
	case true:
		return "Ya"
	case false:
		return "Tidak"
	}
	return ""
}

func str(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case int64:
		return strconv.FormatInt(x, 10)
	}
	return fmt.Sprint(v)
}

// writeLuaranCSV: CSV ber-BOM UTF-8 (terbaca Excel). pemisah titikkoma untuk Excel berlokal Indonesia.
func writeLuaranCSV(items []O, pemisah string, withZipCol bool) []byte {
	var buf bytes.Buffer
	buf.WriteString("\uFEFF")
	w := csv.NewWriter(&buf)
	if pemisah == "titikkoma" {
		w.Comma = ';'
	}
	head := []string{"ID Luaran", "Jenis", "Prioritas", "Target", "Tanggal Target", "Status", "Judul Capaian", "Keterangan",
		"Tanggal Tercapai", "Tepat Waktu", "Link Bukti", "File Bukti", "Dapat Diklaim", "ID Proposal", "Judul Proposal",
		"Jenis Kegiatan", "Status Proposal", "Status Laporan", "Dosen Pengusul", "NIDN", "Program Studi", "Periode", "Tahun"}
	if withZipCol {
		head = append(head, "File di ZIP")
	}
	_ = w.Write(head)
	for _, it := range items {
		p := it.Get("proposal").(O)
		u := it.Get("pengusul").(O)
		nama := str(u.Get("fullName"))
		if nama == "" {
			nama = str(u.Get("name"))
		}
		var periodeNama, tahun, fileNama, zipNama string
		if pe, ok := p.Get("periode").(O); ok {
			periodeNama, tahun = str(pe.Get("nama")), str(pe.Get("tahun"))
		}
		if f, ok := it.Get("buktiFile").(O); ok {
			fileNama = str(f.Get("nama"))
			zipNama = zipBuktiName(it)
		}
		row := []string{str(it.Get("id")), str(it.Get("jenisLabel")), yaTidak(it.Get("prioritas")), str(it.Get("target")),
			fmtTanggal(it.Get("targetTanggal")), str(it.Get("status")), str(it.Get("judulCapaian")), str(it.Get("keterangan")),
			fmtTanggal(it.Get("tercapaiAt")), yaTidak(it.Get("tepatWaktu")), str(it.Get("buktiUrl")), fileNama,
			yaTidak(it.Get("dapatDiklaim")), str(p.Get("id")), str(p.Get("judul")), str(p.Get("jenis")), str(p.Get("status")),
			str(p.Get("laporanStatus")), nama, str(u.Get("nidn")), str(u.Get("programStudi")), periodeNama, tahun}
		if withZipCol {
			row = append(row, zipNama)
		}
		_ = w.Write(row)
	}
	w.Flush()
	return buf.Bytes()
}

func (c *Ctx) attachmentHeaders(mimeType, name string) {
	h := c.w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Type", mimeType)
	h.Set("Content-Disposition", `attachment; filename="`+jsEncodeURIComponent(name)+`"`)
	h.Set("Cache-Control", "no-store")
}

func (s *Server) luaranAdminCSV(c *Ctx) error {
	items, err := s.luaranAdminRows(c)
	if err != nil {
		return err
	}
	pemisah, _ := c.validatedQuery["pemisah"].(string)
	data := writeLuaranCSV(items, pemisah, false)
	if err := s.logActivity(c.r.Context(), s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "luaran.unduh_csv", EntityType: "luaran", Detail: fmt.Sprintf("Rekap luaran diunduh (%d item)", len(items)),
	}); err != nil {
		return err
	}
	c.attachmentHeaders("text/csv; charset=utf-8", "rekap-luaran-"+s.now().Format("20060102")+".csv")
	c.w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	c.w.WriteHeader(http.StatusOK)
	if c.r.Method != http.MethodHead {
		_, _ = c.w.Write(data)
	}
	return errStop
}

// luaranAdminZip mengalirkan ZIP: daftar-luaran.csv + bukti/<jenis>/... (file dibaca satu per satu).
func (s *Server) luaranAdminZip(c *Ctx) error {
	items, err := s.luaranAdminRows(c)
	if err != nil {
		return err
	}
	pemisah, _ := c.validatedQuery["pemisah"].(string)
	ctx := c.r.Context()
	files := 0
	for _, it := range items {
		if it.Get("buktiFile") != nil {
			files++
		}
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "luaran.unduh_zip", EntityType: "luaran",
		Detail: fmt.Sprintf("Bukti luaran diunduh sebagai ZIP (%d item, %d file)", len(items), files),
	}); err != nil {
		return err
	}
	c.attachmentHeaders("application/zip", "luaran-"+s.now().Format("20060102")+".zip")
	c.w.WriteHeader(http.StatusOK)
	if c.r.Method == http.MethodHead {
		return errStop
	}
	zw := zip.NewWriter(c.w)
	if f, err := zw.Create("daftar-luaran.csv"); err == nil {
		_, _ = f.Write(writeLuaranCSV(items, pemisah, true))
	}
	for _, it := range items {
		if it.Get("buktiFile") == nil {
			continue
		}
		var blob []byte
		if err := s.db.QueryRowContext(ctx, "SELECT `buktiBlob` FROM `LuaranKegiatan` WHERE `id` = ?", it.Int64("id")).Scan(&blob); err != nil || blob == nil {
			continue
		}
		f, err := zw.CreateHeader(&zip.FileHeader{Name: zipBuktiName(it), Method: zip.Deflate, Modified: s.now()})
		if err != nil {
			break
		}
		if _, err := f.Write(blob); err != nil {
			break
		}
	}
	_ = zw.Close()
	return errStop
}
