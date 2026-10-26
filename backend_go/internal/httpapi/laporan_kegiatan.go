package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// Fitur laporan (baris tipe 'laporan' di tabel Penelitian/Pengabdian).
// Tidak ada padanannya di backend Node: endpoint baru, dokumentasi untuk
// frontend ada di new-api.md. Berbeda dengan endpoint port Node, error bisnis
// di sini memakai status HTTP yang sesuai (400/403/404/409), bukan 500.
//
// Alur: proposal disetujui ketua → pengusul membuat laporan (draft, data
// proposal disalin) → mengisi luaran tercapai + dokumen → submit (diajukan,
// ketua dinotifikasi) → ketua/admin menugaskan reviewer (review) → reviewer
// menyimpan & finalisasi review → ketua/admin memutuskan
// (revisi|disetujui|ditolak).
//
// Tugasan & review laporan memakai tabel ReviewerTugasan/ProposalReview yang
// sama, dengan proposalId = id laporan (id unik global dari `Kegiatan`).

var (
	laporanScalars = []string{"id", "tipe", "proposalId", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "skema", "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan", "rumpunIlmu", "bidang", "kataKunci", "luaranTercapai", "ringkasanHasil", "realisasiAnggaran", "metodePenelitian",
		"catatanRevisi", "dokumenUrl", "dokumenNama", "dokumenMime", "dokumenUkuran", "submittedAt", "approvedAt", "createdAt", "updatedAt"}

	laporanListQuerySchema = zObj(
		withDefault("page", zNum().Coerce().Int().Positive(), float64(1)),
		withDefault("limit", zNum().Coerce().Int().Positive().Max(100), float64(10)),
		zField{name: "jenis", schema: zEnumOf(jenisKegiatan...), optional: true, emptyIsUndef: true},
		zField{name: "status", schema: zEnumOf(proposalStatuses...), optional: true, emptyIsUndef: true},
		zField{name: "periodeId", schema: zNum().Coerce().Int().Positive(), optional: true, emptyIsUndef: true},
		zField{name: "search", schema: zStr(), optional: true, emptyIsUndef: true},
	)
	laporanEditableFields = []zField{
		optional("judul", zStr().Min(5, "Judul minimal 5 karakter")),
		optional("abstrak", zStr().Min(20, "Abstrak minimal 20 karakter")),
		optional("luaranTercapai", zStr()),
		optional("ringkasanHasil", zStr()),
		optional("realisasiAnggaran", zNum().NonNegative()),
		optional("dokumenUrl", zStr().URL("URL dokumen tidak valid")),
		optional("kataKunci", zKataKunci{}),             // W-27
		optional("metodePenelitian", zNullable{zStr()}), // W-28, khusus laporan penelitian
	}
	createLaporanKegiatanSchema = zObj(append([]zField{required("proposalId", zNum().Int().Positive())}, laporanEditableFields...)...)
	updateLaporanKegiatanSchema = zObj(laporanEditableFields...)

	laporanNotifByStatus = map[string]string{
		"disetujui": "laporan_disetujui",
		"ditolak":   "laporan_ditolak",
		"revisi":    "laporan_revisi",
	}
)

const laporanAccessDenied = "Anda tidak memiliki akses ke laporan ini"

func (s *Server) registerLaporanKegiatanRoutes() {
	g := s.group("/api/v1/laporan", s.authenticate)
	g.get("/", authorize("admin", "ketua_lppm"), s.validateQuery(laporanListQuerySchema), s.listLaporanKegiatan)
	g.get("/my", authorize("dosen"), s.validateQuery(laporanListQuerySchema), s.myLaporanKegiatan)
	g.get("/eligible", authorize("dosen"), s.eligibleLaporanProposals)
	g.get("/tugasan", s.requireReviewerRole, s.validateQuery(reviewerPaginationSchema), s.myLaporanTugasan)
	g.post("/", authorize("dosen"), validateBody(createLaporanKegiatanSchema), s.createLaporanKegiatan)
	g.get("/:id", s.getLaporanKegiatan)
	g.patch("/:id", authorize("dosen"), validateBody(updateLaporanKegiatanSchema), s.updateLaporanKegiatan)
	g.post("/:id/submit", authorize("dosen"), s.submitLaporanKegiatan)
	g.delete("/:id", authorize("dosen", "admin"), s.deleteLaporanKegiatan)
	g.get("/:id/deletion-request", authorize("admin", "ketua_lppm"), s.pendingDokumenHapus("laporan")) // baru (W-34)
	g.post("/:id/deletion-request", authorize("admin"), s.requestDokumenHapus("laporan"))              // baru (W-34)
	g.post("/:id/dokumen", authorize("dosen"), multerSingle("file"), s.uploadLaporanKegiatanDokumen)
	g.get("/:id/dokumen", s.downloadLaporanKegiatanDokumen)
	g.patch("/:id/status", authorize("ketua_lppm", "admin"), validateBody(updateStatusProposalSchema), s.updateLaporanKegiatanStatus)
	g.post("/:id/reviewers", authorize("ketua_lppm", "admin"), validateBody(tugaskanReviewerSchema), s.tugaskanLaporanReviewer)
	g.delete("/:id/reviewers/:reviewerId", authorize("ketua_lppm", "admin"), s.hapusLaporanReviewer)
	g.get("/:id/reviews", s.getLaporanReviews)
	g.post("/:id/reviews", s.requireReviewerRole, validateBody(submitReviewSchema), s.submitLaporanReview)
	g.post("/:id/reviews/finalize", s.requireReviewerRole, s.finalizeLaporanReview)
}

// ── helpers ──────────────────────────────────────────────────────────────

// idParam parses a positive integer path parameter (HTTP 400 otherwise).
func idParam(c *Ctx, name string) (int64, error) {
	id, err := strconv.ParseInt(c.param(name), 10, 32)
	if err != nil || id <= 0 {
		return 0, httpError(http.StatusBadRequest, "Parameter "+name+" tidak valid.")
	}
	return id, nil
}

type laporanRow struct {
	ID             int64
	ProposalID     int64
	Judul          string
	Status         string
	Jenis          string
	PengusulID     int64
	LuaranTercapai sql.NullString
	DokumenNama    sql.NullString
	DokumenURL     sql.NullString
}

// laporanByID reads a laporan from the `Laporan` view (404 when missing).
func (s *Server) laporanByID(ctx context.Context, id int64) (*laporanRow, error) {
	var l laporanRow
	err := s.db.QueryRowContext(ctx,
		"SELECT `id`,`proposalId`,`judul`,`status`,`jenis`,`pengusulId`,`luaranTercapai`,`dokumenNama`,`dokumenUrl` FROM `Laporan` WHERE `id` = ?", id).
		Scan(&l.ID, &l.ProposalID, &l.Judul, &l.Status, &l.Jenis, &l.PengusulID, &l.LuaranTercapai, &l.DokumenNama, &l.DokumenURL)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpError(http.StatusNotFound, "Laporan tidak ditemukan")
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// loadLaporanParam parses :id, loads the laporan and checks access.
// level accessWrite = pengusul only; accessRead also allows ketua/admin,
// anggota (diterima) of the source proposal and assigned reviewers.
func (s *Server) loadLaporanParam(c *Ctx, level string) (*laporanRow, error) {
	id, err := idParam(c, "id")
	if err != nil {
		return nil, err
	}
	l, err := s.laporanByID(c.r.Context(), id)
	if err != nil {
		return nil, err
	}
	if err := s.ensureLaporanAccess(c.r.Context(), l, c.user, level); err != nil {
		return nil, err
	}
	return l, nil
}

func (s *Server) ensureLaporanAccess(ctx context.Context, l *laporanRow, user *tokenPayload, level string) error {
	if l.PengusulID == user.UserID {
		return nil
	}
	denied := httpError(http.StatusForbidden, laporanAccessDenied)
	if level == accessWrite {
		return denied
	}
	if hasAnyRole(user.Roles, "admin", "ketua_lppm") {
		return nil
	}
	n, err := countRows(ctx, s.db,
		"SELECT (SELECT COUNT(*) FROM `ProposalAnggota` WHERE `proposalId` = ? AND `userId` = ? AND `statusUndangan` = 'diterima')"+
			" + (SELECT COUNT(*) FROM `ReviewerTugasan` WHERE `proposalId` = ? AND `reviewerId` = ?)",
		l.ProposalID, user.UserID, l.ID, user.UserID)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	return denied
}

// loadLaporanKegiatan runs `SELECT ... FROM Laporan p <tail>` with relations:
// pengusul, periode, proposal (sumber), reviewerTugasan and, for detail,
// anggota (dari proposal sumber) and reviews.
func (s *Server) loadLaporanKegiatan(ctx context.Context, detail bool, tail string, args ...any) ([]O, error) {
	items, err := queryObjs(ctx, s.db,
		"SELECT "+prefixed("p", laporanScalars, "")+", p.`pengusulId` AS `__pengusulId`, p.`periodeId` AS `__periodeId`, p.`proposalId` AS `__proposalId` FROM `Laporan` p "+tail,
		args...)
	if err != nil || len(items) == 0 {
		return items, err
	}
	decodeKataKunci(items)
	if err := attachOne(ctx, s.db, items, "__pengusulId", "pengusul",
		"SELECT `id` AS `__k`,`id`,`name`,`fullName`,`email`,`nidn`,`programStudi` FROM `User` WHERE `id` IN (%s)"); err != nil {
		return nil, err
	}
	if err := attachOne(ctx, s.db, items, "__periodeId", "periode",
		"SELECT `id` AS `__k`,`id`,`nama`,`tahun`,`jenis` FROM `Periode` WHERE `id` IN (%s)"); err != nil {
		return nil, err
	}
	if err := attachOne(ctx, s.db, items, "__proposalId", "proposal",
		"SELECT `id` AS `__k`,`id`,`judul`,`status`,`luaran`,`approvedAt` FROM `Proposal` WHERE `id` IN (%s)"); err != nil {
		return nil, err
	}
	if detail {
		grouped, err := attachMany(ctx, s.db, items, "__proposalId", "anggota",
			"SELECT a.`proposalId` AS `__k`,a.`id`,a.`peran`,a.`statusUndangan`,u.`id` AS `u_id`,u.`name` AS `u_name`,u.`fullName` AS `u_fullName`,u.`email` AS `u_email`,u.`kontak` AS `u_kontak`,u.`noHp` AS `u_noHp` "+
				"FROM `ProposalAnggota` a JOIN `User` u ON u.`id` = a.`userId` WHERE a.`proposalId` IN (%s) ORDER BY a.`id` ASC")
		if err != nil {
			return nil, err
		}
		for _, list := range grouped {
			nestColumns(list, "u_", "user")
		}
	}
	grouped, err := attachMany(ctx, s.db, items, "id", "reviewerTugasan",
		"SELECT t.`proposalId` AS `__k`,t.`id`,t.`reviewerId`,u.`id` AS `r_id`,u.`name` AS `r_name`,u.`fullName` AS `r_fullName`,u.`email` AS `r_email`,t.`createdAt` "+
			"FROM `ReviewerTugasan` t JOIN `User` u ON u.`id` = t.`reviewerId` WHERE t.`proposalId` IN (%s) ORDER BY t.`id` ASC")
	if err != nil {
		return nil, err
	}
	for _, list := range grouped {
		nestColumns(list, "r_", "reviewer")
	}
	if detail {
		grouped, err := attachMany(ctx, s.db, items, "id", "reviews", laporanReviewsQuery+" WHERE rv.`proposalId` IN (%s) ORDER BY rv.`id` ASC")
		if err != nil {
			return nil, err
		}
		for _, list := range grouped {
			nestColumns(list, "r_", "reviewer")
		}
	}
	stripInternal(items)
	return items, nil
}

const laporanReviewsQuery = "SELECT rv.`proposalId` AS `__k`,rv.`id`,rv.`nilaiRelevansi`,rv.`nilaiMetodologi`,rv.`nilaiAnggaran`,rv.`nilaiLuaran`,rv.`catatan`,rv.`rekomendasi`,rv.`isDone`," +
	"u.`id` AS `r_id`,u.`name` AS `r_name`,u.`fullName` AS `r_fullName`,rv.`createdAt`,rv.`updatedAt` FROM `ProposalReview` rv JOIN `User` u ON u.`id` = rv.`reviewerId`"

func (s *Server) laporanResponse(ctx context.Context, id int64, detail bool) (O, error) {
	items, err := s.loadLaporanKegiatan(ctx, detail, "WHERE p.`id` = ?", id)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, httpError(http.StatusNotFound, "Laporan tidak ditemukan")
	}
	return items[0], nil
}

func nullableString(ns sql.NullString) any {
	if ns.Valid {
		return ns.String
	}
	return nil
}

// laporanFieldSets maps the validated body to SET columns.
// metodePenelitian hanya ada di tabel Penelitian: nilai bukan null untuk laporan
// pengabdian → 400, null diabaikan.
func laporanFieldSets(body map[string]any, jenis string) ([]string, []any, error) {
	cols := []string{}
	args := []any{}
	for _, field := range []string{"judul", "abstrak", "luaranTercapai", "ringkasanHasil", "realisasiAnggaran", "dokumenUrl", "kataKunci", "metodePenelitian"} {
		v, ok := body[field]
		if !ok {
			continue
		}
		switch field {
		case "kataKunci":
			v = encodeKataKunci(v)
		case "metodePenelitian":
			if jenis != "penelitian" {
				if v != nil {
					return nil, nil, httpError(http.StatusBadRequest, "Metode penelitian hanya untuk laporan penelitian")
				}
				continue
			}
		}
		cols = append(cols, field)
		args = append(args, v)
	}
	return cols, args, nil
}

func (s *Server) ketuaUserIDs(ctx context.Context) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT DISTINCT u.`id` FROM `User` u JOIN `UserRole` ur ON ur.`userId` = u.`id` JOIN `Role` r ON r.`id` = ur.`roleId` WHERE r.`name` = 'ketua_lppm' AND u.`status` = 'approved' ORDER BY u.`id`")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *Server) logLaporan(ctx context.Context, c *Ctx, l *laporanRow, action, detail string) error {
	var d any
	if detail != "" {
		d = detail
	}
	return s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "laporan_kegiatan." + action, EntityType: "laporan", EntityID: l.ID, ProposalID: l.ProposalID, Detail: d,
	})
}

// ── list ─────────────────────────────────────────────────────────────────

func (s *Server) findLaporanKegiatan(c *Ctx, pengusulID int64, message string) error {
	q := c.validatedQuery
	f := proposalFilters{page: q["page"].(float64), limit: q["limit"].(float64), pengusulID: pengusulID}
	f.jenis, _ = q["jenis"].(string)
	f.status, _ = q["status"].(string)
	f.periodeID, _ = q["periodeId"].(float64)
	search, _ := q["search"].(string)
	f.search = strings.TrimSpace(search)
	where, args, err := buildProposalWhere(f)
	if err != nil {
		return err
	}
	skip, take, err := paginationArgs(f.page, f.limit)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	items, err := s.loadLaporanKegiatan(ctx, false, where+" ORDER BY p.`createdAt` DESC, p.`id` DESC LIMIT ? OFFSET ?", append(append([]any{}, args...), take, skip)...)
	if err != nil {
		return err
	}
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `Laporan` p "+where, args...)
	if err != nil {
		return err
	}
	return c.okMeta(message, items, int64(f.page), int64(f.limit), total)
}

func (s *Server) listLaporanKegiatan(c *Ctx) error {
	return s.findLaporanKegiatan(c, 0, "Laporan fetched")
}

func (s *Server) myLaporanKegiatan(c *Ctx) error {
	return s.findLaporanKegiatan(c, c.user.UserID, "Laporan saya fetched")
}

// eligibleLaporanProposals lists the user's approved proposals that do not
// have a laporan yet (pilihan saat membuat laporan).
func (s *Server) eligibleLaporanProposals(c *Ctx) error {
	ctx := c.r.Context()
	items, err := queryObjs(ctx, s.db,
		"SELECT p.`id`,p.`judul`,p.`jenis`,p.`status`,p.`anggaran`,p.`luaran`,p.`approvedAt`,p.`periodeId` AS `__periodeId` FROM `Proposal` p"+
			" WHERE p.`pengusulId` = ? AND p.`status` = 'disetujui' AND NOT EXISTS (SELECT 1 FROM `Laporan` l WHERE l.`proposalId` = p.`id`)"+
			" ORDER BY p.`approvedAt` DESC, p.`id` DESC", c.user.UserID)
	if err != nil {
		return err
	}
	if err := attachOne(ctx, s.db, items, "__periodeId", "periode",
		"SELECT `id` AS `__k`,`id`,`nama`,`tahun`,`jenis` FROM `Periode` WHERE `id` IN (%s)"); err != nil {
		return err
	}
	stripInternal(items)
	return c.ok("Proposal siap dilaporkan fetched", items)
}

// myLaporanTugasan mirrors GET /reviewer/my-tugasan for laporan.
func (s *Server) myLaporanTugasan(c *Ctx) error {
	q := c.validatedQuery
	page, limit := q["page"].(float64), q["limit"].(float64)
	skip, take, err := paginationArgs(page, limit)
	if err != nil {
		return err
	}
	reviewerID := c.user.UserID
	ctx := c.r.Context()
	const join = " JOIN `Kegiatan` k ON k.`id` = t.`proposalId` AND k.`tipe` = 'laporan'"
	tugasan, err := queryObjs(ctx, s.db,
		"SELECT t.`id`,t.`proposalId` AS `laporanId`,t.`reviewerId`,t.`createdAt`,t.`proposalId` AS `__lid` FROM `ReviewerTugasan` t"+join+
			" WHERE t.`reviewerId` = ? ORDER BY t.`createdAt` DESC, t.`id` DESC LIMIT ? OFFSET ?",
		reviewerID, take, skip)
	if err != nil {
		return err
	}
	if err := attachOne(ctx, s.db, tugasan, "__lid", "laporan",
		"SELECT l.`id` AS `__k`,l.`id`,l.`proposalId`,l.`judul`,l.`status`,l.`jenis`,u.`id` AS `u_id`,u.`name` AS `u_name` FROM `Laporan` l JOIN `User` u ON u.`id` = l.`pengusulId` WHERE l.`id` IN (%s)"); err != nil {
		return err
	}
	for i := range tugasan {
		if l, ok := tugasan[i].Get("laporan").(O); ok {
			list := []O{l}
			nestColumns(list, "u_", "pengusul")
			tugasan[i].Set("laporan", list[0])
		}
	}
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ReviewerTugasan` t"+join+" WHERE t.`reviewerId` = ?", reviewerID)
	if err != nil {
		return err
	}
	ids := uniqueIDs(tugasan, "laporanId")
	reviews := map[int64]O{}
	if len(ids) > 0 {
		rows, err := queryObjs(ctx, s.db,
			"SELECT `id`,`proposalId` AS `laporanId`,`nilaiRelevansi`,`nilaiMetodologi`,`nilaiAnggaran`,`nilaiLuaran`,`catatan`,`rekomendasi`,`isDone` FROM `ProposalReview` WHERE `reviewerId` = ? AND `proposalId` IN ("+placeholders(len(ids))+")",
			append([]any{reviewerID}, idArgs(ids)...)...)
		if err != nil {
			return err
		}
		for _, row := range rows {
			reviews[row.Int64("laporanId")] = row
		}
	}
	stripInternal(tugasan)
	for i := range tugasan {
		var mine any
		if r, ok := reviews[tugasan[i].Int64("laporanId")]; ok {
			mine = r
		}
		tugasan[i].Set("myReview", mine)
	}
	return c.okMeta("Tugasan review laporan fetched", tugasan, int64(page), int64(limit), total)
}

// ── CRUD ─────────────────────────────────────────────────────────────────

func (s *Server) createLaporanKegiatan(c *Ctx) error {
	body := c.bodyMap()
	proposalID := int64(body["proposalId"].(float64))
	ctx := c.r.Context()
	p, err := s.proposalByID(ctx, s.db, proposalID)
	if err != nil {
		return err
	}
	if p == nil {
		return httpError(http.StatusNotFound, proposalNotFound)
	}
	if p.PengusulID != c.user.UserID {
		return httpError(http.StatusForbidden, "Hanya pengusul proposal yang dapat membuat laporan")
	}
	if p.Status != "disetujui" {
		return httpError(http.StatusBadRequest, "Laporan hanya bisa dibuat untuk proposal yang sudah disetujui")
	}
	exists, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `Laporan` WHERE `proposalId` = ?", proposalID)
	if err != nil {
		return err
	}
	if exists > 0 {
		return httpError(http.StatusConflict, "Proposal ini sudah memiliki laporan")
	}

	// Data proposal disalin sebagai isi awal laporan (termasuk skema/mitra + detail mitra).
	var abstrak string
	var anggaran, luaran, skema, mitra, rumpunIlmu, bidang, kataKunci sql.NullString
	var mitraJenis, mitraAlamat, mitraKontak, mitraKebutuhan sql.NullString
	var periodeID sql.NullInt64
	if err := s.db.QueryRowContext(ctx, "SELECT `abstrak`,`anggaran`,`luaran`,`skema`,`mitra`,`mitraJenis`,`mitraAlamat`,`mitraKontak`,`mitraKebutuhan`,`rumpunIlmu`,`bidang`,`kataKunci`,`periodeId` FROM `Proposal` WHERE `id` = ?", proposalID).
		Scan(&abstrak, &anggaran, &luaran, &skema, &mitra, &mitraJenis, &mitraAlamat, &mitraKontak, &mitraKebutuhan, &rumpunIlmu, &bidang, &kataKunci, &periodeID); err != nil {
		return err
	}
	var periode any
	if periodeID.Valid {
		periode = periodeID.Int64
	}
	values := map[string]any{"judul": p.Judul, "abstrak": abstrak, "kataKunci": nullableString(kataKunci)}
	cols, args, err := laporanFieldSets(body, p.Jenis)
	if err != nil {
		return err
	}
	for i, col := range cols {
		values[col] = args[i]
	}
	now := s.nowMs()
	insertCols := []string{"proposalId", "judul", "abstrak", "status", "anggaran", "luaran", "luaranTercapai", "ringkasanHasil", "realisasiAnggaran",
		"pengusulId", "periodeId", "dokumenUrl", "createdAt", "updatedAt"}
	insertArgs := []any{proposalID, values["judul"], values["abstrak"], "draft", nullableString(anggaran), nullableString(luaran),
		values["luaranTercapai"], values["ringkasanHasil"], values["realisasiAnggaran"], p.PengusulID, periode, values["dokumenUrl"], now, now}
	insertCols = append(insertCols, "rumpunIlmu", "bidang", "kataKunci")
	insertArgs = append(insertArgs, nullableString(rumpunIlmu), nullableString(bidang), values["kataKunci"])
	// skema/mitra/metodePenelitian hanya ada di tabel jenisnya masing-masing.
	if p.Jenis == "penelitian" {
		insertCols = append(insertCols, "skema", "metodePenelitian")
		insertArgs = append(insertArgs, nullableString(skema), values["metodePenelitian"])
	} else {
		insertCols = append(insertCols, "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan")
		insertArgs = append(insertArgs, nullableString(mitra), nullableString(mitraJenis), nullableString(mitraAlamat), nullableString(mitraKontak), nullableString(mitraKebutuhan))
	}
	var id int64
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		var err error
		id, err = s.insertKegiatan(ctx, tx, p.Jenis, tipeLaporan, insertCols, insertArgs)
		return err
	})
	if err != nil {
		return err
	}
	if err := s.logLaporan(ctx, c, &laporanRow{ID: id, ProposalID: proposalID}, "create", `Laporan untuk proposal "`+p.Judul+`" dibuat sebagai draft`); err != nil {
		return err
	}
	laporan, err := s.laporanResponse(ctx, id, false)
	if err != nil {
		return err
	}
	return c.created("Laporan berhasil dibuat", laporan)
}

func (s *Server) getLaporanKegiatan(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessRead)
	if err != nil {
		return err
	}
	laporan, err := s.laporanResponse(c.r.Context(), l.ID, true)
	if err != nil {
		return err
	}
	return c.ok("Laporan fetched", laporan)
}

func ensureLaporanEditable(l *laporanRow) error {
	if l.Status != "draft" && l.Status != "revisi" {
		return httpError(http.StatusBadRequest, "Laporan hanya bisa diubah saat status draft atau revisi")
	}
	return nil
}

func (s *Server) updateLaporanKegiatan(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessWrite)
	if err != nil {
		return err
	}
	if err := ensureLaporanEditable(l); err != nil {
		return err
	}
	ctx := c.r.Context()
	cols, args, err := laporanFieldSets(c.bodyMap(), l.Jenis)
	if err != nil {
		return err
	}
	sets := make([]string, 0, len(cols)+1)
	for _, col := range cols {
		sets = append(sets, "`"+col+"` = ?")
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, s.nowMs())
	if err := s.updateKegiatan(ctx, s.db, l.ID, strings.Join(sets, ", "), args...); err != nil {
		return err
	}
	if err := s.logLaporan(ctx, c, l, "update", `Laporan "`+l.Judul+`" diperbarui`); err != nil {
		return err
	}
	laporan, err := s.laporanResponse(ctx, l.ID, false)
	if err != nil {
		return err
	}
	return c.ok("Laporan berhasil diperbarui", laporan)
}

func (s *Server) submitLaporanKegiatan(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessWrite)
	if err != nil {
		return err
	}
	if l.Status != "draft" && l.Status != "revisi" {
		return httpError(http.StatusBadRequest, "Hanya laporan berstatus draft atau revisi yang bisa diajukan")
	}
	if strings.TrimSpace(l.LuaranTercapai.String) == "" {
		return httpError(http.StatusBadRequest, "Luaran tercapai wajib diisi sebelum laporan diajukan")
	}
	if !l.DokumenNama.Valid && strings.TrimSpace(l.DokumenURL.String) == "" {
		return httpError(http.StatusBadRequest, "Dokumen laporan (file atau URL) wajib diunggah sebelum laporan diajukan")
	}
	ctx := c.r.Context()
	now := s.nowMs()
	if err := s.updateKegiatan(ctx, s.db, l.ID, "`status` = 'diajukan', `submittedAt` = ?, `updatedAt` = ?", now, now); err != nil {
		return err
	}
	ketua, err := s.ketuaUserIDs(ctx)
	if err != nil {
		return err
	}
	for _, uid := range ketua {
		if err := s.createNotification(ctx, s.db, notification{
			UserID: uid, Type: "laporan_diajukan", Judul: "Laporan Diajukan",
			Pesan: `Laporan "` + l.Judul + `" telah diajukan dan menunggu penugasan reviewer`,
			RefID: l.ID, RefType: "laporan",
		}); err != nil {
			return err
		}
	}
	if err := s.logLaporan(ctx, c, l, "submit", `Laporan "`+l.Judul+`" diajukan`); err != nil {
		return err
	}
	laporan, err := s.laporanResponse(ctx, l.ID, false)
	if err != nil {
		return err
	}
	return c.ok("Laporan berhasil diajukan", laporan)
}

func (s *Server) deleteLaporanKegiatan(c *Ctx) error {
	level := accessWrite
	if hasAnyRole(c.user.Roles, "admin") {
		level = accessRead
	}
	l, err := s.loadLaporanParam(c, level)
	if err != nil {
		return err
	}
	if l.Status != "draft" {
		return httpError(http.StatusBadRequest, "Hanya laporan berstatus draft yang bisa dihapus")
	}
	ctx := c.r.Context()
	if err := s.deleteKegiatan(ctx, s.db, l.ID); err != nil {
		return err
	}
	// The laporan id no longer exists in Kegiatan: log against the proposal.
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "laporan_kegiatan.delete", EntityType: "laporan", EntityID: l.ID, ProposalID: l.ProposalID,
		Detail: `Laporan "` + l.Judul + `" dihapus`,
	}); err != nil {
		return err
	}
	return c.ok("Laporan berhasil dihapus", noData)
}

// ── dokumen ──────────────────────────────────────────────────────────────

func (s *Server) uploadLaporanKegiatanDokumen(c *Ctx) error {
	file, err := requireUploadedProposalFile(c)
	if err != nil {
		return err
	}
	l, err := s.loadLaporanParam(c, accessWrite)
	if err != nil {
		return err
	}
	if err := ensureLaporanEditable(l); err != nil {
		return err
	}
	verified, err := validateFileIsAllowedDocument(file.data)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.updateKegiatan(ctx, s.db, l.ID,
		"`dokumenBlob` = ?, `dokumenNama` = ?, `dokumenMime` = ?, `dokumenUkuran` = ?, `dokumenUrl` = NULL, `updatedAt` = ?",
		file.data, file.originalname, verified, file.size, s.nowMs()); err != nil {
		return err
	}
	updated, err := queryObj(ctx, s.db, "SELECT `id`,`dokumenNama`,`dokumenMime`,`dokumenUkuran` FROM `Laporan` WHERE `id` = ?", l.ID)
	if err != nil {
		return err
	}
	if err := s.logLaporan(ctx, c, l, "dokumen.upload", `Dokumen "`+file.originalname+`" diunggah untuk laporan "`+l.Judul+`"`); err != nil {
		return err
	}
	return c.ok("Dokumen laporan berhasil diunggah", updated)
}

func (s *Server) downloadLaporanKegiatanDokumen(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessRead)
	if err != nil {
		return err
	}
	f, found, err := s.kegiatanFile(c.r.Context(), l.ID)
	if err != nil {
		return err
	}
	if !found || f.blob == nil {
		return httpError(http.StatusNotFound, "Dokumen tidak ditemukan.")
	}
	name := f.name.String
	if name == "" {
		name = "laporan"
	}
	return c.sendFile(f.blob, f.mime.String, name, f.length())
}

// ── keputusan ketua/admin ────────────────────────────────────────────────

func (s *Server) updateLaporanKegiatanStatus(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessRead)
	if err != nil {
		return err
	}
	if l.Status == "draft" {
		return httpError(http.StatusBadRequest, "Laporan belum diajukan")
	}
	body := c.bodyMap()
	status, _ := getString(body, "status")
	catatan, hasCatatan := getString(body, "catatanRevisi")
	now := s.nowMs()
	sets := []string{"`status` = ?", "`catatanRevisi` = ?"}
	args := []any{status, nil}
	if hasCatatan && status != "review" {
		args[1] = catatan
	}
	if status == "disetujui" {
		sets = append(sets, "`approvedAt` = ?")
		args = append(args, now)
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, now)
	ctx := c.r.Context()
	if err := s.updateKegiatan(ctx, s.db, l.ID, strings.Join(sets, ", "), args...); err != nil {
		return err
	}
	if notifType, ok := laporanNotifByStatus[status]; ok {
		pesan := `Laporan "` + l.Judul + `" telah ` + status
		if hasCatatan && catatan != "" {
			pesan += ". Catatan: " + catatan
		}
		if err := s.createNotification(ctx, s.db, notification{
			UserID: l.PengusulID, Type: notifType, Judul: "Laporan " + status, Pesan: pesan,
			RefID: l.ID, RefType: "laporan",
		}); err != nil {
			return err
		}
	}
	if err := s.logLaporan(ctx, c, l, "status."+status, `Status laporan "`+l.Judul+`" diubah menjadi `+status); err != nil {
		return err
	}
	laporan, err := s.laporanResponse(ctx, l.ID, false)
	if err != nil {
		return err
	}
	return c.ok("Status laporan diperbarui", laporan)
}

// ── reviewer & review ────────────────────────────────────────────────────

func (s *Server) tugaskanLaporanReviewer(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessRead)
	if err != nil {
		return err
	}
	if l.Status != "diajukan" && l.Status != "review" {
		return httpError(http.StatusBadRequest, "Laporan harus berstatus diajukan atau review untuk ditugaskan reviewer")
	}
	raw, _ := c.bodyMap()["reviewerIds"].([]any)
	seen := map[int64]bool{}
	ids := []int64{}
	for _, v := range raw {
		id := int64(v.(float64))
		if id == l.PengusulID {
			return httpError(http.StatusBadRequest, "Pengusul tidak dapat menjadi reviewer laporannya sendiri")
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	ctx := c.r.Context()
	if err := s.ensureReviewerCandidates(ctx, ids); err != nil {
		return err
	}
	now := s.nowMs()
	values := make([]string, len(ids))
	args := make([]any, 0, len(ids)*3)
	for i, rid := range ids {
		values[i] = "(?,?,?)"
		args = append(args, l.ID, rid, now)
	}
	if _, err := s.db.ExecContext(ctx, "INSERT IGNORE INTO `ReviewerTugasan` (`proposalId`,`reviewerId`,`createdAt`) VALUES "+strings.Join(values, ","), args...); err != nil {
		return err
	}
	if err := s.updateKegiatan(ctx, s.db, l.ID, "`status` = 'review', `updatedAt` = ?", now); err != nil {
		return err
	}
	for _, rid := range ids {
		if err := s.createNotification(ctx, s.db, notification{
			UserID: rid, Type: "reviewer_ditugaskan", Judul: "Tugas Review Laporan",
			Pesan: `Anda ditugaskan untuk mereview laporan "` + l.Judul + `"`,
			RefID: l.ID, RefType: "laporan",
		}); err != nil {
			return err
		}
	}
	if err := s.logLaporan(ctx, c, l, "reviewer.tugaskan", `Reviewer ditugaskan ke laporan "`+l.Judul+`"`); err != nil {
		return err
	}
	laporan, err := s.laporanResponse(ctx, l.ID, false)
	if err != nil {
		return err
	}
	return c.ok("Reviewer laporan ditugaskan", laporan)
}

func (s *Server) hapusLaporanReviewer(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessRead)
	if err != nil {
		return err
	}
	reviewerID, err := idParam(c, "reviewerId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	res, err := s.db.ExecContext(ctx, "DELETE FROM `ReviewerTugasan` WHERE `proposalId` = ? AND `reviewerId` = ?", l.ID, reviewerID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpError(http.StatusNotFound, "Tugasan reviewer tidak ditemukan")
	}
	if err := s.logLaporan(ctx, c, l, "reviewer.hapus", fmt.Sprintf("Tugasan reviewer #%d dihapus dari laporan", reviewerID)); err != nil {
		return err
	}
	return c.ok("Tugasan reviewer laporan dihapus", noData)
}

func (s *Server) getLaporanReviews(c *Ctx) error {
	l, err := s.loadLaporanParam(c, accessRead)
	if err != nil {
		return err
	}
	reviews, err := queryObjs(c.r.Context(), s.db, laporanReviewsQuery+" WHERE rv.`proposalId` = ? ORDER BY rv.`id` ASC", l.ID)
	if err != nil {
		return err
	}
	stripInternal(reviews)
	nestColumns(reviews, "r_", "reviewer")
	return c.ok("Review laporan fetched", reviews)
}

func (s *Server) assignedLaporan(c *Ctx) (*laporanRow, error) {
	id, err := idParam(c, "id")
	if err != nil {
		return nil, err
	}
	ctx := c.r.Context()
	l, err := s.laporanByID(ctx, id)
	if err != nil {
		return nil, err
	}
	assigned, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ReviewerTugasan` WHERE `proposalId` = ? AND `reviewerId` = ?", l.ID, c.user.UserID)
	if err != nil {
		return nil, err
	}
	if assigned == 0 {
		return nil, httpError(http.StatusForbidden, "Anda tidak ditugaskan untuk mereview laporan ini")
	}
	if l.Status != "review" {
		return nil, httpError(http.StatusBadRequest, "Laporan tidak sedang dalam tahap review")
	}
	return l, nil
}

func (s *Server) submitLaporanReview(c *Ctx) error {
	l, err := s.assignedLaporan(c)
	if err != nil {
		return err
	}
	review, err := s.upsertReview(c, l.ID, c.user.UserID)
	if err != nil {
		return err
	}
	if err := s.logLaporan(c.r.Context(), c, l, "review.submit", fmt.Sprintf("Review disimpan untuk laporan #%d", l.ID)); err != nil {
		return err
	}
	return c.ok("Review laporan disimpan", review)
}

func (s *Server) finalizeLaporanReview(c *Ctx) error {
	l, err := s.assignedLaporan(c)
	if err != nil {
		return err
	}
	review, err := s.reviewByKey(c, l.ID, c.user.UserID)
	if err != nil {
		return err
	}
	if review == nil {
		return httpError(http.StatusBadRequest, "Simpan review terlebih dahulu sebelum finalisasi")
	}
	ctx := c.r.Context()
	if _, err := s.db.ExecContext(ctx, "UPDATE `ProposalReview` SET `isDone` = ?, `updatedAt` = ? WHERE `id` = ?", true, s.nowMs(), review.Int64("id")); err != nil {
		return err
	}
	review, err = s.reviewByKey(c, l.ID, c.user.UserID)
	if err != nil {
		return err
	}
	if err := s.createNotification(ctx, s.db, notification{
		UserID: l.PengusulID, Type: "review_selesai", Judul: "Review Laporan Selesai",
		Pesan: `Laporan "` + l.Judul + `" telah selesai direview`,
		RefID: l.ID, RefType: "laporan",
	}); err != nil {
		return err
	}
	if err := s.logLaporan(ctx, c, l, "review.finalize", ""); err != nil {
		return err
	}
	return c.ok("Review laporan diselesaikan", review)
}
