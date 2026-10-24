package httpapi

import (
	"net/http"
	"strings"
)

// Master data pilihan formulir (W-22 rumpun ilmu & bidang, W-25 jenis luaran,
// W-26 jenis mitra).
// Tidak ada padanannya di Node; dokumentasi untuk frontend di new-api.md
// bagian 13. GET untuk semua user login, tulis hanya admin. Nilai yang
// dipilih disimpan sebagai teks di proposal (tidak ber-FK ke master).

const masterColumns = "`id`,`nama`,`jenisKegiatan`,`jenisLuaran`,`urutan`,`isAktif`,`createdAt`,`updatedAt`"

// masterKategori maps the URL segment to MasterData.kategori.
var masterKategori = map[string]string{
	"rumpun-ilmu": "rumpun_ilmu",
	"bidang":      "bidang",
	"luaran":      "luaran",
	"jenis-mitra": "jenis_mitra",
}

var (
	createMasterSchema = zObj(
		required("nama", zStr().Trim().Min(2, "Nama minimal 2 karakter")),
		optional("jenisKegiatan", zNullable{zEnumOf(jenisKegiatan...)}),
		optional("jenisLuaran", zNullable{zEnumOf(luaranJenis...)}),
		optional("urutan", zNum().Int().NonNegative()),
		optional("isAktif", zBoolean{}),
	)
	updateMasterSchema = createMasterSchema.partial()
)

func (s *Server) registerMasterRoutes() {
	g := s.group("/api/v1/master", s.authenticate)
	g.get("/:kategori", s.listMaster)
	g.post("/:kategori", authorize("admin"), validateBody(createMasterSchema), s.createMaster)
	g.patch("/:kategori/:id", authorize("admin"), validateBody(updateMasterSchema), s.updateMaster)
	g.delete("/:kategori/:id", authorize("admin"), s.deleteMaster)
}

func masterKategoriParam(c *Ctx) (string, error) {
	k, ok := masterKategori[strings.ToLower(c.param("kategori"))]
	if !ok {
		return "", httpError(http.StatusNotFound, "Master data tidak dikenal. Pilihan: rumpun-ilmu, bidang, luaran, jenis-mitra")
	}
	return k, nil
}

// listMaster returns active items ordered by urutan, nama. ?jenis= keeps the
// items for that jenis kegiatan plus the ones valid for both;
// ?semua=true also returns inactive items (halaman kelola admin).
func (s *Server) listMaster(c *Ctx) error {
	kategori, err := masterKategoriParam(c)
	if err != nil {
		return err
	}
	where := "WHERE `kategori` = ?"
	args := []any{kategori}
	if v, _ := c.queryValue("semua"); v != "true" {
		where += " AND `isAktif` = true"
	}
	if jenis, ok := c.queryValue("jenis"); ok && jenis != "" {
		if !validEnum(jenis, jenisKegiatan) {
			return httpError(http.StatusBadRequest, "Parameter jenis harus penelitian atau pengabdian")
		}
		where += " AND (`jenisKegiatan` IS NULL OR `jenisKegiatan` = ?)"
		args = append(args, jenis)
	}
	items, err := queryObjs(c.r.Context(), s.db, "SELECT "+masterColumns+" FROM `MasterData` "+where+" ORDER BY `urutan` ASC, `nama` ASC", args...)
	if err != nil {
		return err
	}
	return c.ok("Master data fetched", items)
}

func (s *Server) masterByID(c *Ctx, kategori string) (int64, O, error) {
	id, err := idParam(c, "id")
	if err != nil {
		return 0, nil, err
	}
	item, err := queryObj(c.r.Context(), s.db, "SELECT "+masterColumns+" FROM `MasterData` WHERE `id` = ? AND `kategori` = ?", id, kategori)
	if err != nil {
		return 0, nil, err
	}
	if item == nil {
		return 0, nil, httpError(http.StatusNotFound, "Master data tidak ditemukan")
	}
	return id, item, nil
}

// masterValues maps the validated body to columns. jenisLuaran is only
// meaningful for kategori luaran.
func masterValues(body map[string]any, kategori string) ([]string, []any, error) {
	if v, ok := body["jenisLuaran"]; ok && v != nil && kategori != "luaran" {
		return nil, nil, httpError(http.StatusBadRequest, "jenisLuaran hanya untuk master luaran")
	}
	cols := []string{}
	args := []any{}
	for _, field := range []string{"nama", "jenisKegiatan", "jenisLuaran", "urutan", "isAktif"} {
		if v, ok := body[field]; ok {
			cols = append(cols, field)
			args = append(args, v)
		}
	}
	return cols, args, nil
}

func (s *Server) createMaster(c *Ctx) error {
	kategori, err := masterKategoriParam(c)
	if err != nil {
		return err
	}
	cols, args, err := masterValues(c.bodyMap(), kategori)
	if err != nil {
		return err
	}
	now := s.nowMs()
	cols = append(cols, "kategori", "createdAt", "updatedAt")
	args = append(args, kategori, now, now)
	quoted := make([]string, len(cols))
	for i, col := range cols {
		quoted[i] = "`" + col + "`"
	}
	// Nama duplikat dalam kategori yang sama → 409 "Resource already exists".
	res, err := s.db.ExecContext(c.r.Context(), "INSERT INTO `MasterData` ("+strings.Join(quoted, ",")+") VALUES ("+placeholders(len(cols))+")", args...)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	item, err := queryObj(c.r.Context(), s.db, "SELECT "+masterColumns+" FROM `MasterData` WHERE `id` = ?", id)
	if err != nil {
		return err
	}
	return c.created("Master data berhasil dibuat", item)
}

func (s *Server) updateMaster(c *Ctx) error {
	kategori, err := masterKategoriParam(c)
	if err != nil {
		return err
	}
	id, _, err := s.masterByID(c, kategori)
	if err != nil {
		return err
	}
	cols, args, err := masterValues(c.bodyMap(), kategori)
	if err != nil {
		return err
	}
	sets := make([]string, 0, len(cols)+1)
	for _, col := range cols {
		sets = append(sets, "`"+col+"` = ?")
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, s.nowMs(), id)
	if _, err := s.db.ExecContext(c.r.Context(), "UPDATE `MasterData` SET "+strings.Join(sets, ", ")+" WHERE `id` = ?", args...); err != nil {
		return err
	}
	_, item, err := s.masterByID(c, kategori)
	if err != nil {
		return err
	}
	return c.ok("Master data berhasil diperbarui", item)
}

func (s *Server) deleteMaster(c *Ctx) error {
	kategori, err := masterKategoriParam(c)
	if err != nil {
		return err
	}
	id, _, err := s.masterByID(c, kategori)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(c.r.Context(), "DELETE FROM `MasterData` WHERE `id` = ?", id); err != nil {
		return err
	}
	return c.ok("Master data berhasil dihapus", noData)
}
