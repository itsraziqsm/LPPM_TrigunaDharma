package httpapi

import (
	"math"
	"net/http"
	"strconv"
	"time"
)

// Nilai kepercayaan dosen (W-06), skala 0–5, dihitung dari riwayat. Tidak ada
// padanannya di Node; rumus terdokumentasi di new-api.md bagian 12.
//
// Empat komponen (masing-masing 0–1, bobot sama). Komponen tanpa data tidak
// ikut dihitung; nilai = 5 × rata-rata komponen yang ada (null jika tidak ada).
//
//	persetujuan_proposal : proposal disetujui / (disetujui + ditolak)
//	persetujuan_laporan  : laporan disetujui / proposal disetujui yang periodenya
//	                       sudah selesai atau laporannya sudah diputuskan
//	rekomendasi_reviewer : rata-rata review final (disetujui=1, revisi=0,5, ditolak=0)
//	                       atas proposal & laporan milik user
//	ketepatan_waktu      : luaran tercapai paling lambat tanggal targetnya /
//	                       luaran bertanggal target yang sudah tercapai atau lewat target

type kepercayaanKomponen struct {
	kode, label, keterangan string
	pembilang, penyebut     float64
}

func (k kepercayaanKomponen) nilai() (float64, bool) {
	if k.penyebut == 0 {
		return 0, false
	}
	return k.pembilang / k.penyebut, true
}

func round(v float64, digits int) float64 {
	p := math.Pow(10, float64(digits))
	return math.Round(v*p) / p
}

func (s *Server) registerKepercayaanRoutes() {
	g := s.group("/api/v1/dosen/kepercayaan", s.authenticate)
	g.get("/", s.nilaiKepercayaan)
}

// nilaiKepercayaan: dosen/mahasiswa melihat nilainya sendiri; admin/ketua
// boleh melihat user lain lewat ?userId=.
func (s *Server) nilaiKepercayaan(c *Ctx) error {
	uid := c.user.UserID
	if raw, ok := c.queryValue("userId"); ok && raw != "" {
		if !hasAnyRole(c.user.Roles, "admin", "ketua_lppm") {
			return httpError(http.StatusForbidden, "Hanya admin/ketua yang dapat melihat nilai user lain")
		}
		id, err := strconv.ParseInt(raw, 10, 32)
		if err != nil || id <= 0 {
			return httpError(http.StatusBadRequest, "Parameter userId tidak valid.")
		}
		if _, err := s.ensureUserExists(c.r.Context(), id); err != nil {
			return err
		}
		uid = id
	} else if !hasAnyRole(c.user.Roles, "dosen", "mahasiswa", "admin", "ketua_lppm") {
		return c.fail(http.StatusForbidden, "Forbidden: insufficient permissions")
	}
	ctx := c.r.Context()
	now := s.now()

	proposal := kepercayaanKomponen{kode: "persetujuan_proposal", label: "Persetujuan proposal",
		keterangan: "Proposal disetujui dari seluruh proposal yang sudah diputuskan (disetujui/ditolak)"}
	laporan := kepercayaanKomponen{kode: "persetujuan_laporan", label: "Persetujuan laporan",
		keterangan: "Laporan disetujui dari proposal disetujui yang periodenya sudah selesai atau laporannya sudah diputuskan"}
	reviewer := kepercayaanKomponen{kode: "rekomendasi_reviewer", label: "Rekomendasi reviewer",
		keterangan: "Rata-rata rekomendasi review final: disetujui = 1, revisi = 0,5, ditolak = 0"}
	waktu := kepercayaanKomponen{kode: "ketepatan_waktu", label: "Ketepatan waktu luaran",
		keterangan: "Luaran yang tercapai paling lambat tanggal targetnya, dari luaran bertanggal target yang sudah tercapai atau sudah lewat target"}

	rows, err := queryObjs(ctx, s.db,
		"SELECT p.`status`, pe.`tanggalSelesai`, l.`status` AS `laporanStatus` FROM `Proposal` p"+
			" LEFT JOIN `Periode` pe ON pe.`id` = p.`periodeId` LEFT JOIN `Laporan` l ON l.`proposalId` = p.`id` WHERE p.`pengusulId` = ?", uid)
	if err != nil {
		return err
	}
	for _, row := range rows {
		switch row.Str("status") {
		case "ditolak":
			proposal.penyebut++
		case "disetujui":
			proposal.pembilang++
			proposal.penyebut++
			lap := row.Str("laporanStatus")
			selesai, hasEnd := row.Get("tanggalSelesai").(JSTime)
			if lap == "disetujui" || lap == "ditolak" || (hasEnd && time.Time(selesai).Before(now)) {
				laporan.penyebut++
				if lap == "disetujui" {
					laporan.pembilang++
				}
			}
		}
	}

	reviews, err := queryObjs(ctx, s.db,
		"SELECT rv.`rekomendasi` FROM `ProposalReview` rv WHERE rv.`isDone` = true AND rv.`rekomendasi` IS NOT NULL"+
			" AND rv.`proposalId` IN (SELECT `id` FROM `Proposal` WHERE `pengusulId` = ? UNION ALL SELECT `id` FROM `Laporan` WHERE `pengusulId` = ?)", uid, uid)
	if err != nil {
		return err
	}
	for _, row := range reviews {
		reviewer.penyebut++
		switch row.Str("rekomendasi") {
		case "disetujui":
			reviewer.pembilang++
		case "revisi":
			reviewer.pembilang += 0.5
		}
	}

	luaran, err := queryObjs(ctx, s.db,
		"SELECT lk.`status`, lk.`targetTanggal`, lk.`tercapaiAt` FROM `LuaranKegiatan` lk JOIN `Proposal` p ON p.`id` = lk.`proposalId`"+
			" WHERE p.`pengusulId` = ? AND lk.`targetTanggal` IS NOT NULL", uid)
	if err != nil {
		return err
	}
	for _, row := range luaran {
		target, _ := row.Get("targetTanggal").(JSTime)
		batas := endOfDay(time.Time(target))
		done, isDone := row.Get("tercapaiAt").(JSTime)
		switch {
		case row.Str("status") == "tercapai" && isDone:
			waktu.penyebut++
			if !time.Time(done).After(batas) {
				waktu.pembilang++
			}
		case batas.Before(now): // belum tercapai dan target sudah lewat
			waktu.penyebut++
		}
	}

	komponen := []any{}
	var jumlah float64
	var ada int
	for _, k := range []kepercayaanKomponen{proposal, laporan, reviewer, waktu} {
		var nilai any
		if v, ok := k.nilai(); ok {
			nilai = round(v, 2)
			jumlah += v
			ada++
		}
		komponen = append(komponen, O{
			{"kode", k.kode}, {"label", k.label}, {"bobot", 0.25}, {"nilai", nilai},
			{"pembilang", k.pembilang}, {"penyebut", k.penyebut}, {"keterangan", k.keterangan},
		})
	}
	var nilai any
	if ada > 0 {
		nilai = round(5*jumlah/float64(ada), 1)
	}
	return c.ok("Nilai kepercayaan fetched", O{
		{"userId", uid}, {"nilai", nilai}, {"skala", int64(5)}, {"komponen", komponen}, {"dihitungPada", JSTime(s.nowMs())},
	})
}
