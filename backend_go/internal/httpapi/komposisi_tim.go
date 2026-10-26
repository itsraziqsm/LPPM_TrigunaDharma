package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// Aturan komposisi tim proposal (anggota SELAIN ketua pengusul), dicek saat proposal diajukan.
// Draft boleh disimpan dengan tim belum lengkap. maks 0 = tanpa batas.
//
//	Penelitian : dosen 0–5, mahasiswa minimal 1 (tanpa batas maksimal)
//	Pengabdian : dosen 1–5, mahasiswa minimal 1 (tanpa batas maksimal)
type batasTim struct{ min, maks int64 }

var aturanTim = map[string]struct{ dosen, mahasiswa batasTim }{
	"penelitian": {dosen: batasTim{0, 5}, mahasiswa: batasTim{1, 0}},
	"pengabdian": {dosen: batasTim{1, 5}, mahasiswa: batasTim{1, 0}},
}

// checkKomposisiTim → 400 bila tim proposal belum memenuhi aturan. Anggota yang menolak
// undangan tidak dihitung. Dosen = user berperan dosen; mahasiswa = berperan mahasiswa tanpa
// peran dosen.
func (s *Server) checkKomposisiTim(ctx context.Context, p *proposalRow) error {
	aturan, ok := aturanTim[p.Jenis]
	if !ok {
		return nil
	}
	const punyaPeran = "EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = a.`userId` AND r.`name` = '%s')"
	var dosen, mahasiswa int64
	err := s.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM("+fmt.Sprintf(punyaPeran, "dosen")+"),0),"+
			" COALESCE(SUM("+fmt.Sprintf(punyaPeran, "mahasiswa")+" AND NOT "+fmt.Sprintf(punyaPeran, "dosen")+"),0)"+
			" FROM `ProposalAnggota` a WHERE a.`proposalId` = ? AND a.`userId` <> ? AND a.`statusUndangan` <> 'ditolak'",
		p.ID, p.PengusulID).Scan(&dosen, &mahasiswa)
	if err != nil {
		return err
	}
	salah := []string{}
	cek := func(label string, n int64, b batasTim) {
		switch {
		case n < b.min:
			salah = append(salah, fmt.Sprintf("minimal %d anggota %s (sekarang %d)", b.min, label, n))
		case b.maks > 0 && n > b.maks:
			salah = append(salah, fmt.Sprintf("maksimal %d anggota %s (sekarang %d)", b.maks, label, n))
		}
	}
	cek("dosen", dosen, aturan.dosen)
	cek("mahasiswa", mahasiswa, aturan.mahasiswa)
	if len(salah) > 0 {
		return httpError(http.StatusBadRequest, "Proposal "+p.Jenis+" belum dapat diajukan: tim wajib memiliki "+strings.Join(salah, " dan ")+", selain ketua pengusul.")
	}
	return nil
}
