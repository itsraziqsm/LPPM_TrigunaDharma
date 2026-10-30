package httpapi

import (
	"database/sql"
	"errors"
	"fmt"

	"lppm-backend-go/internal/sqlb"
)

// Node: controllers/reviewer.controller.ts, services/reviewer.service.ts,
// routes/reviewer.routes.ts.

// tugasanCols: kolom baris ReviewerTugasan baru (proposal & laporan).
var tugasanCols = []string{"proposalId", "reviewerId", "createdAt"}

func (s *Server) registerReviewerRoutes() {
	g := s.group("/api/v1/reviewer", s.authenticate)
	// Go saja: hanya user berperan reviewer (dicek di DB).
	g.get("/my-tugasan", s.requireReviewerRole, s.myTugasan)
}

func (s *Server) tugaskanReviewer(c *Ctx) error {
	ids, err := positiveIntParams(c, "proposalId")
	if err != nil {
		return err
	}
	proposalID := ids["proposalId"]
	// tugaskanBodySchema: z.array(z.coerce.number().int().positive())
	out, issues := safeParse(zObj(required("reviewerIds", &zArray{elem: zNum().Coerce().Int().Positive()})), c.body)
	if issues != nil {
		return zodError(issues)
	}
	rawIDs, _ := out["reviewerIds"].([]any)
	reviewerIDs := make([]int64, len(rawIDs))
	for i, v := range rawIDs {
		reviewerIDs[i] = int64(v.(float64))
	}
	ctx := c.r.Context()
	proposal, err := s.proposalOrP2025(ctx, proposalID)
	if err != nil {
		return err
	}
	if proposal.Status != "diajukan" && proposal.Status != "review" {
		return plainError("Proposal harus berstatus diajukan atau review untuk ditugaskan reviewer")
	}
	// Go saja: hanya user approved yang berperan reviewer.
	if err := s.ensureReviewerCandidates(ctx, reviewerIDs); err != nil {
		return err
	}
	now := s.nowMs()
	if len(reviewerIDs) > 0 {
		args := make([]any, 0, len(reviewerIDs)*3)
		for _, rid := range reviewerIDs {
			args = append(args, proposalID, rid, now)
		}
		// createMany({skipDuplicates: true}) → INSERT IGNORE on MySQL
		if _, err := s.db.ExecContext(ctx, sqlb.InsertIgnoreRows("ReviewerTugasan", tugasanCols, len(reviewerIDs)), args...); err != nil {
			return err
		}
	}
	if err := s.updateKegiatan(ctx, s.db, proposalID, "`status` = 'review', `updatedAt` = ?", now); err != nil {
		return err
	}
	for _, rid := range reviewerIDs {
		if err := s.createNotification(ctx, s.db, notification{
			UserID: rid, Type: "reviewer_ditugaskan", Judul: "Tugas Review Baru",
			Pesan: `Anda ditugaskan untuk mereview proposal "` + proposal.Judul + `"`,
			RefID: proposalID, RefType: "proposal",
		}); err != nil {
			return err
		}
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "reviewer.tugaskan", EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
		Detail: `Reviewer ditugaskan ke proposal "` + proposal.Judul + `"`,
	}); err != nil {
		return err
	}
	items, err := queryObjs(ctx, s.db, "SELECT `id`,`judul`,`status` FROM `Proposal` WHERE `id` = ?", proposalID)
	if err != nil {
		return err
	}
	if len(items) == 0 {
		return c.ok("Reviewer ditugaskan", nil)
	}
	grouped, err := attachMany(ctx, s.db, items, "id", "reviewerTugasan",
		"SELECT t.`proposalId` AS `__k`, t.`id`, u.`id` AS `r_id`, u.`name` AS `r_name`, u.`email` AS `r_email` FROM `ReviewerTugasan` t JOIN `User` u ON u.`id` = t.`reviewerId` WHERE t.`proposalId` IN (%s) ORDER BY t.`id` ASC")
	if err != nil {
		return err
	}
	for _, list := range grouped {
		nestColumns(list, "r_", "reviewer")
	}
	return c.ok("Reviewer ditugaskan", items[0])
}

func (s *Server) hapusTugasan(c *Ctx) error {
	ids, err := positiveIntParams(c, "proposalId", "reviewerId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if _, err := s.db.ExecContext(ctx, "DELETE FROM `ReviewerTugasan` WHERE `proposalId` = ? AND `reviewerId` = ?", ids["proposalId"], ids["reviewerId"]); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "reviewer.hapus_tugasan", EntityType: "proposal",
		EntityID: ids["proposalId"], ProposalID: ids["proposalId"],
	}); err != nil {
		return err
	}
	return c.ok("Tugasan reviewer dihapus", noData)
}

func (s *Server) getReviewsByProposal(c *Ctx) error {
	ids, err := positiveIntParams(c, "proposalId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	reviews, err := queryObjs(ctx, s.db,
		"SELECT rv.`id`,rv.`proposalId`,rv.`reviewerId`,rv.`nilaiRelevansi`,rv.`nilaiMetodologi`,rv.`nilaiAnggaran`,rv.`nilaiLuaran`,rv.`catatan`,rv.`rekomendasi`,rv.`isDone`,rv.`createdAt`,rv.`updatedAt`,"+
			"u.`id` AS `r_id`,u.`name` AS `r_name`,u.`fullName` AS `r_fullName` FROM `ProposalReview` rv JOIN `User` u ON u.`id` = rv.`reviewerId` WHERE rv.`proposalId` = ? ORDER BY rv.`id` ASC",
		ids["proposalId"])
	if err != nil {
		return err
	}
	nestColumns(reviews, "r_", "reviewer")
	return c.ok("Reviews fetched", reviews)
}

func (s *Server) reviewByKey(c *Ctx, proposalID, reviewerID int64) (O, error) {
	return queryObj(c.r.Context(), s.db, "SELECT "+reviewColumns+" FROM `ProposalReview` WHERE `proposalId` = ? AND `reviewerId` = ?", proposalID, reviewerID)
}

func (s *Server) submitReview(c *Ctx) error {
	ids, err := positiveIntParams(c, "proposalId")
	if err != nil {
		return err
	}
	proposalID := ids["proposalId"]
	reviewerID := c.user.UserID
	ctx := c.r.Context()
	assigned, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ReviewerTugasan` t"+proposalTugasanJoin+" WHERE t.`proposalId` = ? AND t.`reviewerId` = ?", proposalID, reviewerID)
	if err != nil {
		return err
	}
	if assigned == 0 {
		return plainError("Anda tidak ditugaskan untuk mereview proposal ini")
	}
	review, err := s.upsertReview(c, proposalID, reviewerID)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: reviewerID, Action: "review.submit", EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
		Detail: fmt.Sprintf("Review disimpan untuk proposal #%d", proposalID),
	}); err != nil {
		return err
	}
	return c.ok("Review disimpan", review)
}

// upsertReview creates or updates the reviewer's ProposalReview row for a
// proposal or laporan id (saving again resets isDone) and returns it.
func (s *Server) upsertReview(c *Ctx, proposalID, reviewerID int64) (O, error) {
	ctx := c.r.Context()
	body := c.bodyMap()
	fields := []string{"nilaiRelevansi", "nilaiMetodologi", "nilaiAnggaran", "nilaiLuaran", "catatan", "rekomendasi"}
	now := s.nowMs()
	existing, err := s.reviewByKey(c, proposalID, reviewerID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		cols := []string{"proposalId", "reviewerId"}
		args := []any{proposalID, reviewerID}
		for _, f := range fields {
			if v, ok := body[f]; ok {
				cols = append(cols, f)
				args = append(args, v)
			}
		}
		cols = append(cols, "isDone", "createdAt", "updatedAt")
		args = append(args, false, now, now)
		if _, err := s.db.ExecContext(ctx, sqlb.Insert("ProposalReview", cols), args...); err != nil {
			return nil, err
		}
	} else {
		cols := []string{}
		args := []any{}
		for _, f := range fields {
			if v, ok := body[f]; ok {
				cols = append(cols, f)
				args = append(args, v)
			}
		}
		cols = append(cols, "isDone", "updatedAt")
		args = append(args, false, now, existing.Int64("id"))
		if _, err := s.db.ExecContext(ctx, sqlb.UpdateByID("ProposalReview", cols), args...); err != nil {
			return nil, err
		}
	}
	return s.reviewByKey(c, proposalID, reviewerID)
}

func (s *Server) finalizeReview(c *Ctx) error {
	ids, err := positiveIntParams(c, "proposalId")
	if err != nil {
		return err
	}
	proposalID := ids["proposalId"]
	reviewerID := c.user.UserID
	ctx := c.r.Context()
	var reviewID, pengusulID int64
	var judul string
	err = s.db.QueryRowContext(ctx,
		"SELECT rv.`id`, p.`pengusulId`, p.`judul` FROM `ProposalReview` rv JOIN `Proposal` p ON p.`id` = rv.`proposalId` WHERE rv.`proposalId` = ? AND rv.`reviewerId` = ?",
		proposalID, reviewerID).Scan(&reviewID, &pengusulID, &judul)
	if errors.Is(err, sql.ErrNoRows) {
		return notFoundRecord("ProposalReview")
	}
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE `ProposalReview` SET `isDone` = ?, `updatedAt` = ? WHERE `id` = ?", true, s.nowMs(), reviewID); err != nil {
		return err
	}
	review, err := queryObj(ctx, s.db, "SELECT "+reviewColumns+" FROM `ProposalReview` WHERE `id` = ?", reviewID)
	if err != nil {
		return err
	}
	if err := s.createNotification(ctx, s.db, notification{
		UserID: pengusulID, Type: "review_selesai", Judul: "Review Selesai",
		Pesan: `Proposal "` + judul + `" telah selesai direview`,
		RefID: proposalID, RefType: "proposal",
	}); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: reviewerID, Action: "review.finalize", EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
	}); err != nil {
		return err
	}
	return c.ok("Review diselesaikan", review)
}

// proposalTugasanJoin keeps tugasan for laporan (GET /laporan/tugasan) out of
// the proposal endpoints: both share ReviewerTugasan/ProposalReview.
const proposalTugasanJoin = " JOIN `Kegiatan` k ON k.`id` = t.`proposalId` AND k.`tipe` = 'proposal'"

var reviewerPaginationSchema = zObj(
	withDefault("page", zNum().Coerce().Int().Positive(), float64(1)),
	withDefault("limit", zNum().Coerce().Int().Positive(), float64(10)),
)

func (s *Server) myTugasan(c *Ctx) error {
	out, issues := safeParse(reviewerPaginationSchema, queryAsAny(c.query))
	if issues != nil {
		return zodError(issues)
	}
	page, limit := out["page"].(float64), out["limit"].(float64)
	skip, take, err := paginationArgs(page, limit)
	if err != nil {
		return err
	}
	reviewerID := c.user.UserID
	ctx := c.r.Context()
	tugasan, err := queryObjs(ctx, s.db,
		"SELECT t.`id`,t.`proposalId`,t.`reviewerId`,t.`createdAt`,t.`proposalId` AS `__pid` FROM `ReviewerTugasan` t"+proposalTugasanJoin+" WHERE t.`reviewerId` = ? ORDER BY t.`createdAt` DESC LIMIT ? OFFSET ?",
		reviewerID, take, skip)
	if err != nil {
		return err
	}
	if err := attachOne(ctx, s.db, tugasan, "__pid", "proposal",
		"SELECT p.`id` AS `__k`, p.`id`, p.`judul`, p.`status`, p.`jenis`, u.`id` AS `u_id`, u.`name` AS `u_name` FROM `Proposal` p JOIN `User` u ON u.`id` = p.`pengusulId` WHERE p.`id` IN (%s)"); err != nil {
		return err
	}
	for i := range tugasan {
		if p, ok := tugasan[i].Get("proposal").(O); ok {
			list := []O{p}
			nestColumns(list, "u_", "pengusul")
			tugasan[i].Set("proposal", list[0])
		}
	}
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ReviewerTugasan` t"+proposalTugasanJoin+" WHERE t.`reviewerId` = ?", reviewerID)
	if err != nil {
		return err
	}
	proposalIDs := uniqueIDs(tugasan, "proposalId")
	reviews := map[int64]O{}
	if len(proposalIDs) > 0 {
		rows, err := queryObjs(ctx, s.db,
			"SELECT `id`,`proposalId`,`nilaiRelevansi`,`nilaiMetodologi`,`nilaiAnggaran`,`nilaiLuaran`,`catatan`,`rekomendasi`,`isDone` FROM `ProposalReview` WHERE `reviewerId` = ? AND `proposalId` IN ("+placeholders(len(proposalIDs))+") ORDER BY `id` ASC",
			append([]any{reviewerID}, idArgs(proposalIDs)...)...)
		if err != nil {
			return err
		}
		for _, row := range rows {
			reviews[row.Int64("proposalId")] = row
		}
	}
	stripInternal(tugasan)
	for i := range tugasan {
		var mine any
		if r, ok := reviews[tugasan[i].Int64("proposalId")]; ok {
			mine = r
		}
		tugasan[i].Set("myReview", mine)
	}
	return c.okMeta("Tugasan review fetched", tugasan, page, limit, total)
}
