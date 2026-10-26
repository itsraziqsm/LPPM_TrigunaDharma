package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Template proposal yang bisa diganti admin (berubah tiap tahun). Tidak ada padanannya di
// Node: endpoint baru, dokumentasi untuk frontend di new-api.md bagian 21.
//   - Admin mengunggah versi baru (DOCX/PDF, maks 10 MB) → langsung jadi template aktif untuk
//     jenisnya; versi lama tetap tersimpan sebagai riwayat dan bisa diaktifkan lagi.
//   - Jenis: penelitian, pengabdian, atau umum (dipakai bila jenis itu tidak punya template aktif).
//   - Template aktif & unduhannya publik (tanpa token) agar bisa dipakai langsung di <a href>.

var (
	templateJenis       = []string{"umum", "penelitian", "pengabdian"}
	templateUploadRules = uploadRule{
		allowed:  []string{mimeDOCX, "application/pdf"},
		maxBytes: maxUploadBytes, filterMsg: "Template harus berupa file DOCX atau PDF.",
		tooLargeMsg: "Ukuran template maksimal 10 MB.", status: http.StatusBadRequest,
	}
	templateListQuerySchema  = zObj(optional("jenis", zEnumOf(templateJenis...)))
	templateAktifQuerySchema = zObj(withDefault("jenis", zEnumOf(templateJenis...), "umum"))
)

func (s *Server) registerTemplateProposalRoutes() {
	g := s.group("/api/v1/template-proposal")
	admin := []step{s.authenticate, authorize("admin")}
	// publik (route statis sebelum /:id)
	g.get("/aktif", s.validateQuery(templateAktifQuerySchema), s.templateAktif)
	g.get("/aktif/unduh", s.validateQuery(templateAktifQuerySchema), s.unduhTemplateAktif)
	// admin
	g.get("/", append(admin, s.validateQuery(templateListQuerySchema), s.listTemplate)...)
	g.post("/", append(admin, multerFile("file", templateUploadRules), s.uploadTemplate)...)
	g.get("/:id/unduh", append(admin, s.unduhTemplate)...)
	g.patch("/:id/aktifkan", append(admin, s.aktifkanTemplate)...)
	g.delete("/:id", append(admin, s.deleteTemplate)...)
}

const templateSelect = "SELECT t.`id`,t.`jenis`,t.`tahun`,t.`keterangan`,t.`namaFile`,t.`mime`,t.`ukuran`,t.`isAktif`,t.`createdAt`,t.`updatedAt`," +
	"u.`id` AS `u_id`,u.`name` AS `u_name`,u.`fullName` AS `u_fullName` FROM `TemplateProposal` t LEFT JOIN `User` u ON u.`id` = t.`diunggahOlehId`"

// templateItem menyusun bentuk respons; unduhUrl relatif ke base URL API (seperti fotoUrl).
func templateItem(row O, publik bool) O {
	var oleh any
	if row.Get("u_id") != nil {
		oleh = O{{"id", row.Get("u_id")}, {"name", row.Get("u_name")}, {"fullName", row.Get("u_fullName")}}
	}
	id, _ := row.Get("id").(int64)
	url := "/template-proposal/" + itoa(id) + "/unduh"
	if publik {
		url = "/template-proposal/aktif/unduh?jenis=" + row.Get("jenis").(string) + "&v=" + itoa(id)
	}
	return O{
		{"id", row.Get("id")},
		{"jenis", row.Get("jenis")},
		{"tahun", row.Get("tahun")},
		{"keterangan", row.Get("keterangan")},
		{"namaFile", row.Get("namaFile")},
		{"mime", row.Get("mime")},
		{"ukuran", row.Get("ukuran")},
		{"isAktif", row.Get("isAktif")},
		{"unduhUrl", url},
		{"diunggahOleh", oleh},
		{"createdAt", row.Get("createdAt")},
		{"updatedAt", row.Get("updatedAt")},
	}
}

func (s *Server) templateByID(ctx context.Context, id int64) (O, error) {
	row, err := queryObj(ctx, s.db, templateSelect+" WHERE t.`id` = ?", id)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, httpError(http.StatusNotFound, "Template tidak ditemukan")
	}
	return row, nil
}

// templateAktifRow: template aktif untuk jenis, jatuh ke 'umum' bila tidak ada. nil bila kosong.
func (s *Server) templateAktifRow(ctx context.Context, jenis string) (O, error) {
	return queryObj(ctx, s.db, templateSelect+" WHERE t.`isAktif` = true AND t.`jenis` IN (?, 'umum')"+
		" ORDER BY t.`jenis` = 'umum' ASC, t.`id` DESC LIMIT 1", jenis)
}

func (s *Server) templateAktif(c *Ctx) error {
	row, err := s.templateAktifRow(c.r.Context(), c.validatedQuery["jenis"].(string))
	if err != nil {
		return err
	}
	if row == nil {
		return c.ok("Belum ada template aktif", nil)
	}
	return c.ok("Template aktif fetched", templateItem(row, true))
}

func (s *Server) sendTemplateFile(c *Ctx, id int64) error {
	var data []byte
	var nama, mimeType string
	err := s.db.QueryRowContext(c.r.Context(), "SELECT `fileBlob`,`namaFile`,`mime` FROM `TemplateProposal` WHERE `id` = ?", id).Scan(&data, &nama, &mimeType)
	if isNoRows(err) {
		return httpError(http.StatusNotFound, "Template tidak ditemukan")
	}
	if err != nil {
		return err
	}
	h := c.w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Type", mimeType)
	h.Set("Content-Disposition", `attachment; filename="`+jsEncodeURIComponent(nama)+`"`)
	h.Set("Content-Length", strconv.Itoa(len(data)))
	h.Set("Cache-Control", "no-cache")
	c.w.WriteHeader(http.StatusOK)
	if c.r.Method != http.MethodHead {
		_, _ = c.w.Write(data)
	}
	return errStop
}

func (s *Server) unduhTemplateAktif(c *Ctx) error {
	row, err := s.templateAktifRow(c.r.Context(), c.validatedQuery["jenis"].(string))
	if err != nil {
		return err
	}
	if row == nil {
		return httpError(http.StatusNotFound, "Belum ada template aktif")
	}
	return s.sendTemplateFile(c, row.Get("id").(int64))
}

func (s *Server) unduhTemplate(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	return s.sendTemplateFile(c, id)
}

func (s *Server) listTemplate(c *Ctx) error {
	where, args := "", []any{}
	if j, ok := c.validatedQuery["jenis"].(string); ok {
		where, args = " WHERE t.`jenis` = ?", append(args, j)
	}
	rows, err := queryObjs(c.r.Context(), s.db, templateSelect+where+" ORDER BY t.`jenis` ASC, t.`isAktif` DESC, t.`id` DESC", args...)
	if err != nil {
		return err
	}
	items := make([]O, len(rows))
	for i, r := range rows {
		items[i] = templateItem(r, false)
	}
	return c.ok("Template fetched", items)
}

// uploadTemplate: multipart `file` + field opsional `jenis` (default umum), `tahun`, `keterangan`.
// Versi baru langsung aktif untuk jenisnya; versi aktif sebelumnya dinonaktifkan.
func (s *Server) uploadTemplate(c *Ctx) error {
	if c.file == nil {
		return httpError(http.StatusBadRequest, "File template tidak ditemukan dalam request (field `file`).")
	}
	detected := detectFileType(c.file.data)
	if !validEnum(detected, templateUploadRules.allowed) {
		return httpError(http.StatusBadRequest, "Isi file bukan DOCX atau PDF yang valid.")
	}
	body := c.bodyMap()
	field := func(k string) string { v, _ := body[k].(string); return strings.TrimSpace(v) }
	errs := O{}
	jenis := field("jenis")
	if jenis == "" {
		jenis = "umum"
	} else if !validEnum(jenis, templateJenis) {
		errs = append(errs, KV{"jenis", []any{"Jenis harus umum, penelitian, atau pengabdian"}})
	}
	var tahun any
	if t := field("tahun"); t != "" {
		n, err := strconv.Atoi(t)
		if err != nil || n < 2000 || n > 2100 {
			errs = append(errs, KV{"tahun", []any{"Tahun harus angka 2000–2100"}})
		} else {
			tahun = n
		}
	}
	var keterangan any
	if k := field("keterangan"); k != "" {
		if utf8.RuneCountInString(k) > 191 {
			errs = append(errs, KV{"keterangan", []any{"Keterangan maksimal 191 karakter"}})
		} else {
			keterangan = k
		}
	}
	if len(errs) > 0 {
		c.s.validationFailed(c.w, c.r, errs)
		return errStop
	}
	nama := c.file.originalname
	if nama == "" {
		nama = "template-proposal.docx"
	}
	ctx := c.r.Context()
	now := s.nowMs()
	var id int64
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "UPDATE `TemplateProposal` SET `isAktif` = false, `updatedAt` = ? WHERE `jenis` = ? AND `isAktif` = true", now, jenis); err != nil {
			return err
		}
		res, err := tx.ExecContext(ctx,
			"INSERT INTO `TemplateProposal` (`jenis`,`tahun`,`keterangan`,`namaFile`,`mime`,`ukuran`,`fileBlob`,`isAktif`,`diunggahOlehId`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,true,?,?,?)",
			jenis, tahun, keterangan, nama, detected, c.file.size, c.file.data, c.user.UserID, now, now)
		if err != nil {
			return err
		}
		id, err = res.LastInsertId()
		return err
	})
	if err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "template.upload", EntityType: "template_proposal", EntityID: id,
		Detail: "Template proposal " + jenis + " diganti: " + nama,
	}); err != nil {
		return err
	}
	row, err := s.templateByID(ctx, id)
	if err != nil {
		return err
	}
	return c.created("Template proposal berhasil diunggah dan diaktifkan", templateItem(row, false))
}

func (s *Server) aktifkanTemplate(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	row, err := s.templateByID(ctx, id)
	if err != nil {
		return err
	}
	jenis := row.Get("jenis").(string)
	now := s.nowMs()
	if err := s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "UPDATE `TemplateProposal` SET `isAktif` = false, `updatedAt` = ? WHERE `jenis` = ? AND `isAktif` = true AND `id` <> ?", now, jenis, id); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, "UPDATE `TemplateProposal` SET `isAktif` = true, `updatedAt` = ? WHERE `id` = ?", now, id)
		return err
	}); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "template.aktifkan", EntityType: "template_proposal", EntityID: id,
		Detail: "Template proposal " + jenis + " diaktifkan: " + row.Str("namaFile"),
	}); err != nil {
		return err
	}
	row, err = s.templateByID(ctx, id)
	if err != nil {
		return err
	}
	return c.ok("Template proposal diaktifkan", templateItem(row, false))
}

// deleteTemplate menghapus versi riwayat. Template yang sedang aktif tidak bisa dihapus (409):
// aktifkan atau unggah versi lain dulu, supaya dosen selalu punya template untuk diunduh.
func (s *Server) deleteTemplate(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	row, err := s.templateByID(ctx, id)
	if err != nil {
		return err
	}
	if aktif, _ := row.Get("isAktif").(bool); aktif {
		return httpError(http.StatusConflict, "Template yang sedang aktif tidak bisa dihapus. Unggah atau aktifkan template lain terlebih dahulu.")
	}
	if _, err := s.db.ExecContext(ctx, "DELETE FROM `TemplateProposal` WHERE `id` = ?", id); err != nil {
		return err
	}
	if err := s.logActivity(ctx, s.db, c, activityEntry{
		UserID: c.user.UserID, Action: "template.delete", EntityType: "template_proposal", EntityID: id,
		Detail: "Template proposal dihapus: " + row.Str("namaFile"),
	}); err != nil {
		return err
	}
	return c.ok("Template proposal dihapus", noData)
}
