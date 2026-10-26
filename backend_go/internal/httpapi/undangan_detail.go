package httpapi

import "net/http"

// W-35: detail undangan untuk calon anggota yang belum menerima. Tidak ada padanannya di Node
// (endpoint baru, new-api.md bagian 22). Hanya penerima undangan; data kegiatan diringkas tanpa
// dokumen utama/lampiran, catatan revisi, reviewer, dan kontak anggota lain.

// GET /dosen/proposals/invitations/:id
func (s *Server) dosenInvitationDetail(c *Ctx) error {
	id, err := idParam(c, "id")
	if err != nil {
		return err
	}
	ctx := c.r.Context()
	inv, err := queryObj(ctx, s.db,
		"SELECT a.`id`,a.`peran`,a.`statusUndangan`,a.`createdAt`,a.`userId` AS `__uid`,a.`proposalId` AS `__pid` FROM `ProposalAnggota` a WHERE a.`id` = ?", id)
	if err != nil {
		return err
	}
	if inv == nil || inv.Int64("__uid") != c.user.UserID {
		return httpError(http.StatusNotFound, "Undangan tidak ditemukan")
	}
	pid := inv.Int64("__pid")
	p, err := s.loadProposal(ctx, s.db, proposalDosenShape, pid)
	if err != nil {
		return err
	}
	if p == nil {
		return httpError(http.StatusNotFound, "Undangan tidak ditemukan")
	}
	for _, k := range []string{"dokumenUrl", "catatanRevisi", "reviewerTugasan"} {
		p.Del(k)
	}
	if list, ok := p.Get("anggota").([]O); ok {
		for i := range list {
			if u, ok := list[i].Get("user").(O); ok {
				u.Del("email")
				u.Del("kontak")
				u.Del("noHp")
				list[i].Set("user", u)
			}
		}
	}
	luaran, err := queryObjs(ctx, s.db,
		"SELECT `id`,`jenis`,`target`,`targetTanggal` FROM `LuaranKegiatan` WHERE `proposalId` = ? ORDER BY `id` ASC", pid)
	if err != nil {
		return err
	}
	p.Set("targetLuaran", luaran)
	inv.Del("__uid")
	inv.Del("__pid")
	inv.Set("proposal", p)
	return c.ok("Invitation fetched", inv)
}
