package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"
)

// Luaran kegiatan (W-01, W-02, W-12): output yang dijanjikan di proposal.
// Tidak ada padanannya di Node; dokumentasi untuk frontend di new-api.md
// bagian 12.
//
//	target  : diisi pengusul saat proposal draft/revisi (jenis, target, targetTanggal)
//	capaian : diisi pengusul setelah proposal disetujui, selama laporannya belum
//	          diajukan (laporan belum ada, draft, atau revisi)
//	klaim   : item tercapai pada proposal yang laporannya sudah disetujui ketua
//
// Item luaran selalu milik proposal (proposalId = id proposal, bukan laporan).

var (
	luaranJenis   = []string{"jurnal", "prosiding", "hki", "buku", "produk", "media_massa", "lainnya"}
	luaranColumns = "`id`,`proposalId`,`jenis`,`target`,`targetTanggal`,`status`,`judulCapaian`,`keterangan`,`tercapaiAt`,`buktiUrl`,`buktiNama`,`buktiMime`,`buktiUkuran`,`createdAt`,`updatedAt`"

	luaranTanggal          = zNullable{periodeTanggal}
	createLuaranSchema     = zObj(required("proposalId", zNum().Int().Positive()), required("jenis", zEnumOf(luaranJenis...)), required("target", zStr().Trim().Min(3, "Target minimal 3 karakter")), optional("targetTanggal", luaranTanggal))
	updateLuaranSchema     = zObj(optional("jenis", zEnumOf(luaranJenis...)), optional("target", zStr().Trim().Min(3, "Target minimal 3 karakter")), optional("targetTanggal", luaranTanggal))
	updateCapaianSchema    = zObj(optional("status", zEnumOf("belum", "tercapai")), optional("judulCapaian", zNullable{zStr()}), optional("keterangan", zNullable{zStr()}), optional("tercapaiAt", luaranTanggal), optional("buktiUrl", zNullable{zStr().URL("URL bukti tidak valid")}))
	luaranTargetFields     = []string{"jenis", "target", "targetTanggal"}
	luaranCapaianFields    = []string{"status", "judulCapaian", "keterangan", "tercapaiAt", "buktiUrl"}
	luaranDateFields       = map[string]bool{"targetTanggal": true, "tercapaiAt": true}
	luaranBuktiUploadRules = uploadRule{
		allowed:  []string{"application/pdf", mimeDOCX, "image/jpeg", "image/png", "image/webp"},
		maxBytes: maxUploadBytes, filterMsg: "Bukti harus berupa PDF, DOCX, JPG, PNG, atau WebP.",
		tooLargeMsg: "Ukuran file bukti maksimal 10 MB.", status: http.StatusBadRequest,
	}
)

// zNullable accepts null (to clear a column) or a value valid for inner.
type zNullable struct{ inner zSchema }

func (z zNullable) parse(value any, present bool, path []any, issues *[]zIssue) (any, int) {
	if present && value == nil {
		return nil, zValid
	}
	return z.inner.parse(value, present, path, issues)
}

func (s *Server) registerLuaranRoutes() {
	g := s.group("/api/v1/luaran", s.authenticate)
	g.get("/stats", authorize("dosen"), s.luaranStats)
	g.get("/proposal/:proposalId", s.listLuaran)
	g.post("/", authorize("dosen"), validateBody(createLuaranSchema), s.createLuaran)
	g.patch("/:id", authorize("dosen"), validateBody(updateLuaranSchema), s.updateLuaran)
	g.patch("/:id/capaian", authorize("dosen"), validateBody(updateCapaianSchema), s.updateLuaranCapaian)
	g.post("/:id/bukti", authorize("dosen"), multerFile("file", luaranBuktiUploadRules), s.uploadLuaranBukti)
	g.get("/:id/bukti", s.downloadLuaranBukti)
	g.delete("/:id", authorize("dosen"), s.deleteLuaran)
}

// ── helpers ──────────────────────────────────────────────────────────────

// endOfDay: target date counts until 23:59:59.999 UTC of that day.
func endOfDay(t time.Time) time.Time {
	y, m, d := t.UTC().Date()
	return time.Date(y, m, d, 23, 59, 59, int(999*time.Millisecond), time.UTC)
}

// withTepatWaktu adds `tepatWaktu`: true/false for achieved items with a
// target date, null otherwise.
func withTepatWaktu(items []O) {
	for i := range items {
		var tepat any
		target, okT := items[i].Get("targetTanggal").(JSTime)
		done, okD := items[i].Get("tercapaiAt").(JSTime)
		if items[i].Str("status") == "tercapai" && okT && okD {
			tepat = !time.Time(done).After(endOfDay(time.Time(target)))
		}
		items[i].Set("tepatWaktu", tepat)
	}
}

func (s *Server) luaranResponse(ctx context.Context, id int64) (O, error) {
	items, err := queryObjs(ctx, s.db, "SELECT "+luaranColumns+" FROM `LuaranKegiatan` WHERE `id` = ?", id)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, httpError(http.StatusNotFound, "Luaran tidak ditemukan")
	}
	withTepatWaktu(items)
	return items[0], nil
}

// proposalForLuaran loads the proposal (view) or answers 404.
func (s *Server) proposalForLuaran(ctx context.Context, proposalID int64) (*proposalRow, error) {
	p, err := s.proposalByID(ctx, s.db, proposalID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, httpError(http.StatusNotFound, proposalNotFound)
	}
	return p, nil
}

// ownedLuaran parses :id and returns the item's proposal, checking that the
// current user is its pengusul.
func (s *Server) ownedLuaran(c *Ctx) (int64, *proposalRow, error) {
	id, err := idParam(c, "id")
	if err != nil {
		return 0, nil, err
	}
	ctx := c.r.Context()
	var proposalID int64
	err = s.db.QueryRowContext(ctx, "SELECT `proposalId` FROM `LuaranKegiatan` WHERE `id` = ?", id).Scan(&proposalID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil, httpError(http.StatusNotFound, "Luaran tidak ditemukan")
	}
	if err != nil {
		return 0, nil, err
	}
	p, err := s.proposalForLuaran(ctx, proposalID)
	if err != nil {
		return 0, nil, err
	}
	if p.PengusulID != c.user.UserID {
		return 0, nil, httpError(http.StatusForbidden, "Hanya pengusul proposal yang dapat mengubah luaran")
	}
	return id, p, nil
}

func ensureTargetEditable(p *proposalRow) error {
	if p.Status != "draft" && p.Status != "revisi" {
		return httpError(http.StatusBadRequest, "Target luaran hanya bisa diubah saat proposal berstatus draft atau revisi")
	}
	return nil
}

// ensureCapaianEditable: proposal disetujui dan laporan belum diajukan.
func (s *Server) ensureCapaianEditable(ctx context.Context, p *proposalRow) error {
	if p.Status != "disetujui" {
		return httpError(http.StatusBadRequest, "Capaian luaran hanya bisa diisi setelah proposal disetujui")
	}
	var status string
	err := s.db.QueryRowContext(ctx, "SELECT `status` FROM `Laporan` WHERE `proposalId` = ?", p.ID).Scan(&status)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if status != "" && status != "draft" && status != "revisi" {
		return httpError(http.StatusBadRequest, "Capaian luaran tidak bisa diubah karena laporan sudah diajukan")
	}
	return nil
}

// luaranSets maps validated body fields to SET clauses (dates parsed).
func luaranSets(body map[string]any, fields []string) ([]string, []any, error) {
	sets := []string{}
	args := []any{}
	for _, field := range fields {
		v, ok := body[field]
		if !ok {
			continue
		}
		if text, isText := v.(string); isText && luaranDateFields[field] {
			t, err := parseJSDate(text)
			if err != nil {
				return nil, nil, httpError(http.StatusBadRequest, "Tanggal "+field+" tidak valid")
			}
			v = t
		}
		sets = append(sets, "`"+field+"` = ?")
		args = append(args, v)
	}
	return sets, args, nil
}

// ── handlers ─────────────────────────────────────────────────────────────

func (s *Server) listLuaran(c *Ctx) error {
	proposalID, err := idParam(c, "proposalId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if _, err := s.proposalForLuaran(ctx, proposalID); err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessRead); err != nil {
		return err
	}
	items, err := queryObjs(ctx, s.db, "SELECT "+luaranColumns+" FROM `LuaranKegiatan` WHERE `proposalId` = ? ORDER BY `id` ASC", proposalID)
	if err != nil {
		return err
	}
	withTepatWaktu(items)
	return c.ok("Luaran fetched", items)
}

func (s *Server) createLuaran(c *Ctx) error {
	body := c.bodyMap()
	ctx := c.r.Context()
	p, err := s.proposalForLuaran(ctx, int64(body["proposalId"].(float64)))
	if err != nil {
		return err
	}
	if p.PengusulID != c.user.UserID {
		return httpError(http.StatusForbidden, "Hanya pengusul proposal yang dapat mengubah luaran")
	}
	if err := ensureTargetEditable(p); err != nil {
		return err
	}
	var target any
	if text, ok := body["targetTanggal"].(string); ok {
		t, err := parseJSDate(text)
		if err != nil {
			return httpError(http.StatusBadRequest, "Tanggal targetTanggal tidak valid")
		}
		target = t
	}
	now := s.nowMs()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO `LuaranKegiatan` (`proposalId`,`jenis`,`target`,`targetTanggal`,`status`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,'belum',?,?)",
		p.ID, body["jenis"], body["target"], target, now, now)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	item, err := s.luaranResponse(ctx, id)
	if err != nil {
		return err
	}
	return c.created("Luaran berhasil ditambahkan", item)
}

func (s *Server) applyLuaranUpdate(c *Ctx, id int64, fields []string, message string) error {
	sets, args, err := luaranSets(c.bodyMap(), fields)
	if err != nil {
		return err
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, s.nowMs(), id)
	ctx := c.r.Context()
	if _, err := s.db.ExecContext(ctx, "UPDATE `LuaranKegiatan` SET "+strings.Join(sets, ", ")+" WHERE `id` = ?", args...); err != nil {
		return err
	}
	item, err := s.luaranResponse(ctx, id)
	if err != nil {
		return err
	}
	return c.ok(message, item)
}

func (s *Server) updateLuaran(c *Ctx) error {
	id, p, err := s.ownedLuaran(c)
	if err != nil {
		return err
	}
	if err := ensureTargetEditable(p); err != nil {
		return err
	}
	return s.applyLuaranUpdate(c, id, luaranTargetFields, "Luaran berhasil diperbarui")
}

func (s *Server) updateLuaranCapaian(c *Ctx) error {
	id, p, err := s.ownedLuaran(c)
	if err != nil {
		return err
	}
	if err := s.ensureCapaianEditable(c.r.Context(), p); err != nil {
		return err
	}
	body := c.bodyMap()
	switch body["status"] {
	case "tercapai":
		// tanggal capaian default hari ini jika tidak dikirim dan belum ada
		if _, ok := body["tercapaiAt"]; !ok {
			var existing sql.NullTime
			if err := s.db.QueryRowContext(c.r.Context(), "SELECT `tercapaiAt` FROM `LuaranKegiatan` WHERE `id` = ?", id).Scan(&existing); err != nil {
				return err
			}
			if !existing.Valid {
				body["tercapaiAt"] = formatJSTime(s.nowMs())
			}
		}
	case "belum":
		body["tercapaiAt"] = nil
	}
	return s.applyLuaranUpdate(c, id, luaranCapaianFields, "Capaian luaran berhasil disimpan")
}

func (s *Server) uploadLuaranBukti(c *Ctx) error {
	id, p, err := s.ownedLuaran(c)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.ensureCapaianEditable(ctx, p); err != nil {
		return err
	}
	if c.file == nil {
		return httpError(http.StatusBadRequest, "File bukti tidak ditemukan dalam request.")
	}
	detected := detectFileType(c.file.data)
	if !validEnum(detected, luaranBuktiUploadRules.allowed) {
		return httpError(http.StatusBadRequest, "Isi file bukti bukan PDF, DOCX, JPG, PNG, atau WebP yang valid.")
	}
	if _, err := s.db.ExecContext(ctx,
		"UPDATE `LuaranKegiatan` SET `buktiBlob` = ?, `buktiNama` = ?, `buktiMime` = ?, `buktiUkuran` = ?, `updatedAt` = ? WHERE `id` = ?",
		c.file.data, c.file.originalname, detected, c.file.size, s.nowMs(), id); err != nil {
		return err
	}
	item, err := s.luaranResponse(ctx, id)
	if err != nil {
		return err
	}
	return c.ok("Bukti luaran berhasil diunggah", item)
}

func (s *Server) downloadLuaranBukti(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	var proposalID int64
	var f storedFile
	err = s.db.QueryRowContext(ctx, "SELECT `proposalId`,`buktiBlob`,`buktiMime`,`buktiNama`,`buktiUkuran` FROM `LuaranKegiatan` WHERE `id` = ?", id).
		Scan(&proposalID, &f.blob, &f.mime, &f.name, &f.size)
	if errors.Is(err, sql.ErrNoRows) {
		return httpError(http.StatusNotFound, "Luaran tidak ditemukan")
	}
	if err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessRead); err != nil {
		return err
	}
	if f.blob == nil {
		return httpError(http.StatusNotFound, "File bukti tidak ditemukan.")
	}
	name := f.name.String
	if name == "" {
		name = "bukti-luaran"
	}
	return c.sendFile(f.blob, f.mime.String, name, f.length())
}

func (s *Server) deleteLuaran(c *Ctx) error {
	id, p, err := s.ownedLuaran(c)
	if err != nil {
		return err
	}
	if err := ensureTargetEditable(p); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(c.r.Context(), "DELETE FROM `LuaranKegiatan` WHERE `id` = ?", id); err != nil {
		return err
	}
	return c.ok("Luaran berhasil dihapus", noData)
}

// luaranStats (W-01, W-02, W-12): ringkasan luaran milik user sebagai pengusul.
func (s *Server) luaranStats(c *Ctx) error {
	rows, err := queryObjs(c.r.Context(), s.db,
		"SELECT lk.`jenis`, lk.`status`, (SELECT l.`status` FROM `Laporan` l WHERE l.`proposalId` = lk.`proposalId`) AS `laporanStatus`"+
			" FROM `LuaranKegiatan` lk JOIN `Proposal` p ON p.`id` = lk.`proposalId` WHERE p.`pengusulId` = ?", c.user.UserID)
	if err != nil {
		return err
	}
	var total, tercapai, diklaim, jurnal int64
	perJenis := map[string]int64{}
	for _, row := range rows {
		total++
		perJenis[row.Str("jenis")]++
		if row.Str("status") != "tercapai" {
			continue
		}
		tercapai++
		if row.Str("laporanStatus") == "disetujui" {
			diklaim++
			if row.Str("jenis") == "jurnal" {
				jurnal++
			}
		}
	}
	jenis := O{}
	for _, j := range luaranJenis {
		jenis = append(jenis, KV{j, perJenis[j]})
	}
	return c.ok("Statistik luaran fetched", O{
		{"total", total}, {"tercapai", tercapai}, {"dapatDiklaim", diklaim}, {"jurnal", jurnal}, {"perJenis", jenis},
	})
}
