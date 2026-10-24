package httpapi

import (
	"net/http"
	"strings"
)

// Master data program studi (W-19). Tidak ada padanannya di Node: endpoint
// baru, dokumentasi untuk frontend di new-api.md. GET bersifat publik agar
// bisa dipakai juga di form registrasi; tulis hanya admin.
// User.programStudi / User.prodi tetap teks bebas (tidak ber-FK ke tabel ini).

const programStudiColumns = "`id`,`nama`,`jenjang`,`isAktif`,`createdAt`,`updatedAt`"

var (
	createProgramStudiSchema = zObj(
		required("nama", zStr().Trim().Min(2, "Nama program studi minimal 2 karakter")),
		optional("jenjang", zStr().Trim()),
		optional("isAktif", zBoolean{}),
	)
	updateProgramStudiSchema = createProgramStudiSchema.partial()
)

func (s *Server) registerProgramStudiRoutes() {
	g := s.group("/api/v1/program-studi")
	g.get("/", s.listProgramStudi)
	g.post("/", s.authenticate, authorize("admin"), validateBody(createProgramStudiSchema), s.createProgramStudi)
	g.patch("/:id", s.authenticate, authorize("admin"), validateBody(updateProgramStudiSchema), s.updateProgramStudi)
	g.delete("/:id", s.authenticate, authorize("admin"), s.deleteProgramStudi)
}

// listProgramStudi returns active programs sorted by name; ?semua=true also
// returns inactive ones (untuk halaman kelola admin).
func (s *Server) listProgramStudi(c *Ctx) error {
	where := "WHERE `isAktif` = true "
	if v, _ := c.queryValue("semua"); v == "true" {
		where = ""
	}
	items, err := queryObjs(c.r.Context(), s.db, "SELECT "+programStudiColumns+" FROM `ProgramStudi` "+where+"ORDER BY `nama` ASC")
	if err != nil {
		return err
	}
	return c.ok("Program studi fetched", items)
}

func (s *Server) programStudiByID(c *Ctx, id int64) (O, error) {
	item, err := queryObj(c.r.Context(), s.db, "SELECT "+programStudiColumns+" FROM `ProgramStudi` WHERE `id` = ?", id)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, httpError(http.StatusNotFound, "Program studi tidak ditemukan")
	}
	return item, nil
}

// programStudiValues maps the validated body to columns ("" jenjang → NULL).
func programStudiValues(body map[string]any) ([]string, []any) {
	cols := []string{}
	args := []any{}
	for _, field := range []string{"nama", "jenjang", "isAktif"} {
		v, ok := body[field]
		if !ok {
			continue
		}
		if field == "jenjang" && v == "" {
			v = nil
		}
		cols = append(cols, field)
		args = append(args, v)
	}
	return cols, args
}

func (s *Server) createProgramStudi(c *Ctx) error {
	cols, args := programStudiValues(c.bodyMap())
	now := s.nowMs()
	cols = append(cols, "createdAt", "updatedAt")
	args = append(args, now, now)
	quoted := make([]string, len(cols))
	for i, col := range cols {
		quoted[i] = "`" + col + "`"
	}
	// Nama duplikat → 409 "Resource already exists" (UNIQUE, lewat handleError).
	res, err := s.db.ExecContext(c.r.Context(), "INSERT INTO `ProgramStudi` ("+strings.Join(quoted, ",")+") VALUES ("+placeholders(len(cols))+")", args...)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	item, err := s.programStudiByID(c, id)
	if err != nil {
		return err
	}
	return c.created("Program studi berhasil dibuat", item)
}

func (s *Server) updateProgramStudi(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	if _, err := s.programStudiByID(c, id); err != nil {
		return err
	}
	cols, args := programStudiValues(c.bodyMap())
	sets := make([]string, 0, len(cols)+1)
	for _, col := range cols {
		sets = append(sets, "`"+col+"` = ?")
	}
	sets = append(sets, "`updatedAt` = ?")
	args = append(args, s.nowMs(), id)
	if _, err := s.db.ExecContext(c.r.Context(), "UPDATE `ProgramStudi` SET "+strings.Join(sets, ", ")+" WHERE `id` = ?", args...); err != nil {
		return err
	}
	item, err := s.programStudiByID(c, id)
	if err != nil {
		return err
	}
	return c.ok("Program studi berhasil diperbarui", item)
}

func (s *Server) deleteProgramStudi(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	if _, err := s.programStudiByID(c, id); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(c.r.Context(), "DELETE FROM `ProgramStudi` WHERE `id` = ?", id); err != nil {
		return err
	}
	return c.ok("Program studi berhasil dihapus", noData)
}
