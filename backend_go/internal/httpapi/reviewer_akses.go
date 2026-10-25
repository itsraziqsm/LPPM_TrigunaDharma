package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
)

// Hak akses reviewer (Go saja; dokumentasi untuk frontend di new-api.md bagian 16).
//
//   - Dosen secara default TIDAK berperan reviewer (registrasi hanya memberi `dosen`).
//   - Admin & Ketua LPPM memberi peran reviewer kepada dosen.
//   - Mencabut biasa (admin/ketua) hanya bila dosen tidak punya tugasan yang belum selesai.
//   - Cabut paksa hanya Ketua LPPM: setiap tugasan yang belum selesai wajib dialihkan ke
//     reviewer baru; pengalihan dan pencabutan terjadi dalam satu transaksi.
//   - Hanya user berperan `reviewer` (dibaca dari DB, bukan dari token) yang bisa
//     ditugaskan, melihat tugasan, dan menyimpan/finalisasi review.
//
// Tugasan "belum selesai" = tugasan yang reviewnya belum final (isDone) pada proposal
// atau laporan yang masih berstatus diajukan/review.

const (
	reviewerRoleDenied   = "Anda tidak memiliki peran reviewer"
	reviewerCandidateMsg = "Reviewer tidak ditemukan, belum disetujui, atau tidak berperan reviewer"
)

var (
	setReviewerSchema = zObj(required("isReviewer", zBoolean{}))
	pengalihanItem    = zObj(required("tugasanId", zNum().Int().Positive()), required("reviewerBaruId", zNum().Int().Positive()))
	forceRevokeSchema = zObj(withDefault("pengalihan", &zArray{elem: pengalihanItem}, []any{}))
)

func (s *Server) registerReviewerAksesRoutes(g *mount) {
	g.get("/:id/reviewer", authorize("admin", "ketua_lppm"), s.getReviewerAkses)
	g.patch("/:id/reviewer", authorize("admin", "ketua_lppm"), validateBody(setReviewerSchema), s.setReviewerAkses)
	g.post("/:id/reviewer/force-revoke", authorize("ketua_lppm"), validateBody(forceRevokeSchema), s.forceRevokeReviewer)
}

// requireReviewerRole is a step: the current user must have the reviewer role
// in the database (token roles may be stale right after a role change).
func (s *Server) requireReviewerRole(c *Ctx) error {
	roles, err := s.rolesOf(c.r.Context(), s.db, c.user.UserID)
	if err != nil {
		return err
	}
	if !hasAnyRole(roles, "reviewer") {
		return c.fail(http.StatusForbidden, reviewerRoleDenied)
	}
	return nil
}

// ensureReviewerCandidates: every id must be an approved user with the reviewer role.
func (s *Server) ensureReviewerCandidates(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	unique := map[int64]bool{}
	for _, id := range ids {
		unique[id] = true
	}
	list := make([]int64, 0, len(unique))
	for id := range unique {
		list = append(list, id)
	}
	found, err := countRows(ctx, s.db,
		"SELECT COUNT(DISTINCT u.`id`) FROM `User` u JOIN `UserRole` ur ON ur.`userId` = u.`id` JOIN `Role` r ON r.`id` = ur.`roleId`"+
			" WHERE r.`name` = 'reviewer' AND u.`status` = 'approved' AND u.`id` IN ("+placeholders(len(list))+")", idArgs(list)...)
	if err != nil {
		return err
	}
	if found != int64(len(list)) {
		return httpError(http.StatusBadRequest, reviewerCandidateMsg)
	}
	return nil
}

// unfinishedTugasan lists the reviewer's open assignments with item info.
func (s *Server) unfinishedTugasan(ctx context.Context, q dbtx, reviewerID int64) ([]O, error) {
	items, err := queryObjs(ctx, q,
		"SELECT t.`id`, t.`proposalId` AS `itemId`, k.`tipe`, t.`createdAt` FROM `ReviewerTugasan` t JOIN `Kegiatan` k ON k.`id` = t.`proposalId`"+
			" WHERE t.`reviewerId` = ?"+
			" AND NOT EXISTS (SELECT 1 FROM `ProposalReview` rv WHERE rv.`proposalId` = t.`proposalId` AND rv.`reviewerId` = t.`reviewerId` AND rv.`isDone` = true)"+
			" AND (t.`proposalId` IN (SELECT `id` FROM `Proposal` WHERE `status` IN ('diajukan','review'))"+
			" OR t.`proposalId` IN (SELECT `id` FROM `Laporan` WHERE `status` IN ('diajukan','review')))"+
			" ORDER BY t.`id` ASC", reviewerID)
	if err != nil || len(items) == 0 {
		return items, err
	}
	ids := uniqueIDs(items, "itemId")
	args := append(idArgs(ids), idArgs(ids)...)
	rows, err := queryObjs(ctx, q,
		"SELECT `id`,`judul`,`status`,`jenis`,`pengusulId` FROM `Proposal` WHERE `id` IN ("+placeholders(len(ids))+")"+
			" UNION ALL SELECT `id`,`judul`,`status`,`jenis`,`pengusulId` FROM `Laporan` WHERE `id` IN ("+placeholders(len(ids))+")", args...)
	if err != nil {
		return nil, err
	}
	byID := map[int64]O{}
	for _, row := range rows {
		byID[row.Int64("id")] = row
	}
	for i := range items {
		row := byID[items[i].Int64("itemId")]
		items[i].Set("judul", row.Get("judul"))
		items[i].Set("status", row.Get("status"))
		items[i].Set("jenis", row.Get("jenis"))
		items[i].Set("pengusulId", row.Get("pengusulId"))
	}
	return items, nil
}

func (s *Server) reviewerTargetUser(c *Ctx) (int64, []string, error) {
	id, err := idParam(c, "id")
	if err != nil {
		return 0, nil, err
	}
	if _, err := s.ensureUserExists(c.r.Context(), id); err != nil {
		return 0, nil, err
	}
	roles, err := s.rolesOf(c.r.Context(), s.db, id)
	return id, roles, err
}

// reviewerStatus builds the response shared by the three endpoints.
func (s *Server) reviewerStatus(ctx context.Context, userID int64, roles []string) (O, error) {
	open, err := s.unfinishedTugasan(ctx, s.db, userID)
	if err != nil {
		return nil, err
	}
	done, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ProposalReview` WHERE `reviewerId` = ? AND `isDone` = true", userID)
	if err != nil {
		return nil, err
	}
	return O{
		{"userId", userID}, {"roles", roles}, {"isReviewer", hasAnyRole(roles, "reviewer")},
		{"bisaDijadikanReviewer", hasAnyRole(roles, "dosen")},
		{"tugasanBelumSelesai", open}, {"jumlahReviewSelesai", done},
	}, nil
}

func (s *Server) getReviewerAkses(c *Ctx) error {
	id, roles, err := s.reviewerTargetUser(c)
	if err != nil {
		return err
	}
	data, err := s.reviewerStatus(c.r.Context(), id, roles)
	if err != nil {
		return err
	}
	return c.ok("Status reviewer fetched", data)
}

// replaceRoles writes the user's role set (same SQL as PATCH /users/:id/roles).
func replaceRoles(ctx context.Context, tx dbtx, userID int64, roles []string, now any) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM `UserRole` WHERE `userId` = ?", userID); err != nil {
		return err
	}
	if len(roles) == 0 {
		return nil
	}
	args := []any{userID, now}
	for _, r := range roles {
		args = append(args, r)
	}
	_, err := tx.ExecContext(ctx,
		"INSERT INTO `UserRole` (`userId`,`roleId`,`createdAt`) SELECT ?, `id`, ? FROM `Role` WHERE `name` IN ("+placeholders(len(roles))+") ORDER BY `id`", args...)
	return err
}

func withoutRole(roles []string, name string) []string {
	out := []string{}
	for _, r := range roles {
		if r != name {
			out = append(out, r)
		}
	}
	return out
}

// openTugasanError is the 409 shown when a reviewer still has open assignments.
func openTugasanError(n int) error {
	return httpError(http.StatusConflict, fmt.Sprintf(
		"Dosen masih memiliki %d tugasan review yang belum selesai. Ketua LPPM dapat mencabut paksa dengan mengalihkan tugasan tersebut ke reviewer lain.", n))
}

func (s *Server) setReviewerAkses(c *Ctx) error {
	id, roles, err := s.reviewerTargetUser(c)
	if err != nil {
		return err
	}
	want, _ := c.bodyMap()["isReviewer"].(bool)
	ctx := c.r.Context()
	has := hasAnyRole(roles, "reviewer")
	if !hasAnyRole(roles, "dosen") {
		return httpError(http.StatusBadRequest, "Peran reviewer hanya dapat diatur untuk user berperan dosen")
	}
	message := "Peran reviewer tidak berubah"
	switch {
	case want && !has:
		if err := replaceRoles(ctx, s.db, id, append(roles, "reviewer"), s.nowMs()); err != nil {
			return err
		}
		message = "Dosen dijadikan reviewer"
	case !want && has:
		open, err := s.unfinishedTugasan(ctx, s.db, id)
		if err != nil {
			return err
		}
		if len(open) > 0 {
			return openTugasanError(len(open))
		}
		if err := replaceRoles(ctx, s.db, id, withoutRole(roles, "reviewer"), s.nowMs()); err != nil {
			return err
		}
		message = "Peran reviewer dicabut"
	}
	if message != "Peran reviewer tidak berubah" {
		action := "user.reviewer.grant"
		if !want {
			action = "user.reviewer.revoke"
		}
		if err := s.logActivity(ctx, s.db, c, activityEntry{UserID: c.user.UserID, Action: action, EntityType: "user", EntityID: id}); err != nil {
			return err
		}
	}
	roles, err = s.rolesOf(ctx, s.db, id)
	if err != nil {
		return err
	}
	data, err := s.reviewerStatus(ctx, id, roles)
	if err != nil {
		return err
	}
	return c.ok(message, data)
}

// forceRevokeReviewer (Ketua LPPM): alihkan semua tugasan belum selesai lalu cabut peran.
func (s *Server) forceRevokeReviewer(c *Ctx) error {
	id, roles, err := s.reviewerTargetUser(c)
	if err != nil {
		return err
	}
	if !hasAnyRole(roles, "reviewer") {
		return httpError(http.StatusBadRequest, "User ini tidak berperan reviewer")
	}
	if !hasAnyRole(roles, "dosen") {
		return httpError(http.StatusBadRequest, "Peran reviewer hanya dapat diatur untuk user berperan dosen")
	}
	ctx := c.r.Context()
	open, err := s.unfinishedTugasan(ctx, s.db, id)
	if err != nil {
		return err
	}
	openByID := map[int64]O{}
	for _, t := range open {
		openByID[t.Int64("id")] = t
	}
	raw, _ := c.bodyMap()["pengalihan"].([]any)
	plan := map[int64]int64{}
	newIDs := []int64{}
	for _, item := range raw {
		m := item.(map[string]any)
		tid, rid := int64(m["tugasanId"].(float64)), int64(m["reviewerBaruId"].(float64))
		t, ok := openByID[tid]
		if !ok {
			return httpError(http.StatusBadRequest, fmt.Sprintf("Tugasan #%d bukan tugasan belum selesai milik dosen ini", tid))
		}
		if _, dup := plan[tid]; dup {
			return httpError(http.StatusBadRequest, fmt.Sprintf("Tugasan #%d dialihkan lebih dari sekali", tid))
		}
		if rid == id {
			return httpError(http.StatusBadRequest, "Reviewer baru tidak boleh dosen yang sama")
		}
		if rid == t.Int64("pengusulId") {
			return httpError(http.StatusBadRequest, fmt.Sprintf("Reviewer baru untuk tugasan #%d adalah pengusulnya sendiri", tid))
		}
		plan[tid] = rid
		newIDs = append(newIDs, rid)
	}
	missing := []string{}
	for _, t := range open {
		if _, ok := plan[t.Int64("id")]; !ok {
			missing = append(missing, fmt.Sprintf("#%d", t.Int64("id")))
		}
	}
	if len(missing) > 0 {
		return httpError(http.StatusBadRequest, "Semua tugasan belum selesai wajib dialihkan terlebih dahulu. Belum dialihkan: "+strings.Join(missing, ", "))
	}
	if err := s.ensureReviewerCandidates(ctx, newIDs); err != nil {
		return err
	}
	now := s.nowMs()
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		for _, t := range open {
			tid, itemID, rid := t.Int64("id"), t.Int64("itemId"), plan[t.Int64("id")]
			exists, err := countRows(ctx, tx, "SELECT COUNT(*) FROM `ReviewerTugasan` WHERE `proposalId` = ? AND `reviewerId` = ?", itemID, rid)
			if err != nil {
				return err
			}
			if exists > 0 {
				if _, err := tx.ExecContext(ctx, "DELETE FROM `ReviewerTugasan` WHERE `id` = ?", tid); err != nil {
					return err
				}
			} else if _, err := tx.ExecContext(ctx, "UPDATE `ReviewerTugasan` SET `reviewerId` = ?, `createdAt` = ? WHERE `id` = ?", rid, now, tid); err != nil {
				return err
			}
			// Draf review dosen lama (belum final) tidak dipakai lagi.
			if _, err := tx.ExecContext(ctx, "DELETE FROM `ProposalReview` WHERE `proposalId` = ? AND `reviewerId` = ? AND `isDone` = false", itemID, id); err != nil {
				return err
			}
			label := "proposal"
			if t.Str("tipe") == tipeLaporan {
				label = "laporan"
			}
			if exists == 0 {
				if err := s.createNotification(ctx, tx, notification{
					UserID: rid, Type: "reviewer_ditugaskan", Judul: "Tugas Review Baru",
					Pesan: "Anda ditugaskan untuk mereview " + label + ` "` + t.Str("judul") + `" (dialihkan oleh Ketua LPPM)`,
					RefID: itemID, RefType: label,
				}); err != nil {
					return err
				}
			}
		}
		if err := replaceRoles(ctx, tx, id, withoutRole(roles, "reviewer"), now); err != nil {
			return err
		}
		return s.logActivity(ctx, tx, c, activityEntry{
			UserID: c.user.UserID, Action: "user.reviewer.force_revoke", EntityType: "user", EntityID: id,
			Detail: fmt.Sprintf("Peran reviewer dicabut paksa; %d tugasan dialihkan", len(open)),
		})
	})
	if err != nil {
		return err
	}
	roles, err = s.rolesOf(ctx, s.db, id)
	if err != nil {
		return err
	}
	data, err := s.reviewerStatus(ctx, id, roles)
	if err != nil {
		return err
	}
	data = append(data, KV{"jumlahDialihkan", int64(len(open))})
	return c.ok("Peran reviewer dicabut paksa", data)
}
