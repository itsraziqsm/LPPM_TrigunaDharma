package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"unicode/utf8"

	"lppm-backend-go/internal/sqlb"
)

// W-34: hapus proposal/laporan yang sudah diajukan oleh Admin dengan izin Ketua LPPM. Tidak ada
// padanannya di Node (endpoint baru, new-api.md bagian 23). Draft tetap dihapus langsung lewat
// DELETE /proposals/:id atau DELETE /laporan/:id.
//   - Admin: POST /proposals/:id/deletion-request | /laporan/:id/deletion-request {password, alasan}
//   - Ketua: POST /dokumen/deletion-request/:requestId/approve {password} → dokumen terhapus
//   - Batal: POST /dokumen/deletion-request/:requestId/cancel {catatan?} (admin peminta = batal,
//     Ketua = tolak)
// Menghapus proposal ikut menghapus laporannya (dan semua relasi lewat CASCADE Kegiatan).

const dokumenHapusSelect = "SELECT d.`id`,d.`kegiatanId`,d.`tipe`,d.`jenis`,d.`judul`,d.`status`,d.`alasan`,d.`catatan`,d.`decidedAt`,d.`createdAt`,d.`updatedAt`," +
	"r.`id` AS `r_id`,r.`name` AS `r_name`,r.`fullName` AS `r_fullName`," +
	"a.`id` AS `a_id`,a.`name` AS `a_name`,a.`fullName` AS `a_fullName`," +
	"p.`id` AS `p_id`,p.`name` AS `p_name`,p.`fullName` AS `p_fullName`" +
	" FROM `DokumenDeletionRequest` d LEFT JOIN `User` r ON r.`id` = d.`requesterId`" +
	" LEFT JOIN `User` a ON a.`id` = d.`approverId` LEFT JOIN `User` p ON p.`id` = d.`pengusulId`"

var dokumenHapusListSchema = zObj(
	optional("status", zEnumOf("pending", "approved", "rejected", "cancelled")),
	optional("tipe", zEnumOf("proposal", "laporan")),
)

func (s *Server) registerDokumenHapusRoutes() {
	g := s.group("/api/v1/dokumen/deletion-request", s.authenticate)
	g.get("/", authorize("admin", "ketua_lppm"), s.validateQuery(dokumenHapusListSchema), s.listDokumenHapus)
	g.post("/:requestId/approve", authorize("ketua_lppm"), s.approveDokumenHapus)
	g.post("/:requestId/cancel", authorize("admin", "ketua_lppm"), s.cancelDokumenHapus)
}

func dokumenHapusUser(row O, prefix string) any {
	if row.Get(prefix+"id") == nil {
		return nil
	}
	return O{{"id", row.Get(prefix + "id")}, {"name", row.Get(prefix + "name")}, {"fullName", row.Get(prefix + "fullName")}}
}

func dokumenHapusItem(row O) O {
	return O{
		{"id", row.Get("id")},
		{"tipe", row.Get("tipe")},
		{"kegiatanId", row.Get("kegiatanId")},
		{"jenis", row.Get("jenis")},
		{"judul", row.Get("judul")},
		{"status", row.Get("status")},
		{"alasan", row.Get("alasan")},
		{"catatan", row.Get("catatan")},
		{"requester", dokumenHapusUser(row, "r_")},
		{"approver", dokumenHapusUser(row, "a_")},
		{"pengusul", dokumenHapusUser(row, "p_")},
		{"decidedAt", row.Get("decidedAt")},
		{"createdAt", row.Get("createdAt")},
		{"updatedAt", row.Get("updatedAt")},
	}
}

func (s *Server) dokumenHapusByID(ctx context.Context, q dbtx, id int64) (O, error) {
	row, err := queryObj(ctx, q, dokumenHapusSelect+" WHERE d.`id` = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpError(http.StatusNotFound, "Permintaan penghapusan tidak ditemukan")
	}
	return row, nil
}

// kegiatanUntukHapus memastikan :id ada dan bertipe sesuai route.
func (s *Server) kegiatanUntukHapus(ctx context.Context, id int64, tipe string) (judul, jenis, status string, pengusulID int64, err error) {
	view := "Proposal"
	label := "Proposal"
	if tipe == "laporan" {
		view, label = "Laporan", "Laporan"
	}
	err = s.db.QueryRowContext(ctx, "SELECT `judul`,`jenis`,`status`,`pengusulId` FROM `"+view+"` WHERE `id` = ?", id).
		Scan(&judul, &jenis, &status, &pengusulID)
	if isNoRows(err) {
		err = httpError(http.StatusNotFound, label+" tidak ditemukan")
	}
	return
}

// usersByRole: user approved berperan role (selain except).
func (s *Server) usersByRole(ctx context.Context, role string, except int64) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT u.`id` FROM `User` u WHERE u.`status` = 'approved' AND u.`id` <> ? AND EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`name` = ?) ORDER BY u.`id`",
		except, role)
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

// cekPasswordBaru: versi endpoint baru (400, bukan 500 gaya Node).
func (s *Server) cekPasswordBaru(c *Ctx) error {
	password, ok := passwordFromBody(c)
	if !ok {
		return httpError(http.StatusBadRequest, "Password wajib diisi")
	}
	if err := s.verifyUserPassword(c.r.Context(), c.user.UserID, password); err != nil {
		return httpError(http.StatusBadRequest, "Password salah")
	}
	return nil
}

func tipeLabel(tipe string) string {
	if tipe == "laporan" {
		return "Laporan"
	}
	return "Proposal"
}

// requestDokumenHapus: POST /proposals/:id/deletion-request & /laporan/:id/deletion-request (admin).
func (s *Server) requestDokumenHapus(tipe string) step {
	return func(c *Ctx) error {
		id, err := idParam(c, "id")
		if err != nil {
			return err
		}
		ctx := c.r.Context()
		judul, jenis, _, pengusulID, err := s.kegiatanUntukHapus(ctx, id, tipe)
		if err != nil {
			return err
		}
		alasan, _ := c.bodyMap()["alasan"].(string)
		alasan = strings.TrimSpace(alasan)
		if n := utf8.RuneCountInString(alasan); n < 5 || n > 1000 {
			c.s.validationFailed(c.w, c.r, O{{"alasan", []string{"Alasan wajib diisi (5–1000 karakter)"}}})
			return errStop
		}
		if err := s.cekPasswordBaru(c); err != nil {
			return err
		}
		pending, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `DokumenDeletionRequest` WHERE `kegiatanId` = ? AND `status` = 'pending'", id)
		if err != nil {
			return err
		}
		if pending > 0 {
			return httpError(http.StatusConflict, "Sudah ada permintaan penghapusan yang menunggu persetujuan Ketua LPPM")
		}
		now := s.nowMs()
		res, err := s.db.ExecContext(ctx,
			"INSERT INTO `DokumenDeletionRequest` (`kegiatanId`,`tipe`,`jenis`,`judul`,`pengusulId`,`requesterId`,`alasan`,`status`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,'pending',?,?)",
			id, tipe, jenis, judul, pengusulID, c.user.UserID, alasan, now, now)
		if err != nil {
			return err
		}
		reqID, err := res.LastInsertId()
		if err != nil {
			return err
		}
		ketua, err := s.usersByRole(ctx, "ketua_lppm", c.user.UserID)
		if err != nil {
			return err
		}
		for _, uid := range ketua {
			if err := s.createNotification(ctx, s.db, notification{
				UserID: uid, Type: "deletion_request", Judul: "Permintaan Penghapusan " + tipeLabel(tipe),
				Pesan: `Admin meminta penghapusan ` + strings.ToLower(tipeLabel(tipe)) + ` "` + judul + `". Alasan: ` + alasan,
				RefID: reqID, RefType: "DokumenDeletionRequest",
			}); err != nil {
				return err
			}
		}
		if err := s.logActivity(ctx, s.db, c, activityEntry{
			UserID: c.user.UserID, Action: tipe + ".deletion_request", EntityType: tipe, EntityID: id, ProposalID: id,
			Detail: `Permintaan hapus ` + strings.ToLower(tipeLabel(tipe)) + ` "` + judul + `": ` + alasan,
		}); err != nil {
			return err
		}
		row, err := s.dokumenHapusByID(ctx, s.db, reqID)
		if err != nil {
			return err
		}
		return c.created("Permintaan penghapusan dikirim ke Ketua LPPM", dokumenHapusItem(row))
	}
}

// pendingDokumenHapus: GET /proposals/:id/deletion-request & /laporan/:id/deletion-request.
func (s *Server) pendingDokumenHapus(tipe string) step {
	return func(c *Ctx) error {
		id, err := idParam(c, "id")
		if err != nil {
			return err
		}
		ctx := c.r.Context()
		if _, _, _, _, err := s.kegiatanUntukHapus(ctx, id, tipe); err != nil {
			return err
		}
		row, err := queryObj(ctx, s.db, dokumenHapusSelect+" WHERE d.`kegiatanId` = ? AND d.`status` = 'pending' ORDER BY d.`id` DESC LIMIT 1", id)
		if err != nil {
			return err
		}
		if row == nil {
			return c.ok("Tidak ada permintaan penghapusan", nil)
		}
		return c.ok("Permintaan penghapusan fetched", dokumenHapusItem(row))
	}
}

func (s *Server) listDokumenHapus(c *Ctx) error {
	where, args := []string{}, []any{}
	for _, f := range []string{"status", "tipe"} {
		if v, ok := c.validatedQuery[f].(string); ok {
			where = append(where, "d.`"+f+"` = ?")
			args = append(args, v)
		}
	}
	cond := ""
	if len(where) > 0 {
		cond = " WHERE " + strings.Join(where, " AND ")
	}
	rows, err := queryObjs(c.r.Context(), s.db, dokumenHapusSelect+cond+" ORDER BY d.`status` = 'pending' DESC, d.`id` DESC LIMIT 200", args...)
	if err != nil {
		return err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		items[i] = dokumenHapusItem(r)
	}
	return c.ok("Permintaan penghapusan fetched", items)
}

func (s *Server) pendingRequestRow(c *Ctx) (int64, O, error) {
	reqID, err := idParam(c, "requestId")
	if err != nil {
		return 0, nil, err
	}
	row, err := s.dokumenHapusByID(c.r.Context(), s.db, reqID)
	if err != nil {
		return 0, nil, err
	}
	if row.Get("status") != "pending" {
		return 0, nil, httpError(http.StatusConflict, "Permintaan penghapusan sudah diproses")
	}
	return reqID, row, nil
}

func (s *Server) approveDokumenHapus(c *Ctx) error {
	reqID, row, err := s.pendingRequestRow(c)
	if err != nil {
		return err
	}
	if err := s.cekPasswordBaru(c); err != nil {
		return err
	}
	ctx := c.r.Context()
	tipe := row.Str("tipe")
	judul := row.Str("judul")
	kid, _ := row.Get("kegiatanId").(int64)
	if kid == 0 {
		return httpError(http.StatusConflict, tipeLabel(tipe)+" sudah tidak ada")
	}
	now := s.nowMs()
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		ids := []int64{kid}
		if tipe == "proposal" {
			rows, err := tx.QueryContext(ctx, "SELECT `id` FROM `Laporan` WHERE `proposalId` = ?", kid)
			if err != nil {
				return err
			}
			for rows.Next() {
				var id int64
				if err := rows.Scan(&id); err != nil {
					_ = rows.Close()
					return err
				}
				ids = append(ids, id)
			}
			_ = rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
		}
		args := idArgs(ids)
		if _, err := tx.ExecContext(ctx, sqlb.In("DELETE FROM `Notification` WHERE `refType` IN ('proposal','laporan') AND `refId` IN (?*)", len(ids)), args...); err != nil {
			return err
		}
		// permintaan ini + permintaan lain yang menunggu untuk dokumen yang sama/turunannya
		if _, err := tx.ExecContext(ctx,
			sqlb.In("UPDATE `DokumenDeletionRequest` SET `status` = 'approved', `approverId` = ?, `decidedAt` = ?, `updatedAt` = ? WHERE `status` = 'pending' AND (`id` = ? OR `kegiatanId` IN (?*))", len(ids)),
			append([]any{c.user.UserID, now, now, reqID}, args...)...); err != nil {
			return err
		}
		for i := len(ids) - 1; i >= 0; i-- { // laporan dulu, baru proposal
			if err := s.deleteKegiatan(ctx, tx, ids[i]); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	notify := map[int64]string{}
	if v, ok := row.Get("p_id").(int64); ok {
		notify[v] = tipeLabel(tipe) + ` "` + judul + `" dihapus oleh LPPM. Alasan: ` + row.Str("alasan")
	}
	if v, ok := row.Get("r_id").(int64); ok && v != c.user.UserID {
		notify[v] = `Permintaan penghapusan ` + strings.ToLower(tipeLabel(tipe)) + ` "` + judul + `" disetujui Ketua LPPM.`
	}
	for uid, pesan := range notify {
		if err := s.createNotification(ctx, s.db, notification{
			UserID: uid, Type: "deletion_approved", Judul: tipeLabel(tipe) + " Dihapus", Pesan: pesan,
			RefID: reqID, RefType: "DokumenDeletionRequest",
		}); err != nil {
			return err
		}
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: tipe + ".delete", EntityType: tipe, EntityID: kid,
		Detail: tipeLabel(tipe) + ` "` + judul + `" dihapus atas permintaan admin (disetujui Ketua LPPM)`,
	}); err != nil {
		return err
	}
	updated, err := s.dokumenHapusByID(ctx, s.db, reqID)
	if err != nil {
		return err
	}
	return c.ok(tipeLabel(tipe)+" berhasil dihapus", dokumenHapusItem(updated))
}

// cancelDokumenHapus: admin peminta membatalkan (cancelled) atau Ketua menolak (rejected).
func (s *Server) cancelDokumenHapus(c *Ctx) error {
	reqID, row, err := s.pendingRequestRow(c)
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	isKetua := contains(c.user.Roles, "ketua_lppm")
	requester, _ := row.Get("r_id").(int64)
	if !isKetua && requester != c.user.UserID {
		return httpError(http.StatusForbidden, "Hanya admin peminta atau Ketua LPPM yang dapat membatalkan permintaan ini")
	}
	status, msg := "cancelled", "Permintaan penghapusan dibatalkan"
	if isKetua && requester != c.user.UserID {
		status, msg = "rejected", "Permintaan penghapusan ditolak"
	}
	var catatan any
	if v, _ := c.bodyMap()["catatan"].(string); strings.TrimSpace(v) != "" {
		catatan = strings.TrimSpace(v)
	}
	now := s.nowMs()
	if _, err := s.db.ExecContext(ctx,
		"UPDATE `DokumenDeletionRequest` SET `status` = ?, `catatan` = ?, `approverId` = ?, `decidedAt` = ?, `updatedAt` = ? WHERE `id` = ?",
		status, catatan, c.user.UserID, now, now, reqID); err != nil {
		return err
	}
	if status == "rejected" && requester != 0 {
		pesan := `Permintaan penghapusan ` + strings.ToLower(tipeLabel(row.Str("tipe"))) + ` "` + row.Str("judul") + `" ditolak Ketua LPPM.`
		if s, ok := catatan.(string); ok {
			pesan += " Catatan: " + s
		}
		if err := s.createNotification(ctx, s.db, notification{
			UserID: requester, Type: "deletion_cancelled", Judul: "Permintaan Penghapusan Ditolak", Pesan: pesan,
			RefID: reqID, RefType: "DokumenDeletionRequest",
		}); err != nil {
			return err
		}
	}
	updated, err := s.dokumenHapusByID(ctx, s.db, reqID)
	if err != nil {
		return err
	}
	return c.ok(msg, dokumenHapusItem(updated))
}
