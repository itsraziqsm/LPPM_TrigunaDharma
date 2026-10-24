package httpapi

import (
	"net/http"
	"strings"
)

// Node: routes/Proposaldosen.routes.ts, controllers/Proposaldosen.controller.ts,
// services/Proposaldosen.service.ts.

var (
	dosenListQuerySchema = zObj(
		withDefault("page", zNum().Coerce().Int().Positive(), float64(1)),
		withDefault("limit", zNum().Coerce().Int().Positive(), float64(10)),
		zField{name: "jenis", schema: zEnumOf(jenisKegiatan...), optional: true, emptyIsUndef: true},
		zField{name: "status", schema: zEnumOf(proposalStatuses...), optional: true, emptyIsUndef: true},
		zField{name: "search", schema: zStr(), optional: true, emptyIsUndef: true},
	)
	searchMembersSchema      = zObj(required("q", zStr().Trim().Min(2, "")))
	respondInvitationSchema  = zObj(required("status", zEnumOf("diterima", "ditolak")))
	dosenProposalAccessError = "Anda tidak memiliki akses ke proposal ini"
)

func (s *Server) registerProposalDosenRoutes() {
	g := s.group("/api/v1/dosen/proposals", s.authenticate, authorize("dosen", "mahasiswa"))
	g.get("/stats", s.dosenStats)
	g.get("/as-member", s.dosenProposalsAsMember) // baru (W-16), tidak ada di Node
	g.get("/members/search", s.dosenSearchMembers)
	g.get("/invitations", s.dosenInvitations)
	g.patch("/invitations/:id", s.dosenRespondInvitation)
	g.get("/", s.dosenProposals)
	g.post("/", validateBody(createProposalSchema), s.dosenCreateProposal)
	g.get("/:id", s.dosenGetProposal)
	g.patch("/:id", validateBody(updateProposalSchema), s.dosenUpdateProposal)
	g.post("/:id/submit", s.dosenSubmitProposal)
	g.delete("/:id", s.dosenDeleteProposal)
}

func (s *Server) dosenProposals(c *Ctx) error {
	out, issues := safeParse(dosenListQuerySchema, queryAsAny(c.query))
	if issues != nil {
		return zodError(issues)
	}
	f := proposalFilters{
		page:       out["page"].(float64),
		limit:      out["limit"].(float64),
		pengusulID: c.user.UserID,
	}
	f.jenis, _ = out["jenis"].(string)
	f.status, _ = out["status"].(string)
	search, _ := out["search"].(string)
	f.search = strings.TrimSpace(search)
	return s.findProposals(c, proposalDosenShape, f, "Proposals fetched")
}

// dosenProposalsAsMember (W-16) lists proposals of other users in which the
// current user is an anggota with an accepted invitation. Same query params
// and item shape as GET /dosen/proposals.
func (s *Server) dosenProposalsAsMember(c *Ctx) error {
	out, issues := safeParse(dosenListQuerySchema, queryAsAny(c.query))
	if issues != nil {
		c.s.validationFailed(c.w, c.r, fieldErrors(issues))
		return errStop
	}
	f := proposalFilters{
		page:      out["page"].(float64),
		limit:     out["limit"].(float64),
		anggotaID: c.user.UserID,
	}
	f.jenis, _ = out["jenis"].(string)
	f.status, _ = out["status"].(string)
	search, _ := out["search"].(string)
	f.search = strings.TrimSpace(search)
	return s.findProposals(c, proposalDosenShape, f, "Proposals as member fetched")
}

var dosenStatsQuerySchema = zObj(
	zField{name: "jenis", schema: zEnumOf(jenisKegiatan...), optional: true, emptyIsUndef: true},
)

// dosenStats mirrors the Node stats (total + 5 statuses). Go additions:
// key `review` (W-11) and the optional ?jenis= filter (W-17, 422 if invalid).
func (s *Server) dosenStats(c *Ctx) error {
	out, issues := safeParse(dosenStatsQuerySchema, queryAsAny(c.query))
	if issues != nil {
		c.s.validationFailed(c.w, c.r, fieldErrors(issues))
		return errStop
	}
	where := "`pengusulId` = ?"
	args := []any{c.user.UserID}
	if jenis, ok := out["jenis"].(string); ok {
		where += " AND `jenis` = ?"
		args = append(args, jenis)
	}
	rows, err := queryObjs(c.r.Context(), s.db, "SELECT `status`, COUNT(*) AS `n` FROM `Proposal` WHERE "+where+" GROUP BY `status`", args...)
	if err != nil {
		return err
	}
	byStatus := map[string]int64{}
	var total int64
	for _, row := range rows {
		byStatus[row.Str("status")] = row.Int64("n")
		total += row.Int64("n")
	}
	counts := O{{"total", total}}
	for _, status := range []string{"draft", "diajukan", "disetujui", "revisi", "ditolak", "review"} {
		counts = append(counts, KV{status, byStatus[status]})
	}
	return c.ok("Stats fetched", counts)
}

func (s *Server) dosenGetProposal(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	proposal, err := s.loadProposal(ctx, s.db, proposalDosenDetailShape, id)
	if err != nil {
		return err
	}
	if proposal == nil {
		return plainError(proposalNotFound)
	}
	pengusul, _ := proposal.Get("pengusul").(O)
	if pengusul.Int64("id") != c.user.UserID {
		return plainError(dosenProposalAccessError)
	}
	return c.ok("Proposal fetched", proposal)
}

func (s *Server) dosenCreateProposal(c *Ctx) error {
	ctx := c.r.Context()
	id, err := s.insertProposal(ctx, c.bodyMap(), c.user.UserID)
	if err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalDosenShape, id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.create", EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Proposal "` + proposal.Str("judul") + `" dibuat sebagai draft`,
	}); err != nil {
		return err
	}
	return c.created("Proposal berhasil dibuat", proposal)
}

// ownedProposal mirrors findProposalOrThrow + ensureProposalOwner.
func (s *Server) ownedProposal(c *Ctx, id int64) (*proposalRow, error) {
	p, err := s.proposalOrP2025(c.r.Context(), id)
	if err != nil {
		return nil, err
	}
	if p.PengusulID != c.user.UserID {
		return nil, plainError(dosenProposalAccessError)
	}
	return p, nil
}

func (s *Server) dosenUpdateProposal(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	p, err := s.ownedProposal(c, id)
	if err != nil {
		return err
	}
	if p.Status != "draft" && p.Status != "revisi" {
		return plainError("Proposal hanya bisa diedit saat status draft atau revisi")
	}
	ctx := c.r.Context()
	if err := s.applyProposalUpdate(ctx, id, c.bodyMap()); err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalDosenShape, id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.update", EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Proposal "` + proposal.Str("judul") + `" diperbarui`,
	}); err != nil {
		return err
	}
	return c.ok("Proposal berhasil diperbarui", proposal)
}

func (s *Server) dosenSubmitProposal(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	p, err := s.ownedProposal(c, id)
	if err != nil {
		return err
	}
	if p.Status != "draft" && p.Status != "revisi" {
		return plainError("Hanya proposal berstatus draft atau revisi yang bisa diajukan")
	}
	ctx := c.r.Context()
	pending, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ProposalAnggota` WHERE `proposalId` = ? AND `statusUndangan` = 'pending'", id)
	if err != nil {
		return err
	}
	rejected, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ProposalAnggota` WHERE `proposalId` = ? AND `statusUndangan` = 'ditolak'", id)
	if err != nil {
		return err
	}
	if pending+rejected > 0 {
		parts := []string{}
		if pending > 0 {
			parts = append(parts, itoa(pending)+" anggota belum merespons undangan")
		}
		if rejected > 0 {
			parts = append(parts, itoa(rejected)+" anggota menolak undangan")
		}
		return plainError("Proposal tidak dapat diajukan: " + strings.Join(parts, ", ") + ". Semua anggota harus menyetujui undangan terlebih dahulu.")
	}
	now := s.nowMs()
	if err := s.updateKegiatan(ctx, s.db, id, "`status` = 'diajukan', `submittedAt` = ?, `updatedAt` = ?", now, now); err != nil {
		return err
	}
	proposal, err := s.loadProposal(ctx, s.db, proposalDosenShape, id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.submit", EntityType: "proposal", EntityID: id, ProposalID: id,
		Detail: `Proposal "` + proposal.Str("judul") + `" diajukan`,
	}); err != nil {
		return err
	}
	return c.ok("Proposal berhasil diajukan", proposal)
}

func (s *Server) dosenDeleteProposal(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	p, err := s.ownedProposal(c, id)
	if err != nil {
		return err
	}
	if p.Status != "draft" {
		return plainError("Hanya proposal berstatus draft yang bisa dihapus")
	}
	ctx := c.r.Context()
	if err := s.deleteKegiatan(ctx, s.db, id); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.delete", EntityType: "proposal", EntityID: id,
		Detail: `Proposal "` + p.Judul + `" dihapus`,
	}); err != nil {
		return err
	}
	return c.ok("Proposal berhasil dihapus", noData)
}

func (s *Server) dosenSearchMembers(c *Ctx) error {
	out, issues := safeParse(searchMembersSchema, queryAsAny(c.query))
	if issues != nil {
		return c.fail(http.StatusBadRequest, "Ketik minimal 2 karakter untuk mencari pengguna")
	}
	q := strings.TrimSpace(out["q"].(string))
	ctx := c.r.Context()
	if len([]rune(q)) < 2 {
		return c.ok("Users fetched", []O{})
	}
	like := "%" + q + "%"
	users, err := queryObjs(ctx, s.db,
		"SELECT u.`id`,u.`name`,u.`fullName`,u.`email`,u.`nidn`,u.`nim`,u.`programStudi`,u.`prodi` FROM `User` u "+
			"WHERE u.`id` <> ? AND u.`status` = 'approved' AND (u.`name` LIKE ? OR u.`fullName` LIKE ? OR u.`email` LIKE ? OR u.`nidn` LIKE ? OR u.`nim` LIKE ?) "+
			"AND EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`name` IN ('dosen','mahasiswa')) "+
			"ORDER BY u.`id` ASC LIMIT 10",
		c.user.UserID, like, like, like, like, like)
	if err != nil {
		return err
	}
	if err := attachUserRoles(ctx, s.db, users, "id"); err != nil {
		return err
	}
	return c.ok("Users fetched", users)
}

func (s *Server) dosenInvitations(c *Ctx) error {
	ctx := c.r.Context()
	items, err := queryObjs(ctx, s.db,
		"SELECT a.`id`,a.`peran`,a.`statusUndangan`,a.`createdAt`,a.`proposalId` AS `__pid` FROM `ProposalAnggota` a WHERE a.`userId` = ? ORDER BY a.`createdAt` DESC",
		c.user.UserID)
	if err != nil {
		return err
	}
	if err := attachOne(ctx, s.db, items, "__pid", "proposal",
		"SELECT p.`id` AS `__k`, p.`id`, p.`judul`, p.`jenis`, p.`status`, p.`anggaran`,"+
			" u.`id` AS `u_id`, u.`name` AS `u_name`, u.`fullName` AS `u_fullName`, u.`email` AS `u_email`,"+
			" pe.`id` AS `pe_id`, pe.`nama` AS `pe_nama`, pe.`tahun` AS `pe_tahun`"+
			" FROM `Proposal` p JOIN `User` u ON u.`id` = p.`pengusulId` LEFT JOIN `Periode` pe ON pe.`id` = p.`periodeId` WHERE p.`id` IN (%s)"); err != nil {
		return err
	}
	for i := range items {
		if p, ok := items[i].Get("proposal").(O); ok {
			list := []O{p}
			nestColumns(list, "u_", "pengusul")
			nestColumns(list, "pe_", "periode")
			items[i].Set("proposal", list[0])
		}
	}
	stripInternal(items)
	return c.ok("Invitations fetched", items)
}

func (s *Server) dosenRespondInvitation(c *Ctx) error {
	id, err := userIDParam(c)
	if err != nil {
		return err
	}
	out, issues := safeParse(respondInvitationSchema, c.body)
	if issues != nil {
		c.s.writeBody(c.w, c.r, http.StatusBadRequest, O{{"message", "Status harus diterima atau ditolak"}})
		return errStop
	}
	status := out["status"].(string)
	ctx := c.r.Context()
	var userID, proposalID int64
	var current, judul string
	err = s.db.QueryRowContext(ctx,
		"SELECT a.`userId`, a.`proposalId`, a.`statusUndangan`, p.`judul` FROM `ProposalAnggota` a JOIN `Proposal` p ON p.`id` = a.`proposalId` WHERE a.`id` = ?",
		id).Scan(&userID, &proposalID, &current, &judul)
	if err != nil {
		if isNoRows(err) {
			return plainError("Undangan tidak ditemukan")
		}
		return err
	}
	if userID != c.user.UserID {
		return plainError("Anda tidak memiliki akses ke undangan ini")
	}
	if current != "pending" {
		return plainError("Undangan sudah direspon sebelumnya")
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE `ProposalAnggota` SET `statusUndangan` = ? WHERE `id` = ?", status, id); err != nil {
		return err
	}
	updated, err := queryObj(ctx, s.db,
		"SELECT a.`id`, a.`peran`, a.`statusUndangan`, p.`id` AS `p_id`, p.`judul` AS `p_judul` FROM `ProposalAnggota` a JOIN `Proposal` p ON p.`id` = a.`proposalId` WHERE a.`id` = ?", id)
	if err != nil {
		return err
	}
	list := []O{updated}
	nestColumns(list, "p_", "proposal")
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "proposal.anggota." + status, EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
		Detail: `Undangan anggota proposal "` + judul + `" ` + status,
	}); err != nil {
		return err
	}
	return c.ok("Undangan berhasil "+status, list[0])
}
