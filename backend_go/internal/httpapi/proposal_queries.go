package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// proposalShape describes one of the Prisma `select` objects used for
// proposals so that a single loader can produce each response shape.
type proposalShape struct {
	scalars        []string // Proposal columns, in select order
	pengusulCols   []string
	periodeCols    []string
	anggotaStatus  bool // anggota.statusUndangan
	tugasanRevID   bool // reviewerTugasan.reviewerId
	tugasanRevMail bool // reviewerTugasan.reviewer.email
	detail         bool // + reviews, laporan, dokumenLampiran
	reviewFullName bool // reviews.reviewer.fullName
}

var (
	// proposal.service.ts → proposalSelect
	proposalListShape = proposalShape{
		scalars:      []string{"id", "tipe", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "skema", "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan", "rumpunIlmu", "bidang", "kataKunci", "catatanRevisi", "dokumenUrl", "dokumenNama", "dokumenMime", "dokumenUkuran", "submittedAt", "approvedAt", "createdAt", "updatedAt"},
		pengusulCols: []string{"id", "name", "fullName", "email", "programStudi", "nidn"},
		periodeCols:  []string{"id", "nama", "tahun"},
		tugasanRevID: true,
	}
	// proposal.service.ts → findById select
	proposalDetailShape = proposalShape{
		scalars:        proposalListShape.scalars,
		pengusulCols:   proposalListShape.pengusulCols,
		periodeCols:    proposalListShape.periodeCols,
		tugasanRevMail: true,
		detail:         true,
	}
	// Proposaldosen.service.ts → proposalDosenSelect
	proposalDosenShape = proposalShape{
		scalars:       []string{"id", "tipe", "judul", "abstrak", "jenis", "status", "anggaran", "luaran", "skema", "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan", "rumpunIlmu", "bidang", "kataKunci", "catatanRevisi", "dokumenUrl", "submittedAt", "approvedAt", "createdAt", "updatedAt"},
		pengusulCols:  []string{"id", "name", "fullName", "email", "nidn", "programStudi"},
		periodeCols:   []string{"id", "nama", "tahun", "jenis"},
		anggotaStatus: true,
	}
	// Proposaldosen.service.ts → proposalDosenDetailSelect
	proposalDosenDetailShape = proposalShape{
		scalars:        proposalDosenShape.scalars,
		pengusulCols:   proposalDosenShape.pengusulCols,
		periodeCols:    proposalDosenShape.periodeCols,
		anggotaStatus:  true,
		detail:         true,
		reviewFullName: true,
	}
)

const (
	laporanColumns = "`id`,`proposalId`,`jenis`,`judul`,`dokumenUrl`,`dokumenBlob`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`keterangan`,`createdAt`,`updatedAt`"
	dokumenColumns = "`id`,`proposalId`,`namaFile`,`fileUrl`,`ukuran`,`fileBlob`,`fileMime`,`fileNama`,`createdAt`"
	reviewColumns  = "`id`,`proposalId`,`reviewerId`,`nilaiRelevansi`,`nilaiMetodologi`,`nilaiAnggaran`,`nilaiLuaran`,`catatan`,`rekomendasi`,`isDone`,`createdAt`,`updatedAt`"
)

func prefixed(alias string, cols []string, as string) string {
	parts := make([]string, len(cols))
	for i, c := range cols {
		parts[i] = alias + ".`" + c + "`"
		if as != "" {
			parts[i] += " AS `" + as + c + "`"
		}
	}
	return strings.Join(parts, ",")
}

// loadProposals runs `SELECT <shape> FROM Proposal p <tail>` and loads the
// relations the shape needs, like Prisma does with separate queries.
func (s *Server) loadProposals(ctx context.Context, q dbtx, shape proposalShape, tail string, args ...any) ([]O, error) {
	items, err := queryObjs(ctx, q,
		"SELECT "+prefixed("p", shape.scalars, "")+", p.`pengusulId` AS `__pengusulId`, p.`periodeId` AS `__periodeId` FROM `Proposal` p "+tail,
		args...)
	if err != nil || len(items) == 0 {
		return items, err
	}
	decodeKataKunci(items)
	if err := attachTahapan(ctx, q, items); err != nil {
		return nil, err
	}
	if err := attachOne(ctx, q, items, "__pengusulId", "pengusul",
		"SELECT `id` AS `__k`,"+prefixed("u", shape.pengusulCols, "")+" FROM `User` u WHERE u.`id` IN (%s)"); err != nil {
		return nil, err
	}
	if err := attachOne(ctx, q, items, "__periodeId", "periode",
		"SELECT `id` AS `__k`,"+prefixed("pe", shape.periodeCols, "")+" FROM `Periode` pe WHERE pe.`id` IN (%s)"); err != nil {
		return nil, err
	}

	anggotaCols := "a.`id`,a.`peran`"
	if shape.anggotaStatus {
		anggotaCols += ",a.`statusUndangan`"
	}
	grouped, err := attachMany(ctx, q, items, "id", "anggota",
		"SELECT a.`proposalId` AS `__k`,"+anggotaCols+",u.`id` AS `u_id`,u.`name` AS `u_name`,u.`fullName` AS `u_fullName`,u.`email` AS `u_email`,u.`kontak` AS `u_kontak`,u.`noHp` AS `u_noHp` "+
			"FROM `ProposalAnggota` a JOIN `User` u ON u.`id` = a.`userId` WHERE a.`proposalId` IN (%s) ORDER BY a.`id` ASC")
	if err != nil {
		return nil, err
	}
	for _, list := range grouped {
		nestColumns(list, "u_", "user")
	}

	tugasanCols := "t.`id`"
	if shape.tugasanRevID {
		tugasanCols += ",t.`reviewerId`"
	}
	reviewerCols := "u.`id` AS `r_id`,u.`name` AS `r_name`,u.`fullName` AS `r_fullName`"
	if shape.tugasanRevMail {
		reviewerCols += ",u.`email` AS `r_email`"
	}
	grouped, err = attachMany(ctx, q, items, "id", "reviewerTugasan",
		"SELECT t.`proposalId` AS `__k`,"+tugasanCols+","+reviewerCols+",t.`createdAt` "+
			"FROM `ReviewerTugasan` t JOIN `User` u ON u.`id` = t.`reviewerId` WHERE t.`proposalId` IN (%s) ORDER BY t.`id` ASC")
	if err != nil {
		return nil, err
	}
	for _, list := range grouped {
		nestColumns(list, "r_", "reviewer")
	}

	if shape.detail {
		reviewer := "u.`id` AS `r_id`,u.`name` AS `r_name`"
		if shape.reviewFullName {
			reviewer += ",u.`fullName` AS `r_fullName`"
		}
		grouped, err = attachMany(ctx, q, items, "id", "reviews",
			"SELECT rv.`proposalId` AS `__k`,rv.`id`,rv.`nilaiRelevansi`,rv.`nilaiMetodologi`,rv.`nilaiAnggaran`,rv.`nilaiLuaran`,rv.`catatan`,rv.`rekomendasi`,rv.`isDone`,"+
				reviewer+",rv.`createdAt` FROM `ProposalReview` rv JOIN `User` u ON u.`id` = rv.`reviewerId` WHERE rv.`proposalId` IN (%s) ORDER BY rv.`id` ASC")
		if err != nil {
			return nil, err
		}
		for _, list := range grouped {
			nestColumns(list, "r_", "reviewer")
		}
		if _, err := attachMany(ctx, q, items, "id", "laporan",
			"SELECT `proposalId` AS `__k`,"+laporanColumns+" FROM `LaporanProposal` WHERE `proposalId` IN (%s) ORDER BY `id` ASC"); err != nil {
			return nil, err
		}
		if _, err := attachMany(ctx, q, items, "id", "dokumenLampiran",
			"SELECT `proposalId` AS `__k`,"+dokumenColumns+" FROM `DokumenLampiran` WHERE `proposalId` IN (%s) ORDER BY `id` ASC"); err != nil {
			return nil, err
		}
	}
	stripInternal(items)
	return items, nil
}

// tahapanList: 4 tahap resmi kegiatan (W-03/W-13), urutan 1–4.
var tahapanList = []struct{ kode, label string }{
	{"seleksi_usulan", "Seleksi/Usulan"},
	{"pelaksanaan", "Pelaksanaan Kegiatan"},
	{"seleksi_lanjutan", "Seleksi/Lanjutan"},
	{"pasca_pelaksanaan", "Pasca Pelaksanaan"},
}

// tahapanIndex derives the stage from the proposal status and its laporan
// status ("" when there is no laporan):
//
//	proposal belum disetujui                    → Seleksi/Usulan
//	disetujui, laporan belum ada / draft        → Pelaksanaan Kegiatan
//	laporan diajukan / review / revisi / ditolak → Seleksi/Lanjutan
//	laporan disetujui                           → Pasca Pelaksanaan
func tahapanIndex(proposalStatus, laporanStatus string) int {
	switch {
	case proposalStatus != "disetujui":
		return 0
	case laporanStatus == "" || laporanStatus == "draft":
		return 1
	case laporanStatus == "disetujui":
		return 3
	}
	return 2
}

// attachTahapan adds `tahapan: {kode, label, urutan}` right after the scalar
// columns of each proposal (Go saja, W-03/W-13).
func attachTahapan(ctx context.Context, q dbtx, items []O) error {
	ids := uniqueIDs(items, "id")
	laporan := map[int64]string{}
	if len(ids) > 0 {
		rows, err := queryObjs(ctx, q, "SELECT `proposalId`,`status` FROM `Laporan` WHERE `proposalId` IN ("+placeholders(len(ids))+")", idArgs(ids)...)
		if err != nil {
			return err
		}
		for _, row := range rows {
			laporan[row.Int64("proposalId")] = row.Str("status")
		}
	}
	for i := range items {
		idx := tahapanIndex(items[i].Str("status"), laporan[items[i].Int64("id")])
		t := tahapanList[idx]
		items[i].Set("tahapan", O{{"kode", t.kode}, {"label", t.label}, {"urutan", int64(idx + 1)}})
	}
	return nil
}

func (s *Server) loadProposal(ctx context.Context, q dbtx, shape proposalShape, id int64) (O, error) {
	items, err := s.loadProposals(ctx, q, shape, "WHERE p.`id` = ?", id)
	if err != nil || len(items) == 0 {
		return nil, err
	}
	return items[0], nil
}

type proposalRow struct {
	ID         int64
	Judul      string
	Status     string
	Jenis      string
	PengusulID int64
}

// proposalByID mirrors prisma.proposal.findUnique({where:{id}}); nil when
// the proposal does not exist.
func (s *Server) proposalByID(ctx context.Context, q dbtx, id int64) (*proposalRow, error) {
	var p proposalRow
	err := q.QueryRowContext(ctx, "SELECT `id`,`judul`,`status`,`jenis`,`pengusulId` FROM `Proposal` WHERE `id` = ?", id).
		Scan(&p.ID, &p.Judul, &p.Status, &p.Jenis, &p.PengusulID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

const proposalNotFound = "Proposal tidak ditemukan"

// proposalOrThrow mirrors findUnique + `throw new Error("Proposal tidak ditemukan")`.
func (s *Server) proposalOrThrow(ctx context.Context, id int64) (*proposalRow, error) {
	p, err := s.proposalByID(ctx, s.db, id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, plainError(proposalNotFound)
	}
	return p, nil
}

// proposalOrP2025 mirrors findUniqueOrThrow (Prisma P2025 → HTTP 500).
func (s *Server) proposalOrP2025(ctx context.Context, id int64) (*proposalRow, error) {
	p, err := s.proposalByID(ctx, s.db, id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, notFoundRecord("Proposal")
	}
	return p, nil
}

const (
	accessRead  = "read"
	accessWrite = "write"
)

// ensureProposalAccess mirrors services/proposalAccess.ts.
func (s *Server) ensureProposalAccess(ctx context.Context, proposalID int64, user *tokenPayload, level string) error {
	if hasAnyRole(user.Roles, "admin", "ketua_lppm") {
		return nil
	}
	// Ketua STMIK memantau semua proposal, hanya baca.
	if level == accessRead && hasAnyRole(user.Roles, "ketua_stmik") {
		return nil
	}
	denied := httpError(http.StatusForbidden, "Anda tidak memiliki akses ke proposal ini")
	var pengusulID int64
	err := s.db.QueryRowContext(ctx, "SELECT `pengusulId` FROM `Proposal` WHERE `id` = ?", proposalID).Scan(&pengusulID)
	if errors.Is(err, sql.ErrNoRows) {
		return denied
	}
	if err != nil {
		return err
	}
	if pengusulID == user.UserID {
		return nil
	}
	var status string
	err = s.db.QueryRowContext(ctx, "SELECT `statusUndangan` FROM `ProposalAnggota` WHERE `proposalId` = ? AND `userId` = ?", proposalID, user.UserID).Scan(&status)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	// Anggota tim hanya baca: yang sudah menerima undangan, dan dosen yang masih diundang
	// (pending) agar bisa menilai proposal (termasuk file) sebelum menerima. Ubah/hapus/unggah
	// hanya ketua pengusul (beda dengan Node yang memberi anggota diterima akses tulis).
	if status == "diterima" || (status == "pending" && hasAnyRole(user.Roles, "dosen")) {
		if level == accessRead {
			return nil
		}
		return httpError(http.StatusForbidden, anggotaHanyaBaca)
	}
	if level == accessRead {
		n, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ReviewerTugasan` WHERE `proposalId` = ? AND `reviewerId` = ?", proposalID, user.UserID)
		if err != nil {
			return err
		}
		if n > 0 {
			return nil
		}
	}
	return denied
}

const anggotaHanyaBaca = "Anggota tim hanya dapat melihat proposal. Perubahan hanya bisa dilakukan oleh ketua pengusul."

// insertAnggota mirrors `anggota: { create: [...] }`.
func (s *Server) insertAnggota(ctx context.Context, tx dbtx, proposalID int64, anggota []any) error {
	now := s.nowMs()
	for _, raw := range anggota {
		m, _ := raw.(map[string]any)
		userID := int64(m["userId"].(float64))
		peran, _ := m["peran"].(string)
		var exists int64
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM `User` WHERE `id` = ?", userID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return plainError(fmt.Sprintf("No 'User' record(s) (needed to inline the relation on 'ProposalAnggota' record(s)) was found for a nested connect on one-to-many relation 'ProposalAnggotaToUser'. (userId: %d)", userID))
		}
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO `ProposalAnggota` (`proposalId`,`userId`,`peran`,`statusUndangan`,`createdAt`) VALUES (?,?,?,?,?)",
			proposalID, userID, peran, "pending", now); err != nil {
			return err
		}
	}
	return nil
}

// proposalWriteFields builds SET clauses for the validated proposal body.
func proposalWriteFields(body map[string]any) ([]string, []any) {
	cols := []string{}
	args := []any{}
	// jenis bukan kolom fisik: menentukan tabel Penelitian/Pengabdian.
	for _, field := range []string{"judul", "abstrak", "anggaran", "luaran", "skema", "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan", "rumpunIlmu", "bidang", "kataKunci", "periodeId", "dokumenUrl"} {
		v, ok := body[field]
		if !ok {
			continue
		}
		if field == "kataKunci" {
			v = encodeKataKunci(v)
		}
		if field == "periodeId" {
			v = int64(v.(float64))
		}
		cols = append(cols, field)
		args = append(args, v)
	}
	return cols, args
}

// mitraDetailFields: detail mitra (W-26), khusus tabel Pengabdian.
var mitraDetailFields = []string{"mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan"}

// checkJenisFields: `skema` hanya ada di tabel Penelitian (W-14), `mitra` dan
// detail mitra (W-15, W-26) hanya di tabel Pengabdian. Detail mitra bernilai
// null boleh dikirim untuk jenis lain (tidak mengubah apa pun).
func checkJenisFields(body map[string]any, jenis string) error {
	if _, ok := body["skema"]; ok && jenis != "penelitian" {
		return httpError(http.StatusBadRequest, "Skema hanya untuk proposal penelitian")
	}
	if _, ok := body["mitra"]; ok && jenis != "pengabdian" {
		return httpError(http.StatusBadRequest, "Mitra hanya untuk proposal pengabdian")
	}
	if jenis != "pengabdian" {
		for _, field := range mitraDetailFields {
			if v, ok := body[field]; ok {
				if v != nil {
					return httpError(http.StatusBadRequest, "Detail mitra hanya untuk proposal pengabdian")
				}
				delete(body, field)
			}
		}
	}
	return nil
}

func (s *Server) ensurePeriodeFK(ctx context.Context, q dbtx, body map[string]any) error {
	v, ok := body["periodeId"].(float64)
	if !ok {
		return nil
	}
	n, err := countRows(ctx, q, "SELECT COUNT(*) FROM `Periode` WHERE `id` = ?", int64(v))
	if err != nil {
		return err
	}
	if n == 0 {
		return plainError("Foreign key constraint violated on the constraint: `Proposal_periodeId_fkey`")
	}
	return nil
}
