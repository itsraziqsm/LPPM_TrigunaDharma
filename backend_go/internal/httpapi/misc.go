package httpapi

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Node: notification.*, dashboard.*, activityLog.*, export.* modules.

const (
	notificationColumns = "`id`,`userId`,`type`,`judul`,`pesan`,`isRead`,`refId`,`refType`,`createdAt`"
	activityColumns     = "a.`id`,a.`userId`,a.`action`,a.`entityType`,a.`entityId`,a.`detail`,a.`proposalId`,a.`ipAddress`,a.`userAgent`,a.`createdAt`"
)

func (s *Server) registerNotificationRoutes() {
	g := s.group("/api/v1/notifications", s.authenticate)
	g.get("/", s.listNotifications)
	g.patch("/read-all", s.markAllNotificationsRead)
	g.patch("/:id/read", s.markNotificationRead)
	g.delete("/:id", s.deleteNotification)
}

func (s *Server) registerDashboardRoutes() {
	g := s.group("/api/v1/dashboard", s.authenticate)
	g.get("/stats", authorize("admin", "ketua_lppm"), s.dashboardStats)
}

func (s *Server) registerActivityLogRoutes() {
	g := s.group("/api/v1/activity-logs", s.authenticate)
	g.get("/my", s.myActivityLogs)
	g.get("/", authorize("admin", "ketua_lppm"), s.allActivityLogs)
}

func (s *Server) registerExportRoutes() {
	g := s.group("/api/v1/export", s.authenticate)
	g.get("/proposals", authorize("admin", "ketua_lppm"), s.exportProposals)
}

// numberQuery mirrors Number(query.x ?? fallback).
func numberQuery(c *Ctx, key string, fallback float64) float64 {
	v, ok := c.queryValue(key)
	if !ok {
		return fallback
	}
	return jsStringToNumber(v)
}

// ── notifications ─────────────────────────────────────────────────────────

func (s *Server) listNotifications(c *Ctx) error {
	page := numberQuery(c, "page", 1)
	limit := numberQuery(c, "limit", 20)
	onlyUnread, _ := c.queryValue("onlyUnread")
	skip, take, err := paginationArgs(page, limit)
	if err != nil {
		return err
	}
	where := "`userId` = ?"
	args := []any{c.user.UserID}
	if onlyUnread == "true" {
		where += " AND `isRead` = FALSE"
	}
	ctx := c.r.Context()
	items, err := queryObjs(ctx, s.db, "SELECT "+notificationColumns+" FROM `Notification` WHERE "+where+" ORDER BY `createdAt` DESC LIMIT ? OFFSET ?",
		append(append([]any{}, args...), take, skip)...)
	if err != nil {
		return err
	}
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `Notification` WHERE "+where, args...)
	if err != nil {
		return err
	}
	return c.okMeta("Notifications fetched", items, page, limit, total)
}

func (s *Server) markNotificationRead(c *Ctx) error {
	id, err := jsNumberParam(c.param("id"), "id")
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(c.r.Context(), "UPDATE `Notification` SET `isRead` = TRUE WHERE `id` = ? AND `userId` = ?", id, c.user.UserID); err != nil {
		return err
	}
	return c.ok("Notification marked as read", noData)
}

func (s *Server) markAllNotificationsRead(c *Ctx) error {
	if _, err := s.db.ExecContext(c.r.Context(), "UPDATE `Notification` SET `isRead` = TRUE WHERE `userId` = ? AND `isRead` = FALSE", c.user.UserID); err != nil {
		return err
	}
	return c.ok("All notifications marked as read", noData)
}

func (s *Server) deleteNotification(c *Ctx) error {
	id, err := jsNumberParam(c.param("id"), "id")
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(c.r.Context(), "DELETE FROM `Notification` WHERE `id` = ? AND `userId` = ?", id, c.user.UserID); err != nil {
		return err
	}
	return c.ok("Notification deleted", noData)
}

// ── dashboard ─────────────────────────────────────────────────────────────

func (s *Server) dashboardStats(c *Ctx) error {
	clauses := []string{}
	args := []any{}
	if jenis, ok := c.queryValue("jenis"); ok && jenis != "" {
		if !validEnum(jenis, jenisKegiatan) {
			return enumFilterError("jenis", jenis, "JenisKegiatan")
		}
		clauses = append(clauses, "p.`jenis` = ?")
		args = append(args, jenis)
	}
	if raw, ok := c.queryValue("tahun"); ok && raw != "" {
		tahun := jsStringToNumber(raw)
		if !math.IsNaN(tahun) && tahun != 0 {
			if tahun != math.Trunc(tahun) {
				return invalidArgument("tahun", jsNumber(tahun))
			}
			clauses = append(clauses, "p.`periodeId` IN (SELECT `id` FROM `Periode` WHERE `tahun` = ?)")
			args = append(args, int64(tahun))
		}
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}
	ctx := c.r.Context()
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `Proposal` p"+where, args...)
	if err != nil {
		return err
	}
	perStatus, err := queryObjs(ctx, s.db, "SELECT p.`status`, COUNT(p.`id`) AS `count` FROM `Proposal` p"+where+" GROUP BY p.`status` ORDER BY p.`status`", args...)
	if err != nil {
		return err
	}
	perJenis, err := queryObjs(ctx, s.db, "SELECT p.`jenis`, COUNT(p.`id`) AS `count` FROM `Proposal` p GROUP BY p.`jenis` ORDER BY p.`jenis`")
	if err != nil {
		return err
	}
	prodiRows, err := queryObjs(ctx, s.db, "SELECT u.`programStudi` FROM `Proposal` p JOIN `User` u ON u.`id` = p.`pengusulId`"+where+" ORDER BY p.`id` ASC", args...)
	if err != nil {
		return err
	}
	perProdi := countInOrder(prodiRows, func(row O) string {
		if v := row.Str("programStudi"); v != "" {
			return v
		}
		return "Tidak Diketahui"
	})
	perProdiOut := make([]O, 0, len(perProdi))
	for _, kv := range perProdi {
		perProdiOut = append(perProdiOut, O{{"programStudi", kv.K}, {"count", kv.V}})
	}

	users, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `User` WHERE `status` = 'approved'")
	if err != nil {
		return err
	}
	countRole := func(role string) (int64, error) {
		return countRows(ctx, s.db, "SELECT COUNT(*) FROM `User` u WHERE u.`status` = 'approved' AND EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`name` = ?)", role)
	}
	dosen, err := countRole("dosen")
	if err != nil {
		return err
	}
	reviewer, err := countRole("reviewer")
	if err != nil {
		return err
	}
	periodeAktif, err := queryObjs(ctx, s.db, "SELECT `id`,`nama`,`tahun`,`jenis` FROM `Periode` WHERE `isAktif` = TRUE ORDER BY `id` ASC")
	if err != nil {
		return err
	}
	tahunRows, err := queryObjs(ctx, s.db, "SELECT p.`createdAt`, pe.`tahun` FROM `Proposal` p LEFT JOIN `Periode` pe ON pe.`id` = p.`periodeId` ORDER BY p.`id` ASC")
	if err != nil {
		return err
	}
	perTahunMap := map[int64]int64{}
	for _, row := range tahunRows {
		tahun := row.Int64("tahun")
		if tahun == 0 {
			if t, ok := row.Get("createdAt").(JSTime); ok {
				tahun = int64(time.Time(t).Local().Year())
			}
		}
		perTahunMap[tahun]++
	}
	years := make([]int64, 0, len(perTahunMap))
	for y := range perTahunMap {
		years = append(years, y)
	}
	sort.Slice(years, func(i, j int) bool { return years[i] < years[j] })
	perTahun := make([]O, 0, len(years))
	for _, y := range years {
		perTahun = append(perTahun, O{{"tahun", y}, {"count", perTahunMap[y]}})
	}
	return c.ok("Dashboard stats fetched", O{
		{"totalProposal", total},
		{"perStatus", perStatus},
		{"perJenis", perJenis},
		{"perProdi", perProdiOut},
		{"perTahun", perTahun},
		{"users", O{{"total", users}, {"dosen", dosen}, {"reviewer", reviewer}}},
		{"periodeAktif", periodeAktif},
	})
}

// countInOrder counts keys keeping first-seen order (JS object semantics;
// note that JS orders integer-like keys first, which never happens here).
func countInOrder(rows []O, key func(O) string) O {
	out := O{}
	for _, row := range rows {
		k := key(row)
		n, _ := out.Get(k).(int64)
		out.Set(k, n+1)
	}
	return out
}

// ── activity logs ─────────────────────────────────────────────────────────

func toNumberOr(c *Ctx, key string, fallback float64) float64 {
	v, ok := c.queryValue(key)
	if !ok {
		return fallback
	}
	f := jsStringToNumber(v)
	if math.IsNaN(f) {
		return fallback
	}
	return f
}

func (s *Server) myActivityLogs(c *Ctx) error {
	return s.activityLogs(c, true)
}

func (s *Server) allActivityLogs(c *Ctx) error {
	return s.activityLogs(c, false)
}

func (s *Server) activityLogs(c *Ctx, own bool) error {
	page := toNumberOr(c, "page", 1)
	limit := toNumberOr(c, "limit", 20)
	where := "1=1"
	args := []any{}
	if own {
		where = "a.`userId` = ?"
		args = append(args, c.user.UserID)
	} else {
		if raw, ok := c.queryValue("userId"); ok && raw != "" {
			id, err := jsNumberParam(raw, "userId")
			if err != nil {
				return err
			}
			where += " AND a.`userId` = ?"
			args = append(args, id)
		}
		if action, ok := c.queryValue("action"); ok && action != "" {
			where += " AND a.`action` LIKE ?"
			args = append(args, "%"+action+"%")
		}
	}
	skip, take, err := paginationArgs(page, limit)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	logs, err := queryObjs(ctx, s.db,
		"SELECT "+activityColumns+" FROM `ActivityLog` a WHERE "+where+" ORDER BY a.`createdAt` DESC LIMIT ? OFFSET ?",
		append(append([]any{}, args...), take, skip)...)
	if err != nil {
		return err
	}
	if !own {
		if err := attachOne(ctx, s.db, logs, "userId", "user", "SELECT `id` AS `__k`,`id`,`name`,`email` FROM `User` WHERE `id` IN (%s)"); err != nil {
			return err
		}
	}
	if err := attachOne(ctx, s.db, logs, "proposalId", "proposal", "SELECT `id` AS `__k`,`id`,`judul`,`jenis` FROM `Proposal` WHERE `id` IN (%s)"); err != nil {
		return err
	}
	total, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ActivityLog` a WHERE "+where, args...)
	if err != nil {
		return err
	}
	return c.okMeta("Activity logs fetched", logs, page, limit, total)
}

// ── export ────────────────────────────────────────────────────────────────

var (
	statusLabel = map[string]string{"draft": "Draft", "diajukan": "Diajukan", "review": "Sedang Direview", "revisi": "Revisi", "disetujui": "Disetujui", "ditolak": "Ditolak"}
	jenisLabel  = map[string]string{"penelitian": "Penelitian", "pengabdian": "Pengabdian"}
)

func labelOr(labels map[string]string, value string) string {
	if l, ok := labels[value]; ok {
		return l
	}
	return value
}

func (s *Server) exportProposals(c *Ctx) error {
	clauses := []string{}
	args := []any{}
	if v, ok := c.queryValue("jenis"); ok && v != "" {
		if !validEnum(v, jenisKegiatan) {
			return enumFilterError("jenis", v, "JenisKegiatan")
		}
		clauses = append(clauses, "p.`jenis` = ?")
		args = append(args, v)
	}
	if v, ok := c.queryValue("status"); ok && v != "" {
		if !validEnum(v, proposalStatuses) {
			return enumFilterError("status", v, "ProposalStatus")
		}
		clauses = append(clauses, "p.`status` = ?")
		args = append(args, v)
	}
	numberFilter := func(key, clause string) error {
		raw, ok := c.queryValue(key)
		if !ok || raw == "" {
			return nil
		}
		f := jsStringToNumber(raw)
		if math.IsNaN(f) || f == 0 {
			return nil
		}
		if f != math.Trunc(f) {
			return invalidArgument(key, jsNumber(f))
		}
		clauses = append(clauses, clause)
		args = append(args, int64(f))
		return nil
	}
	if err := numberFilter("periodeId", "p.`periodeId` = ?"); err != nil {
		return err
	}
	if v, ok := c.queryValue("programStudi"); ok && v != "" {
		clauses = append(clauses, "u.`programStudi` = ?")
		args = append(args, v)
	}
	if err := numberFilter("tahun", "pe.`tahun` = ?"); err != nil {
		return err
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}
	ctx := c.r.Context()
	proposals, err := queryObjs(ctx, s.db,
		"SELECT p.`id`,p.`judul`,p.`jenis`,p.`status`,p.`anggaran`,p.`submittedAt`,p.`approvedAt`,p.`createdAt`,p.`catatanRevisi`,"+
			"u.`name` AS `u_name`,u.`fullName` AS `u_fullName`,u.`nidn` AS `u_nidn`,u.`programStudi` AS `u_programStudi`,"+
			"pe.`nama` AS `pe_nama`,pe.`tahun` AS `pe_tahun`"+
			" FROM `Proposal` p JOIN `User` u ON u.`id` = p.`pengusulId` LEFT JOIN `Periode` pe ON pe.`id` = p.`periodeId`"+
			where+" ORDER BY pe.`tahun` IS NULL, pe.`tahun` DESC, p.`createdAt` DESC", args...)
	if err != nil {
		return err
	}
	anggota, err := attachMany(ctx, s.db, proposals, "id", "__anggota",
		"SELECT a.`proposalId` AS `__k`, a.`peran`, u.`name`, u.`fullName` FROM `ProposalAnggota` a JOIN `User` u ON u.`id` = a.`userId` WHERE a.`proposalId` IN (%s) ORDER BY a.`id` ASC")
	if err != nil {
		return err
	}
	reviewers, err := attachMany(ctx, s.db, proposals, "id", "__reviewers",
		"SELECT t.`proposalId` AS `__k`, u.`name`, u.`fullName` FROM `ReviewerTugasan` t JOIN `User` u ON u.`id` = t.`reviewerId` WHERE t.`proposalId` IN (%s) ORDER BY t.`id` ASC")
	if err != nil {
		return err
	}
	reviews, err := attachMany(ctx, s.db, proposals, "id", "__reviews",
		"SELECT rv.`proposalId` AS `__k`, rv.`isDone` FROM `ProposalReview` rv WHERE rv.`proposalId` IN (%s) ORDER BY rv.`id` ASC")
	if err != nil {
		return err
	}

	perStatus, perJenis, perProdi := O{}, O{}, O{}
	rows := make([]O, 0, len(proposals))
	for i, p := range proposals {
		id := p.Int64("id")
		status, jenis := p.Str("status"), p.Str("jenis")
		prodi := p.Str("u_programStudi")
		incr := func(o *O, k string) {
			n, _ := o.Get(k).(int64)
			o.Set(k, n+1)
		}
		incr(&perStatus, status)
		incr(&perJenis, jenis)
		if prodi == "" {
			incr(&perProdi, "Tidak Diketahui")
		} else {
			incr(&perProdi, prodi)
		}

		pengusul := p.Str("u_fullName")
		if pengusul == "" {
			pengusul = p.Str("u_name")
		}
		periode := "-"
		if p.Get("pe_nama") != nil {
			periode = p.Str("pe_nama") + " (" + strconv.FormatInt(p.Int64("pe_tahun"), 10) + ")"
		}
		anggaran := "-"
		if d, ok := p.Get("anggaran").(Decimal); ok {
			f, _ := strconv.ParseFloat(string(d), 64)
			anggaran = formatIDNumber(f)
		}
		names := func(list []O, withPeran bool) string {
			parts := make([]string, 0, len(list))
			for _, item := range list {
				name := item.Str("fullName")
				if name == "" {
					name = item.Str("name")
				}
				if withPeran {
					name += " (" + item.Str("peran") + ")"
				}
				parts = append(parts, name)
			}
			if len(parts) == 0 {
				return "-"
			}
			return strings.Join(parts, "; ")
		}
		done := int64(0)
		for _, rv := range reviews[id] {
			if b, _ := rv.Get("isDone").(bool); b {
				done++
			}
		}
		dateOr := func(key string) string {
			if t, ok := p.Get(key).(JSTime); ok {
				return formatIDDate(time.Time(t))
			}
			return "-"
		}
		nidn := p.Str("u_nidn")
		if nidn == "" {
			nidn = "-"
		}
		programStudi := prodi
		if programStudi == "" {
			programStudi = "-"
		}
		catatan := p.Str("catatanRevisi")
		if catatan == "" {
			catatan = "-"
		}
		rows = append(rows, O{
			{"no", i + 1},
			{"id", id},
			{"judul", p.Get("judul")},
			{"jenis", jenisLabel[jenis]},
			{"status", statusLabel[status]},
			{"pengusul", pengusul},
			{"nidn", nidn},
			{"programStudi", programStudi},
			{"periode", periode},
			{"anggaran", anggaran},
			{"anggota", names(anggota[id], true)},
			{"reviewer", names(reviewers[id], false)},
			{"jumlahReview", int64(len(reviews[id]))},
			{"reviewSelesai", done},
			{"catatanRevisi", catatan},
			{"submittedAt", dateOr("submittedAt")},
			{"approvedAt", dateOr("approvedAt")},
			{"createdAt", dateOr("createdAt")},
		})
	}
	labelled := func(counts O, labels map[string]string) []O {
		out := make([]O, 0, len(counts))
		for _, kv := range counts {
			out = append(out, O{{"label", labelOr(labels, kv.K)}, {"count", kv.V}})
		}
		return out
	}
	prodiList := make([]KV, len(perProdi))
	copy(prodiList, perProdi)
	sort.SliceStable(prodiList, func(i, j int) bool { return prodiList[i].V.(int64) > prodiList[j].V.(int64) })
	prodiOut := make([]O, 0, len(prodiList))
	for _, kv := range prodiList {
		prodiOut = append(prodiOut, O{{"programStudi", kv.K}, {"count", kv.V}})
	}
	return c.ok("Export data fetched", O{
		{"total", int64(len(proposals))},
		{"ringkasan", O{
			{"perStatus", labelled(perStatus, statusLabel)},
			{"perJenis", labelled(perJenis, jenisLabel)},
			{"perProdi", prodiOut},
		}},
		{"rows", rows},
		{"generatedAt", formatJSTime(time.Now())},
	})
}
