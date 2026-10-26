package httpapi

import (
	"strings"
)

// Pemantauan proposal untuk Ketua STMIK (juga admin & Ketua LPPM), hanya baca. Tidak ada
// padanannya di Node: endpoint baru, dokumentasi untuk frontend di new-api.md bagian 24.
//   - GET /monitoring/ringkasan  jumlah proposal per status & jenis, total anggaran, jumlah dosen
//   - GET /monitoring/proposals  daftar proposal: pengusul, status/tahapan, anggaran, laporan
//   - GET /monitoring/dosen      dosen yang sudah memasukkan proposal + rekap status & anggaran
// Bawaan hanya proposal yang sudah diajukan (bukan draft); ?termasukDraft=true ikut draft.

var monitoringFilterFields = []zField{
	optional("periodeId", zNum().Coerce().Int().Positive()),
	optional("tahun", zNum().Coerce().Int().Min(2000)),
	optional("jenis", zEnumOf(jenisKegiatan...)),
	optional("search", zStr().Trim()),
	optional("termasukDraft", zEnumOf("true", "false")),
}

var (
	monitoringRingkasanSchema = zObj(monitoringFilterFields...)
	monitoringProposalSchema  = zObj(append(append([]zField{}, monitoringFilterFields...),
		optional("status", zEnumOf(proposalStatuses...)),
		optional("urut", zEnumOf("terbaru", "anggaran", "judul", "pengusul")),
		withDefault("page", zNum().Coerce().Int().Min(1), float64(1)),
		withDefault("limit", zNum().Coerce().Int().Min(1).Max(100), float64(20)),
	)...)
	monitoringDosenSchema = zObj(append(append([]zField{}, monitoringFilterFields...),
		withDefault("page", zNum().Coerce().Int().Min(1), float64(1)),
		withDefault("limit", zNum().Coerce().Int().Min(1).Max(100), float64(20)),
	)...)
)

func (s *Server) registerMonitoringRoutes() {
	g := s.group("/api/v1/monitoring", s.authenticate, authorize("ketua_stmik", "ketua_lppm", "admin"))
	g.get("/ringkasan", s.validateQuery(monitoringRingkasanSchema), s.monitoringRingkasan)
	g.get("/proposals", s.validateQuery(monitoringProposalSchema), s.monitoringProposals)
	g.get("/dosen", s.validateQuery(monitoringDosenSchema), s.monitoringDosen)
}

const monitoringFrom = " FROM `Proposal` p JOIN `User` u ON u.`id` = p.`pengusulId` LEFT JOIN `Periode` pe ON pe.`id` = p.`periodeId`"

// monitoringWhere builds the shared filter (q = validated query).
func monitoringWhere(q map[string]any, withStatus bool) (string, []any) {
	where := []string{}
	args := []any{}
	if v, ok := q["termasukDraft"].(string); !ok || v != "true" {
		where = append(where, "p.`status` <> 'draft'")
	}
	if v, ok := q["periodeId"].(float64); ok {
		where = append(where, "p.`periodeId` = ?")
		args = append(args, int64(v))
	}
	if v, ok := q["tahun"].(float64); ok {
		where = append(where, "pe.`tahun` = ?")
		args = append(args, int64(v))
	}
	if v, ok := q["jenis"].(string); ok {
		where = append(where, "p.`jenis` = ?")
		args = append(args, v)
	}
	if v, ok := q["status"].(string); ok && withStatus {
		where = append(where, "p.`status` = ?")
		args = append(args, v)
	}
	if v, ok := q["search"].(string); ok && v != "" {
		like := "%" + v + "%"
		where = append(where, "(p.`judul` LIKE ? OR u.`name` LIKE ? OR u.`fullName` LIKE ? OR u.`nidn` LIKE ?)")
		args = append(args, like, like, like, like)
	}
	if len(where) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(where, " AND "), args
}

var monitoringStatuses = []string{"draft", "diajukan", "review", "revisi", "disetujui", "ditolak"}

// statusCountCols: COUNT per status, aliased `s_<status>`.
func statusCountCols() string {
	cols := make([]string, len(monitoringStatuses))
	for i, st := range monitoringStatuses {
		cols[i] = "COUNT(CASE WHEN p.`status` = '" + st + "' THEN 1 END) AS `s_" + st + "`"
	}
	return strings.Join(cols, ",")
}

func perStatusObj(row O, includeDraft bool) O {
	out := O{}
	for _, st := range monitoringStatuses {
		if st == "draft" && !includeDraft {
			continue
		}
		out = append(out, KV{st, row.Get("s_" + st)})
	}
	return out
}

func decimalOrZero(v any) any {
	if v == nil {
		return Decimal("0")
	}
	return v
}

func (s *Server) monitoringRingkasan(c *Ctx) error {
	q := c.validatedQuery
	ctx := c.r.Context()
	cond, args := monitoringWhere(q, false)
	includeDraft := q["termasukDraft"] == "true"
	row, err := queryObj(ctx, s.db,
		"SELECT COUNT(*) AS `jumlah`, COUNT(DISTINCT p.`pengusulId`) AS `dosen`, SUM(p.`anggaran`) AS `total`,"+
			" SUM(CASE WHEN p.`status` = 'disetujui' THEN p.`anggaran` END) AS `disetujui`,"+statusCountCols()+monitoringFrom+cond, args...)
	if err != nil {
		return err
	}
	jenisRows, err := queryObjs(ctx, s.db,
		"SELECT p.`jenis`, COUNT(*) AS `jumlah`, SUM(p.`anggaran`) AS `total`, SUM(CASE WHEN p.`status` = 'disetujui' THEN p.`anggaran` END) AS `disetujui`"+
			monitoringFrom+cond+" GROUP BY p.`jenis`", args...)
	if err != nil {
		return err
	}
	perJenis := O{}
	for _, j := range jenisKegiatan {
		entry := O{{"jumlah", int64(0)}, {"totalAnggaran", Decimal("0")}, {"anggaranDisetujui", Decimal("0")}}
		for _, r := range jenisRows {
			if r.Str("jenis") == j {
				entry = O{{"jumlah", r.Get("jumlah")}, {"totalAnggaran", decimalOrZero(r.Get("total"))}, {"anggaranDisetujui", decimalOrZero(r.Get("disetujui"))}}
			}
		}
		perJenis = append(perJenis, KV{j, entry})
	}
	return c.ok("Ringkasan pemantauan fetched", O{
		{"jumlahProposal", row.Get("jumlah")},
		{"jumlahDosenPengusul", row.Get("dosen")},
		{"totalAnggaran", decimalOrZero(row.Get("total"))},
		{"anggaranDisetujui", decimalOrZero(row.Get("disetujui"))},
		{"perStatus", perStatusObj(row, includeDraft)},
		{"perJenis", perJenis},
	})
}

func (s *Server) monitoringProposals(c *Ctx) error {
	q := c.validatedQuery
	ctx := c.r.Context()
	page, limit := q["page"].(float64), q["limit"].(float64)
	cond, args := monitoringWhere(q, true)
	total, err := countRows(ctx, s.db, "SELECT COUNT(*)"+monitoringFrom+cond, args...)
	if err != nil {
		return err
	}
	order := "COALESCE(p.`submittedAt`, p.`createdAt`) DESC, p.`id` DESC"
	switch q["urut"] {
	case "anggaran":
		order = "p.`anggaran` IS NULL, p.`anggaran` DESC, p.`id` DESC"
	case "judul":
		order = "p.`judul` ASC, p.`id` ASC"
	case "pengusul":
		order = "COALESCE(u.`fullName`, u.`name`) ASC, p.`id` DESC"
	}
	rows, err := queryObjs(ctx, s.db,
		"SELECT p.`id`,p.`judul`,p.`jenis`,p.`status`,p.`anggaran`,p.`submittedAt`,p.`approvedAt`,p.`createdAt`,p.`updatedAt`,"+
			"u.`id` AS `u_id`,u.`name` AS `u_name`,u.`fullName` AS `u_fullName`,u.`nidn` AS `u_nidn`,u.`programStudi` AS `u_programStudi`,"+
			"pe.`id` AS `pe_id`,pe.`nama` AS `pe_nama`,pe.`tahun` AS `pe_tahun`,"+
			"l.`id` AS `l_id`,l.`status` AS `l_status`,l.`realisasiAnggaran` AS `l_realisasiAnggaran`,"+
			"(SELECT COUNT(*) FROM `ProposalAnggota` a WHERE a.`proposalId` = p.`id` AND a.`statusUndangan` = 'diterima') AS `jumlahAnggota`"+
			monitoringFrom+" LEFT JOIN `Laporan` l ON l.`proposalId` = p.`id`"+cond+" ORDER BY "+order+" LIMIT ? OFFSET ?",
		append(args, int64(limit), int64((page-1)*limit))...)
	if err != nil {
		return err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		lapStatus, _ := r.Get("l_status").(string)
		idx := tahapanIndex(r.Str("status"), lapStatus)
		t := tahapanList[idx]
		var laporan any
		if r.Get("l_id") != nil {
			laporan = O{{"id", r.Get("l_id")}, {"status", lapStatus}, {"realisasiAnggaran", r.Get("l_realisasiAnggaran")}}
		}
		var periode any
		if r.Get("pe_id") != nil {
			periode = O{{"id", r.Get("pe_id")}, {"nama", r.Get("pe_nama")}, {"tahun", r.Get("pe_tahun")}}
		}
		items[i] = O{
			{"id", r.Get("id")},
			{"judul", r.Get("judul")},
			{"jenis", r.Get("jenis")},
			{"status", r.Get("status")},
			{"tahapan", O{{"kode", t.kode}, {"label", t.label}, {"urutan", int64(idx + 1)}}},
			{"anggaran", r.Get("anggaran")},
			{"submittedAt", r.Get("submittedAt")},
			{"approvedAt", r.Get("approvedAt")},
			{"createdAt", r.Get("createdAt")},
			{"updatedAt", r.Get("updatedAt")},
			{"pengusul", O{{"id", r.Get("u_id")}, {"name", r.Get("u_name")}, {"fullName", r.Get("u_fullName")}, {"nidn", r.Get("u_nidn")}, {"programStudi", r.Get("u_programStudi")}}},
			{"periode", periode},
			{"jumlahAnggota", r.Get("jumlahAnggota")},
			{"laporan", laporan},
		}
	}
	return c.okMeta("Proposal pemantauan fetched", items, page, limit, total)
}

func (s *Server) monitoringDosen(c *Ctx) error {
	q := c.validatedQuery
	ctx := c.r.Context()
	page, limit := q["page"].(float64), q["limit"].(float64)
	cond, args := monitoringWhere(q, false)
	includeDraft := q["termasukDraft"] == "true"
	total, err := countRows(ctx, s.db, "SELECT COUNT(DISTINCT p.`pengusulId`)"+monitoringFrom+cond, args...)
	if err != nil {
		return err
	}
	rows, err := queryObjs(ctx, s.db,
		"SELECT u.`id` AS `u_id`,u.`name` AS `u_name`,u.`fullName` AS `u_fullName`,u.`email` AS `u_email`,u.`nidn` AS `u_nidn`,u.`programStudi` AS `u_programStudi`,u.`jabatanFungsional` AS `u_jabatanFungsional`,"+
			"COUNT(*) AS `jumlah`, COUNT(CASE WHEN p.`jenis` = 'penelitian' THEN 1 END) AS `penelitian`, COUNT(CASE WHEN p.`jenis` = 'pengabdian' THEN 1 END) AS `pengabdian`,"+
			"SUM(p.`anggaran`) AS `total`, SUM(CASE WHEN p.`status` = 'disetujui' THEN p.`anggaran` END) AS `disetujui`, MAX(p.`submittedAt`) AS `terakhir`,"+statusCountCols()+
			monitoringFrom+cond+" GROUP BY u.`id`,u.`name`,u.`fullName`,u.`email`,u.`nidn`,u.`programStudi`,u.`jabatanFungsional`"+
			" ORDER BY `jumlah` DESC, COALESCE(u.`fullName`, u.`name`) ASC LIMIT ? OFFSET ?",
		append(args, int64(limit), int64((page-1)*limit))...)
	if err != nil {
		return err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		items[i] = O{
			{"dosen", O{{"id", r.Get("u_id")}, {"name", r.Get("u_name")}, {"fullName", r.Get("u_fullName")}, {"email", r.Get("u_email")},
				{"nidn", r.Get("u_nidn")}, {"programStudi", r.Get("u_programStudi")}, {"jabatanFungsional", r.Get("u_jabatanFungsional")}}},
			{"jumlahProposal", r.Get("jumlah")},
			{"perJenis", O{{"penelitian", r.Get("penelitian")}, {"pengabdian", r.Get("pengabdian")}}},
			{"perStatus", perStatusObj(r, includeDraft)},
			{"totalAnggaran", decimalOrZero(r.Get("total"))},
			{"anggaranDisetujui", decimalOrZero(r.Get("disetujui"))},
			{"terakhirDiajukanAt", r.Get("terakhir")},
		}
	}
	return c.okMeta("Dosen pengusul fetched", items, page, limit, total)
}
