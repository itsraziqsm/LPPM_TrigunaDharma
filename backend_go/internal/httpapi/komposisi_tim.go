package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// Aturan komposisi tim proposal (anggota SELAIN ketua pengusul), dicek saat proposal diajukan.
// Draft boleh disimpan dengan tim belum lengkap. Sama dengan frontend utils/aturanTim.js.
//
//	Pengabdian : minimal 2 dosen dan minimal 1 mahasiswa
//	Penelitian : minimal 2 dosen, mahasiswa boleh tidak ada
var minimalTim = map[string]struct{ dosen, mahasiswa int64 }{
	"pengabdian": {dosen: 2, mahasiswa: 1},
	"penelitian": {dosen: 2, mahasiswa: 0},
}

// checkKomposisiTim → 400 bila tim proposal belum memenuhi aturan. Anggota yang menolak
// undangan tidak dihitung. Dosen = user berperan dosen; mahasiswa = berperan mahasiswa tanpa
// peran dosen.
func (s *Server) checkKomposisiTim(ctx context.Context, p *proposalRow) error {
	aturan, ok := minimalTim[p.Jenis]
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
	kurang := []string{}
	if dosen < aturan.dosen {
		kurang = append(kurang, fmt.Sprintf("minimal %d anggota dosen (sekarang %d)", aturan.dosen, dosen))
	}
	if mahasiswa < aturan.mahasiswa {
		kurang = append(kurang, fmt.Sprintf("minimal %d anggota mahasiswa (sekarang %d)", aturan.mahasiswa, mahasiswa))
	}
	if len(kurang) > 0 {
		return httpError(http.StatusBadRequest, "Proposal "+p.Jenis+" belum dapat diajukan: tim wajib memiliki "+strings.Join(kurang, " dan ")+", selain ketua pengusul.")
	}
	return nil
}
