package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
)

// Node: routes/proposal.routes.ts, controllers/proposal.controller.ts,
// services/proposal.service.ts.

var (
	proposalStatuses     = []string{"draft", "diajukan", "review", "revisi", "disetujui", "ditolak"}
	anggotaProposalSchem = zObj(
		required("userId", zNum().Int().Positive()),
		withDefault("peran", zStr(), "anggota"),
	)
	createProposalSchema = zObj(
		required("judul", zStr().Min(5, "Judul minimal 5 karakter")),
		required("abstrak", zStr().Min(20, "Abstrak minimal 20 karakter")),
		required("jenis", zEnumOf(jenisKegiatan...)),
		optional("anggaran", zNum().Positive()),
		optional("luaran", zStr()),
		optional("skema", zStr()),
		optional("mitra", zStr()),
		optional("rumpunIlmu", zStr()),
		optional("bidang", zStr()),
		optional("kataKunci", zKataKunci{}),
		optional("periodeId", zNum().Int().Positive()),
		optional("dokumenUrl", zStr().URL("URL dokumen tidak valid")),
		optional("anggotaIds", &zArray{elem: anggotaProposalSchem}),
	)
	updateProposalSchema       = createProposalSchema.partial()
	updateStatusProposalSchema = zObj(
		required("status", zEnumOf("review", "revisi", "disetujui", "ditolak")),
		optional("catatanRevisi", zStr()),
	)
	tugaskanReviewerSchema = zObj(
		required("reviewerIds", &zArray{elem: zNum().Int().Positive(), min: 1, minMsg: "Minimal 1 reviewer"}),
	)
	submitReviewSchema = zObj(
		optional("nilaiRelevansi", zStr()),
		optional("nilaiMetodologi", zStr()),
		optional("nilaiAnggaran", zStr()),
		optional("nilaiLuaran", zStr()),
		optional("catatan", zStr()),
		optional("rekomendasi", zEnumOf("disetujui", "revisi", "ditolak")),
	)
	updateLaporanSchema = zObj(
		required("jenis", zEnumOf("kemajuan", "akhir")),
		required("judul", zStr().Min(3, "Judul minimal 3 karakter")),
		required("dokumenUrl", zStr().URL("URL dokumen tidak valid")),
		optional("keterangan", zStr()),
	).partial()
)

func (s *Server) registerProposalRoutes() {
	g := s.group("/api/v1/proposals", s.authenticate)
	g.get("/", authorize("admin", "ketua_lppm", "reviewer"), s.listProposals)
	g.get("/my", s.myProposals)
	g.get("/:id", s.getProposal)
	g.post("/", authorize("dosen", "mahasiswa"), validateBody(createProposalSchema), s.createProposal)
	g.patch("/:id", authorize("dosen", "mahasiswa"), validateBody(updateProposalSchema), s.updateProposal)
	g.post("/:id/submit", authorize("dosen", "mahasiswa"), s.submitProposal)
	g.patch("/:id/status", authorize("ketua_lppm", "admin"), validateBody(updateStatusProposalSchema), s.updateProposalStatus)
	g.delete("/:id", authorize("dosen", "mahasiswa", "admin"), s.deleteProposal)
	g.post("/:id/dokumen-utama", authorize("dosen", "mahasiswa"), multerSingle("file"), s.uploadProposalDokumen)
	g.get("/:id/dokumen-utama", s.downloadProposalDokumen)

	g.post("/:proposalId/reviewers", authorize("ketua_lppm", "admin"), validateBody(tugaskanReviewerSchema), s.tugaskanReviewer)
	g.delete("/:proposalId/reviewers/:reviewerId", authorize("ketua_lppm", "admin"), s.hapusTugasan)
	g.get("/:proposalId/reviews", authorize("ketua_lppm", "admin", "reviewer"), s.getReviewsByProposal)
	g.post("/:proposalId/reviews", authorize("reviewer"), validateBody(submitReviewSchema), s.submitReview)
	g.post("/:proposalId/reviews/finalize", authorize("reviewer"), s.finalizeReview)

	g.get("/:proposalId/laporan", s.listLaporan)
	g.post("/:proposalId/laporan", authorize("dosen", "mahasiswa"), multerSingle("file"), s.createLaporan)
	g.get("/laporan/:id/download", s.downloadLaporan)
	g.patch("/laporan/:id", authorize("dosen", "mahasiswa", "admin"), validateBody(updateLaporanSchema), s.updateLaporan)
	g.delete("/laporan/:id", authorize("dosen", "mahasiswa", "admin"), s.deleteLaporan)

	g.get("/:proposalId/dokumen", s.listDokumen)
	g.post("/:proposalId/dokumen", authorize("dosen", "mahasiswa"), multerSingle("file"), s.createDokumen)
	g.get("/dokumen/:id/download", s.downloadDokumen)
	g.delete("/dokumen/:id", authorize("dosen", "mahasiswa", "admin"), s.deleteDokumen)
}

// parseNumberQuery mirrors parseNumber(value, fallback) in the controller.
func parseNumberQuery(c *Ctx, key string, fallback float64) float64 {
	v, ok := c.queryValue(key)
	if !ok || v == "" {
		return fallback
	}
	f := jsStringToNumber(v)
	if math.IsNaN(f) {
		return fallback
	}
	return f
}

func parseOptionalNumberQuery(c *Ctx, key string) (float64, bool) {
	v, ok := c.queryValue(key)
	if !ok || v == "" {
		return 0, false
	}
	f := jsStringToNumber(v)
	if math.IsNaN(f) {
		return 0, false
	}
	return f, true
}

func parseOptionalStringQuery(c *Ctx, key string) string {
	v, _ := c.queryValue(key)
	return strings.TrimSpace(v)
}

type proposalFilters struct {
	page, limit  float64
	jenis        string
	status       string
	periodeID    float64
	pengusulID   int64
	anggotaID    int64 // anggota dengan undangan diterima (GET /dosen/proposals/as-member)
	programStudi string
	tahun        float64
	search       string
}

// buildProposalWhere mirrors buildProposalWhereClause.
func buildProposalWhere(f proposalFilters) (string, []any, error) {
	clauses := []string{}
	args := []any{}
	if f.jenis != "" {
		clauses = append(clauses, "p.`jenis` = ?")
		args = append(args, f.jenis)
	}
	if f.status != "" {
		clauses = append(clauses, "p.`status` = ?")
		args = append(args, f.status)
	}
	if f.periodeID != 0 {
		if f.periodeID != math.Trunc(f.periodeID) {
			return "", nil, invalidArgument("periodeId", jsNumber(f.periodeID))
		}
		clauses = append(clauses, "p.`periodeId` = ?")
		args = append(args, int64(f.periodeID))
	}
	if f.pengusulID != 0 {
		clauses = append(clauses, "p.`pengusulId` = ?")
		args = append(args, f.pengusulID)
	}
	if f.anggotaID != 0 {
		clauses = append(clauses, "p.`pengusulId` <> ? AND p.`id` IN (SELECT `proposalId` FROM `ProposalAnggota` WHERE `userId` = ? AND `statusUndangan` = 'diterima')")
		args = append(args, f.anggotaID, f.anggotaID)
	}
	if f.programStudi != "" {
		clauses = append(clauses, "p.`pengusulId` IN (SELECT `id` FROM `User` WHERE `programStudi` = ?)")
		args = append(args, f.programStudi)
	}
	if f.tahun != 0 {
		if f.tahun != math.Trunc(f.tahun) {
			return "", nil, invalidArgument("tahun", jsNumber(f.tahun))
		}
		clauses = append(clauses, "p.`periodeId` IN (SELECT `id` FROM `Periode` WHERE `tahun` = ?)")
		args = append(args, int64(f.tahun))
	}
	if f.search != "" {
		clauses = append(clauses, "(p.`judul` LIKE ? OR p.`abstrak` LIKE ?)")
		like := "%" + f.search + "%"
		args = append(args, like, like)
	}
	if len(clauses) == 0 {
		return "", args, nil
	}
	return "WHERE " + strings.Join(clauses, " AND "), args, nil
}

func (s *Server) findProposals(c *Ctx, shape proposalShape, f proposalFilters, message string) error {
	where, args, err := buildProposalWhere(f)
	if err != nil {
		return err
	}
	skip, take, err := paginationArgs(f.page, f.limit)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	items, err := s.loadProposals(ctx, s.db, shape, where+" ORDER BY p.`createdAt` DESC LIMIT ? OFFSET ?", append(append([]any{}, args...), take, skip)...)
	if err != nil {
		return err
	}
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `Proposal` p "+where, args...)
	if err != nil {
		return err
	}
	return c.okMeta(message, items, f.page, f.limit, total)
}

func optionalEnumQuery(c *Ctx, key string, values []string) string {
	v := parseOptionalStringQuery(c, key)
	if v == "" || !validEnum(v, values) {
		return ""
	}
	return v
}

func (s *Server) listProposals(c *Ctx) error {
	f := proposalFilters{
		page:         parseNumberQuery(c, "page", 1),
		limit:        parseNumberQuery(c, "limit", 10),
		jenis:        optionalEnumQuery(c, "jenis", jenisKegiatan),
		status:       optionalEnumQuery(c, "status", proposalStatuses),
		programStudi: parseOptionalStringQuery(c, "programStudi"),
		search:       parseOptionalStringQuery(c, "search"),
	}
	f.periodeID, _ = parseOptionalNumberQuery(c, "periodeId")
	f.tahun, _ = parseOptionalNumberQuery(c, "tahun")
	return s.findProposals(c, proposalListShape, f, "Proposals fetched")
}

func (s *Server) myProposals(c *Ctx) error {
	f := proposalFilters{
		page:       parseNumberQuery(c, "page", 1),
		limit:      parseNumberQuery(c, "limit", 10),
		jenis:      optionalEnumQuery(c, "jenis", jenisKegiatan),
		pengusulID: c.user.UserID,
	}
	return s.findProposals(c, proposalListShape, f, "My proposals fetched")
}

// proposalIDParam mirrors Number(req.params.id) used as a Prisma Int.
func proposalIDParam(c *Ctx, name string) (int64, error) {
	return jsNumberParam(c.param(name), "id")
}

func (s *Server) getProposal(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.ensureProposalAccess(ctx, id, c.user, accessRead); err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalDetailShape, id)
	if err != nil {
		return err
	}
	if proposal == nil {
		return plainError(proposalNotFound)
	}
	return c.ok("Proposal fetched", proposal)
}

func (s *Server) createProposal(c *Ctx) error {
	body := c.bodyMap()
	ctx := c.r.Context()
	jenis, _ := getString(body, "jenis")
	periodeF, hasPeriode := getFloat(body, "periodeId")
	if !hasPeriode || periodeF == 0 {
		return plainError("Periode harus dipilih")
	}
	var periodeJenis string
	err := s.db.QueryRowContext(ctx, "SELECT `jenis` FROM `Periode` WHERE `id` = ?", int64(periodeF)).Scan(&periodeJenis)
	if err == sql.ErrNoRows {
		return plainError("Periode tidak ditemukan")
	}
	if err != nil {
		return err
	}
	if periodeJenis != jenis {
		return plainError(fmt.Sprintf("Jenis proposal (%s) tidak sesuai dengan jenis periode (%s)", jenis, periodeJenis))
	}
	id, err := s.insertProposal(ctx, body, c.user.UserID)
	if err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalListShape, id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.create", EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Proposal "` + proposal.Str("judul") + `" dibuat sebagai draft`,
	}); err != nil {
		return err
	}
	return c.created("Proposal created", proposal)
}

// insertProposal creates a draft proposal with its anggota atomically.
func (s *Server) insertProposal(ctx context.Context, body map[string]any, pengusulID int64) (int64, error) {
	cols, args := proposalWriteFields(body)
	jenis, _ := getString(body, "jenis")
	now := s.nowMs()
	cols = append(cols, "status", "pengusulId", "createdAt", "updatedAt")
	args = append(args, "draft", pengusulID, now, now)
	var id int64
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if err := s.ensurePeriodeFK(ctx, tx, body); err != nil {
			return err
		}
		if err := checkJenisFields(body, jenis); err != nil {
			return err
		}
		var err error
		id, err = s.insertKegiatan(ctx, tx, jenis, tipeProposal, cols, args)
		if err != nil {
			return err
		}
		anggota, _ := body["anggotaIds"].([]any)
		return s.insertAnggota(ctx, tx, id, anggota)
	})
	return id, err
}

// applyProposalUpdate mirrors prisma.proposal.update with buildProposalUpdateData.
func (s *Server) applyProposalUpdate(ctx context.Context, id int64, body map[string]any) error {
	cols, args := proposalWriteFields(body)
	sets := make([]string, 0, len(cols)+1)
	for _, col := range cols {
		sets = append(sets, "`"+col+"` = ?")
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, s.nowMs())
	return s.withTx(ctx, func(tx *sql.Tx) error {
		if err := s.ensurePeriodeFK(ctx, tx, body); err != nil {
			return err
		}
		k, err := s.kegiatanByID(ctx, tx, id)
		if err != nil {
			return err
		}
		if k != nil {
			jenis, ok := getString(body, "jenis")
			if !ok {
				jenis = k.Jenis
			}
			if err := checkJenisFields(body, jenis); err != nil {
				return err
			}
			if err := s.moveKegiatanJenis(ctx, tx, k, jenis); err != nil {
				return err
			}
		}
		if err := s.updateKegiatan(ctx, tx, id, strings.Join(sets, ", "), args...); err != nil {
			return err
		}
		anggota, present := body["anggotaIds"].([]any)
		if !present {
			return nil
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM `ProposalAnggota` WHERE `proposalId` = ?", id); err != nil {
			return err
		}
		return s.insertAnggota(ctx, tx, id, anggota)
	})
}

func (s *Server) updateProposal(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.ensureProposalAccess(ctx, id, c.user, accessWrite); err != nil {
		return err
	}
	existing, err := s.proposalOrThrow(ctx, id)
	if err != nil {
		return err
	}
	if existing.Status != "draft" && existing.Status != "revisi" {
		return plainError("Proposal hanya bisa diedit saat status draft atau revisi")
	}
	if err := s.applyProposalUpdate(ctx, id, c.bodyMap()); err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalListShape, id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.update", EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Proposal "` + proposal.Str("judul") + `" diperbarui`,
	}); err != nil {
		return err
	}
	return c.ok("Proposal updated", proposal)
}

func (s *Server) submitProposal(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.ensureProposalAccess(ctx, id, c.user, accessWrite); err != nil {
		return err
	}
	existing, err := s.proposalOrThrow(ctx, id)
	if err != nil {
		return err
	}
	if existing.Status != "draft" && existing.Status != "revisi" {
		return plainError("Hanya proposal berstatus draft atau revisi yang bisa diajukan")
	}
	now := s.nowMs()
	if err := s.updateKegiatan(ctx, s.db, id, "`status` = 'diajukan', `submittedAt` = ?, `updatedAt` = ?", now, now); err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalListShape, id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.submit", EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Proposal "` + proposal.Str("judul") + `" diajukan`,
	}); err != nil {
		return err
	}
	return c.ok("Proposal diajukan", proposal)
}

var notificationTypeByStatus = map[string]string{
	"disetujui": "proposal_disetujui",
	"ditolak":   "proposal_ditolak",
	"revisi":    "proposal_revisi",
	"review":    "reviewer_ditugaskan",
}

func (s *Server) updateProposalStatus(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	body := c.bodyMap()
	status, _ := getString(body, "status")
	catatan, hasCatatan := getString(body, "catatanRevisi")
	ctx := c.r.Context()
	existing, err := s.proposalOrThrow(ctx, id)
	if err != nil {
		return err
	}
	now := s.nowMs()
	sets := []string{"`status` = ?"}
	args := []any{status}
	if hasCatatan {
		sets = append(sets, "`catatanRevisi` = ?")
		args = append(args, catatan)
	}
	if status == "disetujui" {
		sets = append(sets, "`approvedAt` = ?")
		args = append(args, now)
	}
	if status == "review" {
		if hasCatatan {
			args[1] = nil
		} else {
			sets = append(sets, "`catatanRevisi` = ?")
			args = append(args, nil)
		}
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, now)
	if err := s.updateKegiatan(ctx, s.db, id, strings.Join(sets, ", "), args...); err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalListShape, id)
	if err != nil {
		return err
	}
	if notifType, ok := notificationTypeByStatus[status]; ok {
		pesan := `Proposal "` + existing.Judul + `" telah ` + status
		if hasCatatan && catatan != "" {
			pesan += ". Catatan: " + catatan
		}
		if err := s.createNotification(ctx, s.db, notification{
			UserID: existing.PengusulID, Type: notifType, Judul: "Proposal " + status, Pesan: pesan,
			RefID: id, RefType: "proposal",
		}); err != nil {
			return err
		}
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.status." + status, EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Status proposal "` + proposal.Str("judul") + `" diubah menjadi ` + status,
	}); err != nil {
		return err
	}
	return c.ok("Status proposal diperbarui", proposal)
}

func (s *Server) deleteProposal(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.ensureProposalAccess(ctx, id, c.user, accessWrite); err != nil {
		return err
	}
	existing, err := s.proposalOrThrow(ctx, id)
	if err != nil {
		return err
	}
	if existing.Status != "draft" {
		return plainError("Hanya proposal berstatus draft yang bisa dihapus")
	}
	if err := s.deleteKegiatan(ctx, s.db, id); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.delete", EntityType: "proposal", EntityID: id,
		Detail: `Proposal "` + existing.Judul + `" dihapus`,
	}); err != nil {
		return err
	}
	return c.ok("Proposal deleted", noData)
}

// requireUploadedProposalFile mirrors getUploadedFile() in proposal.controller.ts.
func requireUploadedProposalFile(c *Ctx) (*uploadedFile, error) {
	f := c.file
	if f == nil {
		return nil, httpError(http.StatusBadRequest, "File tidak ditemukan dalam request.")
	}
	switch {
	case f.mimetype != "application/pdf" && f.mimetype != mimeDOCX:
		return nil, httpError(http.StatusBadRequest, "Hanya file PDF atau DOCX yang diizinkan.")
	case f.size > maxUploadBytes:
		return nil, httpError(http.StatusBadRequest, "Ukuran file maksimal 10 MB.")
	case f.originalname == "":
		return nil, httpError(http.StatusBadRequest, "File tidak valid.")
	}
	return f, nil
}

func (s *Server) uploadProposalDokumen(c *Ctx) error {
	rawID := c.param("id")
	file, err := requireUploadedProposalFile(c)
	if err != nil {
		return err
	}
	id, err := jsNumberParam(rawID, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.ensureProposalAccess(ctx, id, c.user, accessWrite); err != nil {
		return err
	}
	proposal, err := s.proposalOrThrow(ctx, id)
	if err != nil {
		return err
	}
	verified, err := validateFileIsAllowedDocument(file.data)
	if err != nil {
		return err
	}
	if err := s.updateKegiatan(ctx, s.db, id,
		"`dokumenBlob` = ?, `dokumenNama` = ?, `dokumenMime` = ?, `dokumenUkuran` = ?, `dokumenUrl` = NULL, `updatedAt` = ?",
		file.data, file.originalname, verified, file.size, s.nowMs()); err != nil {
		return err
	}
	updated, err := queryObj(ctx, s.db, "SELECT `id`,`dokumenNama`,`dokumenMime`,`dokumenUkuran` FROM `Proposal` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.dokumen.upload", EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Dokumen "` + file.originalname + `" diunggah untuk proposal "` + proposal.Judul + `"`,
	}); err != nil {
		return err
	}
	return c.ok("Dokumen berhasil diunggah", updated)
}

// sendFile mirrors the download controllers: nosniff, Content-Type,
// inline Content-Disposition with encodeURIComponent and Content-Length.
func (c *Ctx) sendFile(data []byte, mimeType, fileName string, contentLength int64) error {
	h := c.w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	h.Set("Content-Type", mimeType)
	h.Set("Content-Disposition", `inline; filename="`+jsEncodeURIComponent(fileName)+`"`)
	if contentLength >= 0 {
		h.Set("Content-Length", strconv.FormatInt(contentLength, 10))
	}
	c.w.WriteHeader(http.StatusOK)
	if c.r.Method != http.MethodHead {
		_, _ = c.w.Write(data)
	}
	return errStop
}

type storedFile struct {
	blob []byte
	mime sql.NullString
	name sql.NullString
	size sql.NullInt64
}

func (f storedFile) length() int64 {
	if f.size.Valid {
		return f.size.Int64
	}
	return int64(len(f.blob))
}

func (s *Server) downloadProposalDokumen(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.ensureProposalAccess(ctx, id, c.user, accessRead); err != nil {
		return err
	}
	// Proposal view only: a laporan id is not a proposal.
	if p, err := s.proposalByID(ctx, s.db, id); err != nil || p == nil {
		if err != nil {
			return err
		}
		return httpError(http.StatusNotFound, "Dokumen tidak ditemukan.")
	}
	f, found, err := s.kegiatanFile(ctx, id)
	if err != nil {
		return err
	}
	if !found || f.blob == nil {
		return httpError(http.StatusNotFound, "Dokumen tidak ditemukan.")
	}
	name := f.name.String
	if name == "" {
		name = "dokumen"
	}
	return c.sendFile(f.blob, f.mime.String, name, f.length())
}
