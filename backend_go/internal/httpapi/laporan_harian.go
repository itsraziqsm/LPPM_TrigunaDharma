package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

// Node: routes/laporanHarian.routes.ts, controllers/laporanHarian.controller.ts,
// services/laporanHarian.service.ts.

const laporanHarianListColumns = "`id`,`tanggal`,`kegiatan`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`linkGdrive`,`createdAt`"

func (s *Server) registerLaporanHarianRoutes() {
	g := s.group("/api/v1/mahasiswa/laporan-harian", s.authenticate, authorize("mahasiswa"))
	g.get("/proposals", s.laporanHarianProposals)
	g.get("/dokumen/:id", s.laporanHarianDokumen)
	g.get("/:proposalId", s.laporanHarianList)
	g.post("/:proposalId", multerSingle("file"), s.laporanHarianCreate)
	g.delete("/:id", s.laporanHarianDelete)
}

func (s *Server) laporanHarianProposals(c *Ctx) error {
	ctx := c.r.Context()
	rows, err := queryObjs(ctx, s.db,
		"SELECT a.`id` AS `anggotaId`, a.`peran`, p.`id`, p.`judul`, p.`jenis`, p.`status`,"+
			" u.`id` AS `u_id`, u.`name` AS `u_name`, u.`fullName` AS `u_fullName`,"+
			" pe.`id` AS `pe_id`, pe.`nama` AS `pe_nama`, pe.`tahun` AS `pe_tahun`"+
			" FROM `ProposalAnggota` a JOIN `Proposal` p ON p.`id` = a.`proposalId` JOIN `User` u ON u.`id` = p.`pengusulId`"+
			" LEFT JOIN `Periode` pe ON pe.`id` = p.`periodeId`"+
			" WHERE a.`userId` = ? AND a.`statusUndangan` = 'diterima' ORDER BY a.`createdAt` DESC",
		c.user.UserID)
	if err != nil {
		return err
	}
	nestColumns(rows, "u_", "pengusul")
	nestColumns(rows, "pe_", "periode")
	return c.ok("Proposals fetched", rows)
}

func (s *Server) verifyAcceptedMember(ctx context.Context, proposalID, userID int64) error {
	n, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ProposalAnggota` WHERE `proposalId` = ? AND `userId` = ? AND `statusUndangan` = 'diterima'", proposalID, userID)
	if err != nil {
		return err
	}
	if n == 0 {
		return httpError(http.StatusForbidden, "Anda bukan anggota proposal ini")
	}
	return nil
}

func (s *Server) laporanHarianList(c *Ctx) error {
	proposalID, err := jsNumberParam(c.param("proposalId"), "proposalId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.verifyAcceptedMember(ctx, proposalID, c.user.UserID); err != nil {
		return err
	}
	items, err := queryObjs(ctx, s.db,
		"SELECT "+laporanHarianListColumns+",`updatedAt` FROM `LaporanHarian` WHERE `proposalId` = ? AND `userId` = ? ORDER BY `tanggal` DESC",
		proposalID, c.user.UserID)
	if err != nil {
		return err
	}
	return c.ok("Laporan harian fetched", items)
}

func (s *Server) laporanHarianCreate(c *Ctx) error {
	rawID := c.param("proposalId")
	body := c.bodyMap()
	const invalid = "Tanggal dan kegiatan wajib diisi"
	tanggalRaw, hasTanggal := body["tanggal"]
	tanggal, ok := coerceJSDate(tanggalRaw, hasTanggal)
	if !ok {
		return c.fail(http.StatusBadRequest, invalid)
	}
	kegiatanRaw, ok := body["kegiatan"].(string)
	kegiatan := strings.TrimSpace(kegiatanRaw)
	if !ok || kegiatan == "" {
		return c.fail(http.StatusBadRequest, invalid)
	}
	var linkGdrive any
	if raw, exists := body["linkGdrive"]; exists {
		text, isString := raw.(string)
		if !isString {
			return c.fail(http.StatusBadRequest, invalid)
		}
		if t := strings.TrimSpace(text); t != "" {
			linkGdrive = t
		}
	}
	proposalID, err := jsNumberParam(rawID, "proposalId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if err := s.verifyAcceptedMember(ctx, proposalID, c.user.UserID); err != nil {
		return err
	}
	var nama, mimeType, ukuran, blob any
	if c.file != nil {
		verified, err := validateFileIsAllowedDocument(c.file.data)
		if err != nil {
			return err
		}
		nama, mimeType, ukuran, blob = c.file.originalname, verified, c.file.size, c.file.data
	}
	now := s.nowMs()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO `LaporanHarian` (`proposalId`,`userId`,`tanggal`,`kegiatan`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`dokumenBlob`,`linkGdrive`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
		proposalID, c.user.UserID, tanggal.Truncate(1e6), kegiatan, nama, mimeType, ukuran, blob, linkGdrive, now, now)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	item, err := queryObj(ctx, s.db, "SELECT "+laporanHarianListColumns+" FROM `LaporanHarian` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	return c.created("Laporan harian berhasil dibuat", item)
}

type laporanHarianRow struct {
	userID int64
	blob   []byte
	mime   sql.NullString
	nama   sql.NullString
}

func (s *Server) ownedLaporanHarian(c *Ctx, id int64) (*laporanHarianRow, error) {
	var row laporanHarianRow
	err := s.db.QueryRowContext(c.r.Context(), "SELECT `userId`,`dokumenBlob`,`dokumenMime`,`dokumenNama` FROM `LaporanHarian` WHERE `id` = ?", id).
		Scan(&row.userID, &row.blob, &row.mime, &row.nama)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, httpError(http.StatusNotFound, "Laporan tidak ditemukan")
	}
	if err != nil {
		return nil, err
	}
	if row.userID != c.user.UserID {
		return nil, httpError(http.StatusForbidden, "Akses ditolak")
	}
	return &row, nil
}

// laporanHarianDokumen sends the stored file. (The Node controller uses
// res.send(Uint8Array), which Express serialises as JSON text; the Go
// server sends the original bytes so the download is a valid file.)
func (s *Server) laporanHarianDokumen(c *Ctx) error {
	id, err := jsNumberParam(c.param("id"), "id")
	if err != nil {
		return err
	}
	row, err := s.ownedLaporanHarian(c, id)
	if err != nil {
		return err
	}
	if row.blob == nil {
		return httpError(http.StatusNotFound, "Dokumen tidak tersedia")
	}
	name := row.nama.String
	if name == "" {
		name = "laporan-harian"
	}
	h := c.w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Disposition", `inline; filename="`+jsEncodeURIComponent(name)+`"`)
	mimeType := row.mime.String
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	h.Set("Content-Type", mimeType)
	h.Set("Content-Length", strconv.Itoa(len(row.blob)))
	c.w.WriteHeader(http.StatusOK)
	if c.r.Method != http.MethodHead {
		_, _ = c.w.Write(row.blob)
	}
	return errStop
}

func (s *Server) laporanHarianDelete(c *Ctx) error {
	id, err := jsNumberParam(c.param("id"), "id")
	if err != nil {
		return err
	}
	if _, err := s.ownedLaporanHarian(c, id); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(c.r.Context(), "DELETE FROM `LaporanHarian` WHERE `id` = ?", id); err != nil {
		return err
	}
	return c.ok("Laporan harian berhasil dihapus", noData)
}
