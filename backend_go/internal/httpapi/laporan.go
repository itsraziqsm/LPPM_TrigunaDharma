package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"net/http"

	"lppm-backend-go/internal/sqlb"
)

// Node: controllers/laporan.controller.ts, services/laporan.service.ts,
// controllers/dokumen.controller.ts, services/dokumen.service.ts.

const laporanListColumns = "`id`,`proposalId`,`jenis`,`judul`,`dokumenUrl`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`keterangan`,`createdAt`,`updatedAt`"

// requiredNumberParam mirrors parseRequiredNumberParam (HTTP 400).
func requiredNumberParam(c *Ctx, name string) (int64, error) {
	raw := c.param(name)
	f := jsStringToNumber(raw)
	if raw == "" || math.IsNaN(f) {
		return 0, httpError(http.StatusBadRequest, "Parameter "+name+" tidak valid.")
	}
	if f != math.Trunc(f) || math.IsInf(f, 0) || math.Abs(f) > math.MaxInt32 {
		return 0, invalidArgument(name, jsNumber(f))
	}
	return int64(f), nil
}

func (s *Server) listLaporan(c *Ctx) error {
	proposalID, err := requiredNumberParam(c, "proposalId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if _, err := s.proposalOrP2025(ctx, proposalID); err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessRead); err != nil {
		return err
	}
	items, err := queryObjs(ctx, s.db, "SELECT "+laporanListColumns+" FROM `LaporanProposal` WHERE `proposalId` = ? ORDER BY `createdAt` DESC", proposalID)
	if err != nil {
		return err
	}
	return c.ok("Laporan fetched", items)
}

// bodyStringArg returns a body field as a SQL argument the way Prisma would
// accept it for a String column (undefined → not set, null → NULL).
func bodyStringArg(body map[string]any, key string, required bool) (any, bool, error) {
	v, ok := body[key]
	if !ok {
		if required {
			return nil, false, plainError("Argument `" + key + "` is missing.")
		}
		return nil, false, nil
	}
	switch val := v.(type) {
	case string:
		return val, true, nil
	case nil:
		if required {
			return nil, false, plainError("Argument `" + key + "` must not be null.")
		}
		return nil, true, nil
	}
	return nil, false, plainError(fmt.Sprintf("Invalid value for argument `%s`: Expected String.", key))
}

func truthy(v any) bool {
	switch val := v.(type) {
	case nil:
		return false
	case string:
		return val != ""
	case bool:
		return val
	case float64:
		return val != 0 && !math.IsNaN(val)
	}
	return true
}

func (s *Server) createLaporan(c *Ctx) error {
	proposalID, err := requiredNumberParam(c, "proposalId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	body := c.bodyMap()
	proposal, err := s.proposalOrP2025(ctx, proposalID)
	if err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessWrite); err != nil {
		return err
	}
	if proposal.Status != "disetujui" {
		return plainError("Laporan hanya bisa diunggah untuk proposal yang sudah disetujui")
	}
	if c.file == nil && !truthy(body["dokumenUrl"]) {
		return plainError("File atau URL dokumen wajib diisi.")
	}
	var verified any
	if c.file != nil {
		mt, err := validateFileIsAllowedDocument(c.file.data)
		if err != nil {
			return err
		}
		verified = mt
	}
	jenis, _, err := bodyStringArg(body, "jenis", true)
	if err != nil {
		return err
	}
	judul, _, err := bodyStringArg(body, "judul", true)
	if err != nil {
		return err
	}
	keterangan, _, err := bodyStringArg(body, "keterangan", false)
	if err != nil {
		return err
	}
	var dokumenURL, blob, nama, ukuran any
	if c.file != nil {
		blob, nama, ukuran = c.file.data, c.file.originalname, c.file.size
	} else {
		dokumenURL, _, err = bodyStringArg(body, "dokumenUrl", false)
		if err != nil {
			return err
		}
	}
	now := s.nowMs()
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO `LaporanProposal` (`proposalId`,`jenis`,`judul`,`dokumenUrl`,`dokumenBlob`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`keterangan`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
		proposalID, jenis, judul, dokumenURL, blob, nama, verified, ukuran, keterangan, now, now)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	laporan, err := queryObj(ctx, s.db, "SELECT "+laporanListColumns+" FROM `LaporanProposal` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	jenisText := fmt.Sprint(jenis)
	if err := s.createNotification(ctx, s.db, notification{
		UserID: proposal.PengusulID, Type: "laporan_diunggah", Judul: "Laporan Diunggah",
		Pesan: "Laporan " + jenisText + ` untuk "` + proposal.Judul + `" telah diunggah`,
		RefID: proposalID, RefType: "proposal",
	}); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "laporan.upload", EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
		Detail: "Laporan " + jenisText + " diunggah",
	}); err != nil {
		return err
	}
	return c.created("Laporan diunggah", laporan)
}

// laporanOrP2025 mirrors findUniqueOrThrow on LaporanProposal.
func (s *Server) laporanProposalID(ctx context.Context, id int64) (int64, error) {
	var proposalID int64
	err := s.db.QueryRowContext(ctx, "SELECT `proposalId` FROM `LaporanProposal` WHERE `id` = ?", id).Scan(&proposalID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, notFoundRecord("LaporanProposal")
	}
	return proposalID, err
}

func (s *Server) downloadLaporan(c *Ctx) error {
	id, err := requiredNumberParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	proposalID, err := s.laporanProposalID(ctx, id)
	if err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessRead); err != nil {
		return err
	}
	var f storedFile
	if err := s.db.QueryRowContext(ctx, "SELECT `dokumenBlob`,`dokumenMime`,`dokumenNama`,`dokumenUkuran` FROM `LaporanProposal` WHERE `id` = ?", id).
		Scan(&f.blob, &f.mime, &f.name, &f.size); err != nil {
		return err
	}
	if f.blob == nil {
		return c.fail(http.StatusNotFound, "File laporan tidak ditemukan.")
	}
	name := f.name.String
	if name == "" {
		name = "laporan"
	}
	return c.sendFile(f.blob, f.mime.String, name, f.length())
}

func (s *Server) updateLaporan(c *Ctx) error {
	id, err := requiredNumberParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	proposalID, err := s.laporanProposalID(ctx, id)
	if err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessWrite); err != nil {
		return err
	}
	body := c.bodyMap()
	cols := []string{}
	args := []any{}
	for _, field := range []string{"jenis", "judul", "dokumenUrl", "keterangan"} {
		if v, ok := body[field]; ok {
			cols = append(cols, field)
			args = append(args, v)
		}
	}
	cols = append(cols, "updatedAt")
	args = append(args, s.nowMs(), id)
	if _, err := s.db.ExecContext(ctx, sqlb.UpdateByID("LaporanProposal", cols), args...); err != nil {
		return err
	}
	laporan, err := queryObj(ctx, s.db, "SELECT "+laporanColumns+" FROM `LaporanProposal` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	return c.ok("Laporan updated", laporan)
}

func (s *Server) deleteLaporan(c *Ctx) error {
	id, err := requiredNumberParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	proposalID, err := s.laporanProposalID(ctx, id)
	if err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessWrite); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, "DELETE FROM `LaporanProposal` WHERE `id` = ?", id); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "laporan.delete", EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
	}); err != nil {
		return err
	}
	return c.ok("Laporan deleted", noData)
}

// ── Dokumen lampiran ──────────────────────────────────────────────────────

const dokumenListColumns = "`id`,`proposalId`,`namaFile`,`fileUrl`,`ukuran`,`fileMime`,`fileNama`,`createdAt`"

func (s *Server) listDokumen(c *Ctx) error {
	proposalID, err := proposalIDParam(c, "proposalId")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	if _, err := s.proposalOrP2025(ctx, proposalID); err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessRead); err != nil {
		return err
	}
	items, err := queryObjs(ctx, s.db, "SELECT "+dokumenListColumns+" FROM `DokumenLampiran` WHERE `proposalId` = ? ORDER BY `createdAt` DESC", proposalID)
	if err != nil {
		return err
	}
	return c.ok("Dokumen fetched", items)
}

func (s *Server) createDokumen(c *Ctx) error {
	proposalID, err := proposalIDParam(c, "proposalId")
	if err != nil {
		return err
	}
	body := c.bodyMap()
	// buildCreateDokumenPayload: ukuran = req.body.ukuran ? Number(...) : undefined
	payload := map[string]any{}
	if v, ok := body["namaFile"]; ok {
		payload["namaFile"] = v
	}
	if v, ok := body["fileUrl"]; ok {
		payload["fileUrl"] = v
	}
	if truthy(body["ukuran"]) {
		payload["ukuran"] = jsToNumber(body["ukuran"])
	}
	ctx := c.r.Context()
	if _, err := s.proposalOrP2025(ctx, proposalID); err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessWrite); err != nil {
		return err
	}
	// createDokumenSchema (namaFile min 1, fileUrl min 1 optional, ukuran
	// int ≥ 0 optional) + superRefine "file atau URL".
	var issues []zIssue
	schema := zObj(
		required("namaFile", zStr().Min(1, "Nama file wajib diisi.")),
		optional("fileUrl", zStr().Min(1, "")),
		optional("ukuran", zNum().Int().NonNegative()),
	)
	out, status := schema.parse(payload, true, nil, &issues)
	if status != zAborted && c.file == nil && !truthy(out.(map[string]any)["fileUrl"]) {
		issues = append(issues, zIssue{code: "custom", path: []any{"file"}, message: "File atau URL dokumen wajib diisi."})
	}
	if len(issues) > 0 {
		return zodError(issues)
	}
	data := out.(map[string]any)
	namaFile := data["namaFile"].(string)
	var fileURL, ukuran, blob, mimeType, fileNama any
	if c.file != nil {
		mt, err := validateFileIsAllowedDocument(c.file.data)
		if err != nil {
			return err
		}
		ukuran, blob, mimeType, fileNama = c.file.size, c.file.data, mt, c.file.originalname
	} else {
		fileURL = data["fileUrl"]
		if u, ok := data["ukuran"].(float64); ok {
			ukuran = int64(u)
		}
	}
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO `DokumenLampiran` (`proposalId`,`namaFile`,`fileUrl`,`ukuran`,`fileBlob`,`fileMime`,`fileNama`,`createdAt`) VALUES (?,?,?,?,?,?,?,?)",
		proposalID, namaFile, fileURL, ukuran, blob, mimeType, fileNama, s.nowMs())
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	dokumen, err := queryObj(ctx, s.db, "SELECT "+dokumenListColumns+" FROM `DokumenLampiran` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "dokumen.upload", EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
		Detail: `Dokumen "` + namaFile + `" diunggah`,
	}); err != nil {
		return err
	}
	return c.created("Dokumen uploaded", dokumen)
}

func (s *Server) dokumenRow(ctx context.Context, id int64) (int64, string, error) {
	var proposalID int64
	var nama string
	err := s.db.QueryRowContext(ctx, "SELECT `proposalId`,`namaFile` FROM `DokumenLampiran` WHERE `id` = ?", id).Scan(&proposalID, &nama)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", notFoundRecord("DokumenLampiran")
	}
	return proposalID, nama, err
}

func (s *Server) downloadDokumen(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	proposalID, namaFile, err := s.dokumenRow(ctx, id)
	if err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessRead); err != nil {
		return err
	}
	var f storedFile
	if err := s.db.QueryRowContext(ctx, "SELECT `fileBlob`,`fileMime`,`fileNama`,`ukuran` FROM `DokumenLampiran` WHERE `id` = ?", id).
		Scan(&f.blob, &f.mime, &f.name, &f.size); err != nil {
		return err
	}
	if f.blob == nil {
		return c.fail(http.StatusNotFound, "File dokumen tidak ditemukan.")
	}
	name := f.name.String
	if name == "" {
		name = namaFile
	}
	return c.sendFile(f.blob, f.mime.String, name, f.length())
}

func (s *Server) deleteDokumen(c *Ctx) error {
	id, err := proposalIDParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	proposalID, namaFile, err := s.dokumenRow(ctx, id)
	if err != nil {
		return err
	}
	if err := s.ensureProposalAccess(ctx, proposalID, c.user, accessWrite); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, "DELETE FROM `DokumenLampiran` WHERE `id` = ?", id); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "dokumen.delete", EntityType: "proposal", EntityID: proposalID, ProposalID: proposalID,
		Detail: `Dokumen "` + namaFile + `" dihapus`,
	}); err != nil {
		return err
	}
	return c.ok("Dokumen deleted", noData)
}
