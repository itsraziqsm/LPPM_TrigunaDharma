package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"
)

// Node: routes/periode.routes.ts, controllers/periode.controller.ts,
// services/periode.service.ts.

const periodeColumns = "`id`,`nama`,`tahun`,`jenis`,`tanggalMulai`,`tanggalSelesai`,`isAktif`,`createdAt`,`updatedAt`"

var (
	jenisKegiatan  = []string{"penelitian", "pengabdian"}
	periodeTanggal = &zUnion{options: []zSchema{zStr().Datetime(true), zStr().Date()}}
	periodeSchema  = zObj(
		required("nama", zStr().Min(3, "Nama minimal 3 karakter")),
		required("tahun", zNum().Int().Min(2000).Max(2100)),
		required("jenis", zEnumOf(jenisKegiatan...)),
		required("tanggalMulai", periodeTanggal),
		required("tanggalSelesai", periodeTanggal),
		optional("isAktif", zBoolean{}),
	)
)

func (s *Server) registerPeriodeRoutes() {
	g := s.group("/api/v1/periode", s.authenticate)
	g.get("/", s.listPeriode)
	g.get("/:id", s.getPeriode)
	g.post("/", authorize("admin", "ketua_lppm"), validateBody(periodeSchema), s.createPeriode)
	g.patch("/:id", authorize("admin", "ketua_lppm"), validateBody(periodeSchema.partial()), s.updatePeriode)
	g.get("/:id/deletion-request", authorize("admin", "ketua_lppm"), s.pendingDeletionRequest)
	g.post("/:id/deletion-request", authorize("admin", "ketua_lppm"), s.requestPeriodeDeletion)
	g.post("/deletion-request/:requestId/approve", authorize("admin", "ketua_lppm"), s.approvePeriodeDeletion)
	g.post("/deletion-request/:requestId/cancel", authorize("admin", "ketua_lppm"), s.cancelPeriodeDeletion)
}

func validEnum(value string, values []string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

// enumFilterError mirrors Prisma rejecting an unknown enum value in a filter.
func enumFilterError(field, value, enumName string) error {
	return plainError("Invalid value for argument `" + field + "`. Expected " + enumName + ". Received: \"" + value + "\"")
}

func (s *Server) listPeriode(c *Ctx) error {
	clauses := []string{}
	args := []any{}
	if jenis, ok := c.queryValue("jenis"); ok {
		if !validEnum(jenis, jenisKegiatan) {
			return enumFilterError("jenis", jenis, "JenisKegiatan")
		}
		clauses = append(clauses, "`jenis` = ?")
		args = append(args, jenis)
	}
	if tahun, ok := c.queryValue("tahun"); ok {
		n, err := jsNumberParam(tahun, "tahun")
		if err != nil {
			return err
		}
		clauses = append(clauses, "`tahun` = ?")
		args = append(args, n)
	}
	if isAktif, ok := c.queryValue("isAktif"); ok {
		clauses = append(clauses, "`isAktif` = ?")
		args = append(args, isAktif == "true")
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}
	items, err := queryObjs(c.r.Context(), s.db, "SELECT "+periodeColumns+" FROM `Periode`"+where+" ORDER BY `tahun` DESC, `createdAt` DESC", args...)
	if err != nil {
		return err
	}
	return c.ok("Periode fetched", items)
}

func (s *Server) periodeByID(ctx context.Context, q dbtx, id int64) (O, error) {
	return queryObj(ctx, q, "SELECT "+periodeColumns+" FROM `Periode` WHERE `id` = ?", id)
}

// ensurePeriodeExists mirrors the service helper: any failure (including an
// invalid id) becomes "Periode tidak ditemukan" (HTTP 500 in Node).
func (s *Server) ensurePeriodeExists(ctx context.Context, rawID string) (O, int64, error) {
	id, err := jsNumberParam(rawID, "id")
	if err != nil {
		return nil, 0, plainError("Periode tidak ditemukan")
	}
	periode, err := s.periodeByID(ctx, s.db, id)
	if err != nil || periode == nil {
		return nil, 0, plainError("Periode tidak ditemukan")
	}
	return periode, id, nil
}

func (s *Server) getPeriode(c *Ctx) error {
	periode, _, err := s.ensurePeriodeExists(c.r.Context(), c.param("id"))
	if err != nil {
		return err
	}
	return c.ok("Periode fetched", periode)
}

func periodeDate(value any) (time.Time, error) {
	text, _ := value.(string)
	t, err := parseJSDate(text)
	if err != nil {
		return time.Time{}, plainError("Invalid value for argument `tanggal`: Provided Date object is invalid.")
	}
	return t, nil
}

func (s *Server) createPeriode(c *Ctx) error {
	body := c.bodyMap()
	start, err := periodeDate(body["tanggalMulai"])
	if err != nil {
		return err
	}
	end, err := periodeDate(body["tanggalSelesai"])
	if err != nil {
		return err
	}
	isAktif := true
	if v, ok := body["isAktif"].(bool); ok {
		isAktif = v
	}
	now := s.nowMs()
	ctx := c.r.Context()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO `Periode` (`nama`,`tahun`,`jenis`,`tanggalMulai`,`tanggalSelesai`,`isAktif`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?)",
		body["nama"], int64(body["tahun"].(float64)), body["jenis"], start, end, isAktif, now, now)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	periode, err := s.periodeByID(ctx, s.db, id)
	if err != nil {
		return err
	}
	return c.created("Periode created", periode)
}

func (s *Server) updatePeriode(c *Ctx) error {
	ctx := c.r.Context()
	_, id, err := s.ensurePeriodeExists(ctx, c.param("id"))
	if err != nil {
		return err
	}
	body := c.bodyMap()
	sets := []string{}
	args := []any{}
	for _, field := range []string{"nama", "tahun", "jenis", "tanggalMulai", "tanggalSelesai", "isAktif"} {
		value, ok := body[field]
		if !ok {
			continue
		}
		switch field {
		case "tahun":
			value = int64(value.(float64))
		case "tanggalMulai", "tanggalSelesai":
			t, err := periodeDate(value)
			if err != nil {
				return err
			}
			value = t
		}
		sets = append(sets, "`"+field+"` = ?")
		args = append(args, value)
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, s.nowMs(), id)
	if _, err := s.db.ExecContext(ctx, "UPDATE `Periode` SET "+strings.Join(sets, ", ")+" WHERE `id` = ?", args...); err != nil {
		return err
	}
	periode, err := s.periodeByID(ctx, s.db, id)
	if err != nil {
		return err
	}
	return c.ok("Periode updated", periode)
}

// ── 2-step deletion ───────────────────────────────────────────────────────

func isAdminOrKetua(roles []string) bool {
	return contains(roles, "admin") || contains(roles, "ketua_lppm")
}

func (s *Server) verifyUserPassword(ctx context.Context, userID int64, password string) error {
	var hash string
	err := s.db.QueryRowContext(ctx, "SELECT `password` FROM `User` WHERE `id` = ?", userID).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return plainError("Password salah")
	}
	if err != nil {
		return err
	}
	if !passwordMatches(hash, password) {
		return plainError("Password salah")
	}
	return nil
}

// passwordFromBody mirrors `const { password } = req.body; if (!password)`.
func passwordFromBody(c *Ctx) (string, bool) {
	value, _ := c.bodyField("password")
	switch v := value.(type) {
	case string:
		return v, v != ""
	case float64:
		return jsNumber(v), v != 0 && !math.IsNaN(v)
	case bool:
		if v {
			return "true", true
		}
	case []any, map[string]any:
		return "", true
	}
	return "", false
}

func (s *Server) pendingDeletionRequest(c *Ctx) error {
	ctx := c.r.Context()
	id, err := jsNumberParam(c.param("id"), "periodeId")
	if err != nil {
		return err
	}
	item, err := queryObj(ctx, s.db,
		"SELECT d.`id`,d.`periodeId`,d.`requesterId`,d.`approverId`,d.`status`,d.`expiresAt`,d.`createdAt`,d.`updatedAt`,"+
			"u.`id` AS r_id, u.`name` AS r_name FROM `PeriodeDeletionRequest` d JOIN `User` u ON u.`id` = d.`requesterId` "+
			"WHERE d.`periodeId` = ? AND d.`status` = 'pending' AND d.`expiresAt` > ? ORDER BY d.`id` ASC LIMIT 1",
		id, s.nowMs())
	if err != nil {
		return err
	}
	if item == nil {
		return c.ok("Pending deletion request", nil)
	}
	items := []O{item}
	nestColumns(items, "r_", "requester")
	return c.ok("Pending deletion request", items[0])
}

func (s *Server) requestPeriodeDeletion(c *Ctx) error {
	password, ok := passwordFromBody(c)
	if !ok {
		return c.fail(http.StatusBadRequest, "Password wajib diisi")
	}
	ctx := c.r.Context()
	roles := c.user.Roles
	if !isAdminOrKetua(roles) {
		return plainError("Hanya admin atau ketua LPPM yang dapat melakukan tindakan ini")
	}
	periode, periodeID, err := s.ensurePeriodeExists(ctx, c.param("id"))
	if err != nil {
		return err
	}
	if err := s.verifyUserPassword(ctx, c.user.UserID, password); err != nil {
		return err
	}
	now := s.nowMs()
	if _, err := s.db.ExecContext(ctx,
		"UPDATE `PeriodeDeletionRequest` SET `status` = 'cancelled', `updatedAt` = ? WHERE `periodeId` = ? AND `status` = 'pending'",
		now, periodeID); err != nil {
		return err
	}
	expiresAt := addDaysLocal(now, 1)
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO `PeriodeDeletionRequest` (`periodeId`,`requesterId`,`status`,`expiresAt`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?)",
		periodeID, c.user.UserID, "pending", expiresAt, now, now)
	if err != nil {
		return err
	}
	requestID, err := res.LastInsertId()
	if err != nil {
		return err
	}
	targetRole := "admin"
	if contains(roles, "admin") {
		targetRole = "ketua_lppm"
	}
	rows, err := s.db.QueryContext(ctx,
		"SELECT u.`id` FROM `User` u WHERE u.`status` = 'approved' AND EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`name` = ?) ORDER BY u.`id`",
		targetRole)
	if err != nil {
		return err
	}
	var targets []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		targets = append(targets, id)
	}
	rows.Close()
	for _, userID := range targets {
		if err := s.createNotification(ctx, s.db, notification{
			UserID: userID, Type: "deletion_request", Judul: "Permintaan Penghapusan Periode",
			Pesan: `Ada permintaan penghapusan periode "` + periode.Str("nama") + `". Masuk ke halaman Periode untuk menyetujui atau membatalkan.`,
			RefID: requestID, RefType: "PeriodeDeletionRequest",
		}); err != nil {
			return err
		}
	}
	return c.ok("Permintaan penghapusan berhasil dibuat", O{{"requestId", requestID}, {"expiresAt", expiresAt}})
}

func (s *Server) approvePeriodeDeletion(c *Ctx) error {
	password, ok := passwordFromBody(c)
	if !ok {
		return c.fail(http.StatusBadRequest, "Password wajib diisi")
	}
	ctx := c.r.Context()
	approverRoles := c.user.Roles
	approverID := c.user.UserID
	if !isAdminOrKetua(approverRoles) {
		return plainError("Hanya admin atau ketua LPPM yang dapat melakukan tindakan ini")
	}
	requestID, err := jsNumberParam(c.param("requestId"), "id")
	if err != nil {
		return err
	}
	var periodeID, requesterID int64
	var expiresAt time.Time
	var periodeName string
	err = s.db.QueryRowContext(ctx,
		"SELECT d.`periodeId`, d.`requesterId`, d.`expiresAt`, p.`nama` FROM `PeriodeDeletionRequest` d JOIN `Periode` p ON p.`id` = d.`periodeId` WHERE d.`id` = ? AND d.`status` = 'pending' LIMIT 1",
		requestID).Scan(&periodeID, &requesterID, &expiresAt, &periodeName)
	found := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if !found || expiresAt.Before(s.now()) {
		if found {
			if _, err := s.db.ExecContext(ctx, "UPDATE `PeriodeDeletionRequest` SET `status` = 'expired', `updatedAt` = ? WHERE `id` = ?", s.nowMs(), requestID); err != nil {
				return err
			}
		}
		return plainError("Permintaan penghapusan tidak ditemukan atau sudah tidak valid")
	}
	if requesterID == approverID {
		return plainError("Tidak dapat menyetujui permintaan yang Anda buat sendiri")
	}
	requesterRoles, err := s.rolesOf(ctx, s.db, requesterID)
	if err != nil {
		return err
	}
	if contains(approverRoles, "admin") == contains(requesterRoles, "admin") {
		return plainError("Tidak dapat menyetujui permintaan yang Anda buat sendiri")
	}
	if err := s.verifyUserPassword(ctx, approverID, password); err != nil {
		return err
	}
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			"UPDATE `PeriodeDeletionRequest` SET `status` = 'approved', `approverId` = ?, `updatedAt` = ? WHERE `id` = ?",
			approverID, s.nowMs(), requestID); err != nil {
			return err
		}
		res, err := tx.ExecContext(ctx, "DELETE FROM `Periode` WHERE `id` = ?", periodeID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return notFoundRecord("Periode")
		}
		return nil
	})
	if err != nil {
		return err
	}
	if err := s.createNotification(ctx, s.db, notification{
		UserID: requesterID, Type: "deletion_approved", Judul: "Periode Berhasil Dihapus",
		Pesan: `Periode "` + periodeName + `" telah dihapus setelah disetujui.`,
		RefID: requestID, RefType: "PeriodeDeletionRequest",
	}); err != nil {
		return err
	}
	return c.ok("Periode berhasil dihapus", noData)
}

func (s *Server) cancelPeriodeDeletion(c *Ctx) error {
	ctx := c.r.Context()
	if !isAdminOrKetua(c.user.Roles) {
		return plainError("Hanya admin atau ketua LPPM yang dapat melakukan tindakan ini")
	}
	requestID, err := jsNumberParam(c.param("requestId"), "id")
	if err != nil {
		return err
	}
	var requesterID int64
	var periodeName string
	err = s.db.QueryRowContext(ctx,
		"SELECT d.`requesterId`, p.`nama` FROM `PeriodeDeletionRequest` d JOIN `Periode` p ON p.`id` = d.`periodeId` WHERE d.`id` = ? AND d.`status` = 'pending' LIMIT 1",
		requestID).Scan(&requesterID, &periodeName)
	if errors.Is(err, sql.ErrNoRows) {
		return plainError("Permintaan penghapusan tidak ditemukan atau sudah tidak valid")
	}
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE `PeriodeDeletionRequest` SET `status` = 'cancelled', `updatedAt` = ? WHERE `id` = ?", s.nowMs(), requestID); err != nil {
		return err
	}
	if requesterID != c.user.UserID {
		if err := s.createNotification(ctx, s.db, notification{
			UserID: requesterID, Type: "deletion_cancelled", Judul: "Permintaan Penghapusan Dibatalkan",
			Pesan: `Permintaan penghapusan periode "` + periodeName + `" telah dibatalkan.`,
			RefID: requestID, RefType: "PeriodeDeletionRequest",
		}); err != nil {
			return err
		}
	}
	return c.ok("Permintaan penghapusan dibatalkan", noData)
}
