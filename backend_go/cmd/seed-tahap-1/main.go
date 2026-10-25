// Command seed-tahap-1 membuat data contoh LAPORAN untuk proposal yang sudah
// disetujui ketua (tahap 1 setelah persetujuan proposal).
//
//	go run ./cmd/seed-tahap-1                # laporan dengan status campur
//	go run ./cmd/seed-tahap-1 -status=draft  # semua laporan berstatus draft
//	go run ./cmd/seed-tahap-1 -dry-run       # hanya tampilkan rencana
//
// Untuk setiap proposal `disetujui` yang belum punya laporan:
//   - membuat baris tipe 'laporan' (registri `Kegiatan` + tabel Penelitian/Pengabdian),
//     menyalin data proposal (judul, abstrak, anggaran, luaran, skema/mitra, rumpun ilmu,
//     bidang, kata kunci, periode) seperti POST /laporan;
//   - mengisi luaran tercapai, ringkasan hasil, realisasi anggaran (90% anggaran), metode
//     penelitian (penelitian) dan link dokumen laporan;
//   - status bergiliran draft → diajukan → review → revisi → disetujui (atau -status);
//     review/revisi/disetujui mendapat reviewer berperan `reviewer` (bukan pengusul) beserta
//     review; diajukan ke atas memberi notifikasi `laporan_diajukan` ke ketua, revisi/disetujui
//     memberi notifikasi ke pengusul;
//   - jika proposal belum punya item luaran, dibuat 2 target luaran; item ditandai tercapai
//     untuk laporan yang sudah diajukan.
//
// Aman dijalankan berulang: proposal yang sudah punya laporan dilewati. Jalankan setelah
// `go run ./cmd/migrate` (dan biasanya `go run ./cmd/seed`).
package main

import (
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"lppm-backend-go/internal/database"
)

var statusUrut = []string{"draft", "diajukan", "review", "revisi", "disetujui"}

type proposal struct {
	id, pengusulID int64
	jenis, judul   string
	approvedAt     sql.NullTime
}

func main() {
	statusFlag := flag.String("status", "campur", "status laporan: campur | draft | diajukan | review | revisi | disetujui")
	dryRun := flag.Bool("dry-run", false, "tampilkan rencana tanpa menulis ke database")
	flag.Parse()
	if *statusFlag != "campur" && !contains(statusUrut, *statusFlag) {
		log.Fatalf("status tidak dikenal: %s", *statusFlag)
	}

	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("load .env: %v", err)
	}
	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec("SELECT 1 FROM `Laporan` LIMIT 1"); err != nil {
		log.Fatalf("VIEW Laporan belum ada, jalankan `go run ./cmd/migrate` dulu: %v", err)
	}

	proposals, err := loadProposals(db)
	if err != nil {
		log.Fatal(err)
	}
	if len(proposals) == 0 {
		fmt.Println("Tidak ada proposal disetujui yang belum punya laporan. Tidak ada yang dibuat.")
		return
	}
	reviewers, err := loadReviewers(db)
	if err != nil {
		log.Fatal(err)
	}
	ketua, err := loadKetua(db)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Membuat laporan untuk %d proposal disetujui...\n", len(proposals))
	dibuat := 0
	for i, p := range proposals {
		status := *statusFlag
		if status == "campur" {
			status = statusUrut[i%len(statusUrut)]
		}
		var reviewerID int64
		if status == "review" || status == "revisi" || status == "disetujui" {
			reviewerID = pickReviewer(reviewers, p.pengusulID, i)
			if reviewerID == 0 {
				fmt.Printf("  ! %s #%d: tidak ada reviewer (selain pengusul), status diturunkan ke diajukan\n", p.jenis, p.id)
				status = "diajukan"
			}
		}
		if *dryRun {
			fmt.Printf("  • %s #%d \"%s\" → laporan %s\n", p.jenis, p.id, p.judul, status)
			continue
		}
		id, err := createLaporan(db, p, status, reviewerID, ketua)
		if err != nil {
			log.Fatalf("proposal #%d: %v", p.id, err)
		}
		dibuat++
		fmt.Printf("  ✔ %s #%d \"%s\" → laporan #%d (%s)\n", p.jenis, p.id, p.judul, id, status)
	}
	if *dryRun {
		fmt.Println("Dry run: tidak ada data yang ditulis.")
		return
	}
	fmt.Printf("Seeding tahap 1 selesai: %d laporan dibuat.\n", dibuat)
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func loadProposals(db *sql.DB) ([]proposal, error) {
	rows, err := db.Query("SELECT p.`id`,p.`jenis`,p.`judul`,p.`pengusulId`,p.`approvedAt` FROM `Proposal` p" +
		" WHERE p.`status` = 'disetujui' AND NOT EXISTS (SELECT 1 FROM `Laporan` l WHERE l.`proposalId` = p.`id`)" +
		" ORDER BY p.`approvedAt` ASC, p.`id` ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []proposal
	for rows.Next() {
		var p proposal
		if err := rows.Scan(&p.id, &p.jenis, &p.judul, &p.pengusulID, &p.approvedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func loadIDs(db *sql.DB, query string) ([]int64, error) {
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func loadReviewers(db *sql.DB) ([]int64, error) {
	return loadIDs(db, "SELECT DISTINCT u.`id` FROM `User` u JOIN `UserRole` ur ON ur.`userId` = u.`id` JOIN `Role` r ON r.`id` = ur.`roleId`"+
		" WHERE r.`name` = 'reviewer' AND u.`status` = 'approved' ORDER BY u.`id`")
}

func loadKetua(db *sql.DB) ([]int64, error) {
	return loadIDs(db, "SELECT DISTINCT u.`id` FROM `User` u JOIN `UserRole` ur ON ur.`userId` = u.`id` JOIN `Role` r ON r.`id` = ur.`roleId`"+
		" WHERE r.`name` = 'ketua_lppm' AND u.`status` = 'approved' ORDER BY u.`id`")
}

// pickReviewer rotates through reviewers, skipping the pengusul.
func pickReviewer(reviewers []int64, pengusulID int64, i int) int64 {
	for k := 0; k < len(reviewers); k++ {
		id := reviewers[(i+k)%len(reviewers)]
		if id != pengusulID {
			return id
		}
	}
	return 0
}

func createLaporan(db *sql.DB, p proposal, status string, reviewerID int64, ketua []int64) (int64, error) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	created := now.Add(-72 * time.Hour)
	if p.approvedAt.Valid && p.approvedAt.Time.After(created) {
		created = p.approvedAt.Time
	}
	var submitted, approved any
	if status != "draft" {
		submitted = created.Add(24 * time.Hour)
		if t := submitted.(time.Time); t.After(now) {
			submitted = now
		}
	}
	if status == "disetujui" {
		approved = now
	}
	var catatan any
	if status == "revisi" {
		catatan = "Lengkapi bukti luaran dan rincian realisasi anggaran."
	}
	table, extraCols := "Penelitian", "`skema`,`metodePenelitian`"
	extraSel := "`skema`, 'Metode kuantitatif dengan eksperimen dan analisis data lapangan.'"
	if p.jenis == "pengabdian" {
		table, extraCols = "Pengabdian", "`mitra`,`mitraJenis`,`mitraAlamat`,`mitraKontak`,`mitraKebutuhan`"
		extraSel = "`mitra`,`mitraJenis`,`mitraAlamat`,`mitraKontak`,`mitraKebutuhan`"
	}

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck // no-op after commit

	res, err := tx.Exec("INSERT INTO `Kegiatan` (`jenis`,`tipe`,`createdAt`) VALUES (?, 'laporan', ?)", p.jenis, created)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	luaranTercapai := "Artikel ilmiah telah disubmit ke jurnal nasional terakreditasi; kegiatan dipublikasikan."
	ringkasan := "Kegiatan \"" + p.judul + "\" telah dilaksanakan sesuai rencana. Target utama tercapai dan dokumentasi lengkap terlampir."
	if _, err := tx.Exec("INSERT INTO `"+table+"` (`id`,`tipe`,`proposalId`,`judul`,`abstrak`,`status`,`anggaran`,`luaran`,"+
		"`rumpunIlmu`,`bidang`,`kataKunci`,`luaranTercapai`,`ringkasanHasil`,`realisasiAnggaran`,"+extraCols+","+
		"`catatanRevisi`,`pengusulId`,`periodeId`,`dokumenUrl`,`submittedAt`,`approvedAt`,`createdAt`,`updatedAt`)"+
		" SELECT ?, 'laporan', `id`, `judul`, `abstrak`, ?, `anggaran`, `luaran`, `rumpunIlmu`, `bidang`, `kataKunci`, ?, ?,"+
		" ROUND(`anggaran` * 0.9, 2), "+extraSel+", ?, `pengusulId`, `periodeId`, ?, ?, ?, ?, ?"+
		" FROM `"+table+"` WHERE `id` = ?",
		id, status, luaranTercapai, ringkasan, catatan,
		fmt.Sprintf("https://drive.google.com/laporan-%d", id), submitted, approved, created, now, p.id); err != nil {
		return 0, err
	}

	if err := seedLuaran(tx, p, status, now); err != nil {
		return 0, err
	}

	if reviewerID != 0 {
		if _, err := tx.Exec("INSERT INTO `ReviewerTugasan` (`proposalId`,`reviewerId`,`createdAt`) VALUES (?,?,?)", id, reviewerID, now); err != nil {
			return 0, err
		}
		rekomendasi, isDone := "disetujui", status != "review"
		if status == "revisi" {
			rekomendasi = "revisi"
		}
		if _, err := tx.Exec("INSERT INTO `ProposalReview` (`proposalId`,`reviewerId`,`nilaiRelevansi`,`nilaiMetodologi`,`nilaiAnggaran`,`nilaiLuaran`,`catatan`,`rekomendasi`,`isDone`,`createdAt`,`updatedAt`)"+
			" VALUES (?,?,?,?,?,?,?,?,?,?,?)",
			id, reviewerID, "85", "80", "82", "88", "Laporan disusun dengan baik; luaran sesuai target.", rekomendasi, isDone, now, now); err != nil {
			return 0, err
		}
	}

	notify := func(userID int64, typ, judul, pesan string) error {
		_, err := tx.Exec("INSERT INTO `Notification` (`userId`,`type`,`judul`,`pesan`,`isRead`,`refId`,`refType`,`createdAt`) VALUES (?,?,?,?,false,?,'laporan',?)",
			userID, typ, judul, pesan, id, now)
		return err
	}
	if status != "draft" {
		for _, k := range ketua {
			if err := notify(k, "laporan_diajukan", "Laporan Diajukan", `Laporan "`+p.judul+`" telah diajukan dan menunggu penugasan reviewer`); err != nil {
				return 0, err
			}
		}
	}
	switch status {
	case "revisi":
		if err := notify(p.pengusulID, "laporan_revisi", "Laporan revisi", `Laporan "`+p.judul+`" telah revisi. Catatan: Lengkapi bukti luaran dan rincian realisasi anggaran.`); err != nil {
			return 0, err
		}
	case "disetujui":
		if err := notify(p.pengusulID, "laporan_disetujui", "Laporan disetujui", `Laporan "`+p.judul+`" telah disetujui`); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit()
}

// seedLuaran adds two target items when the proposal has none, and marks the
// items achieved once the laporan has been submitted.
func seedLuaran(tx *sql.Tx, p proposal, status string, now time.Time) error {
	var n int64
	if err := tx.QueryRow("SELECT COUNT(*) FROM `LuaranKegiatan` WHERE `proposalId` = ?", p.id).Scan(&n); err != nil {
		return err
	}
	target := now.AddDate(0, 3, 0)
	if n == 0 {
		second := []string{"hki", "Hak cipta program komputer"}
		if p.jenis == "pengabdian" {
			second = []string{"media_massa", "Video kegiatan dan publikasi media massa"}
		}
		for _, item := range [][]string{{"jurnal", "Artikel jurnal nasional terakreditasi (SINTA)"}, second} {
			if _, err := tx.Exec("INSERT INTO `LuaranKegiatan` (`proposalId`,`jenis`,`target`,`targetTanggal`,`status`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,'belum',?,?)",
				p.id, item[0], item[1], target, now, now); err != nil {
				return err
			}
		}
	}
	if status == "draft" {
		return nil
	}
	_, err := tx.Exec("UPDATE `LuaranKegiatan` SET `status` = 'tercapai', `tercapaiAt` = ?, `judulCapaian` = COALESCE(`judulCapaian`, ?),"+
		" `buktiUrl` = COALESCE(`buktiUrl`, ?), `updatedAt` = ? WHERE `proposalId` = ? AND `status` = 'belum'",
		now, truncate("Capaian: "+p.judul, 191), fmt.Sprintf("https://jurnal.example.ac.id/artikel/%d", p.id), now, p.id)
	return err
}

// truncate shortens s to at most n characters (VARCHAR(191) columns).
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
