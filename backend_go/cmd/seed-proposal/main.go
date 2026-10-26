// Command seed-proposal membuat data contoh PROPOSAL dan LAPORAN dengan semua status yang ada
// di fitur, terutama untuk akun dosen1 dan dosen2:
//
//	go run ./cmd/seed-proposal            # buat (yang sudah ada dilewati)
//	go run ./cmd/seed-proposal -dry-run   # tampilkan rencana saja
//	go run ./cmd/seed-proposal -reset     # hapus data seed ini lalu buat ulang
//
// Akun utama (dosen1@lppm.dev, dosen2@lppm.dev) masing-masing mendapat 17 proposal:
//
//	Penelitian : draft, diajukan (menunggu), review, revisi, ditolak, disetujui tanpa laporan,
//	             disetujui + laporan draft, laporan diajukan, laporan review
//	Pengabdian : draft, diajukan, review, revisi, ditolak, disetujui + laporan revisi,
//	             laporan ditolak, laporan disetujui (selesai)
//
// Akun pendukung (dosen3–dosen5) mendapat beberapa proposal; draft milik dosen3 mengundang
// dosen1 & dosen2 (undangan menunggu) agar fitur Detail Undangan bisa dicoba, dan dosen1/dosen2
// saling menjadi anggota yang sudah menerima.
//
// Setiap proposal lengkap: periode aktif sesuai jenis, anggaran, rumpun ilmu (bidang komputer),
// bidang, kata kunci, skema (penelitian) / mitra + detail mitra (pengabdian), tim sesuai aturan
// komposisi, file dokumen utama (PDF kecil) untuk yang sudah diajukan, target luaran jurnal &
// poster, reviewer + review sesuai status, notifikasi utama. Penanda seed = judul (unik per akun).
// Jalankan setelah `go run ./cmd/migrate` dan `go run ./cmd/seed`.
package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"lppm-backend-go/internal/database"
)

type skenario struct {
	jenis, status, laporan string // laporan "" = tanpa laporan
}

// Skenario akun utama: urutan = urutan topik di bawah.
var skenarioUtama = []skenario{
	{"penelitian", "draft", ""},
	{"penelitian", "diajukan", ""},
	{"penelitian", "review", ""},
	{"penelitian", "revisi", ""},
	{"penelitian", "ditolak", ""},
	{"penelitian", "disetujui", ""},
	{"penelitian", "disetujui", "draft"},
	{"penelitian", "disetujui", "diajukan"},
	{"penelitian", "disetujui", "review"},
	{"pengabdian", "draft", ""},
	{"pengabdian", "diajukan", ""},
	{"pengabdian", "review", ""},
	{"pengabdian", "revisi", ""},
	{"pengabdian", "ditolak", ""},
	{"pengabdian", "disetujui", "revisi"},
	{"pengabdian", "disetujui", "ditolak"},
	{"pengabdian", "disetujui", "disetujui"},
}

var skenarioPendukung = []skenario{
	{"penelitian", "draft", ""},
	{"penelitian", "diajukan", ""},
	{"pengabdian", "disetujui", "disetujui"},
}

var topikPenelitian = []string{
	"Sistem Pendukung Keputusan Pemilihan Beasiswa Menggunakan Metode AHP dan TOPSIS",
	"Deteksi Penyakit Daun Padi Berbasis Convolutional Neural Network",
	"Analisis Sentimen Ulasan Aplikasi E-Wallet Menggunakan IndoBERT",
	"Rancang Bangun Sistem Monitoring Kualitas Air Kolam Berbasis IoT",
	"Penerapan Algoritma K-Means untuk Segmentasi Pelanggan UMKM",
	"Sistem Informasi Akademik Berbasis Microservices dengan Kubernetes",
	"Klasifikasi Kualitas Buah Sawit Menggunakan Computer Vision",
	"Deteksi Serangan DDoS pada Jaringan Kampus dengan Machine Learning",
	"Aplikasi Augmented Reality Pengenalan Budaya Sumatera Utara",
	"Optimasi Rute Distribusi Logistik Menggunakan Algoritma Genetika",
	"Chatbot Layanan Akademik Berbasis Large Language Model",
	"Sistem Absensi Pengenalan Wajah dengan Deteksi Liveness",
}

var topikPengabdian = []string{
	"Pelatihan Pemasaran Digital bagi UMKM Desa Sei Rotan",
	"Pendampingan Literasi Digital Guru SD Kecamatan Percut Sei Tuan",
	"Implementasi Aplikasi Kasir Sederhana untuk Koperasi Petani",
	"Pelatihan Keamanan Siber Dasar bagi Perangkat Desa",
	"Pembuatan Website Profil Desa Wisata Bukit Lawang",
	"Pelatihan Microsoft Office dan Google Workspace untuk Karang Taruna",
	"Digitalisasi Administrasi Posyandu dengan Aplikasi Mobile",
	"Pendampingan Pembukuan Digital UMKM Kuliner Medan Tembung",
	"Pelatihan Desain Grafis dengan Canva bagi Pelaku Usaha Rumahan",
	"Sosialisasi Etika Bermedia Sosial bagi Siswa SMA",
	"Instalasi Jaringan Internet Sekolah dan Pelatihan Teknisi",
	"Pelatihan Pemrograman Dasar Scratch untuk Siswa SMP",
}

var rumpunIlmu = []string{"Teknik Informatika", "Sistem Informasi", "Ilmu Komputer", "Sistem Komputer", "Kecerdasan Buatan dan Sains Data",
	"Jaringan Komputer dan Keamanan Siber", "Rekayasa Perangkat Lunak", "Sistem Tertanam dan Internet of Things (IoT)", "Multimedia dan Teknologi Game"}

// PDF minimal untuk dokumen utama (bisa diunduh & dibuka).
var pdfKecil = []byte("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
	"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")

type user struct {
	id   int64
	nama string
}

type ctx struct {
	db        *sql.DB
	now       time.Time
	periode   map[string]int64
	reviewers []int64
	ketua     []int64
	dosen     map[string]user // email → user
	mhs       []user
	bidang    map[string][]string
	mitraJns  []string
	dryRun    bool
	n         int // penghitung untuk variasi
}

func main() {
	dryRun := flag.Bool("dry-run", false, "tampilkan rencana tanpa menulis ke database")
	reset := flag.Bool("reset", false, "hapus data seed proposal ini (berdasarkan judul) lalu buat ulang")
	flag.Parse()
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("load .env: %v", err)
	}
	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	c := &ctx{db: db, now: time.Now().UTC().Truncate(time.Millisecond), dryRun: *dryRun}
	must(c.load())

	type rencana struct {
		email  string
		daftar []skenario
		geser  int
	}
	akun := []rencana{
		{"dosen1@lppm.dev", skenarioUtama, 0},
		{"dosen2@lppm.dev", skenarioUtama, 3},
		{"dosen3@lppm.dev", skenarioPendukung, 6},
		{"dosen4@lppm.dev", skenarioPendukung, 8},
		{"dosen5@lppm.dev", skenarioPendukung, 10},
	}
	if *reset && !*dryRun {
		total := 0
		for _, a := range akun {
			u, ok := c.dosen[a.email]
			if !ok {
				continue
			}
			n, err := c.hapusSeed(u.id)
			must(err)
			total += n
		}
		fmt.Printf("Reset: %d proposal seed dihapus (beserta laporan & relasinya).\n", total)
	}

	dibuat := 0
	for _, a := range akun {
		pengusul, ok := c.dosen[a.email]
		if !ok {
			fmt.Printf("• %s tidak ada, dilewati (jalankan go run ./cmd/seed dulu)\n", a.email)
			continue
		}
		fmt.Printf("%s (%s)\n", a.email, pengusul.nama)
		iPen, iPeng := 0, 0
		for _, s := range a.daftar {
			var judul string
			if s.jenis == "penelitian" {
				judul = topikPenelitian[(iPen+a.geser)%len(topikPenelitian)]
				iPen++
			} else {
				judul = topikPengabdian[(iPeng+a.geser)%len(topikPengabdian)]
				iPeng++
			}
			label := s.status
			if s.laporan != "" {
				label += " + laporan " + s.laporan
			}
			ada, err := c.sudahAda(pengusul.id, judul)
			must(err)
			if ada {
				fmt.Printf("  • sudah ada: [%s] %s\n", label, judul)
				continue
			}
			if c.dryRun {
				fmt.Printf("  + [%s] %s %s\n", s.jenis, label, judul)
				continue
			}
			id, err := c.buatProposal(pengusul, a.email, s, judul)
			if err != nil {
				log.Fatalf("%s %q: %v", a.email, judul, err)
			}
			dibuat++
			fmt.Printf("  ✔ #%d [%s] %s — %s\n", id, s.jenis, label, judul)
		}
	}
	if c.dryRun {
		fmt.Println("Dry run: tidak ada data yang ditulis.")
		return
	}
	fmt.Printf("Selesai: %d proposal dibuat.\n", dibuat)
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func ids(db *sql.DB, q string, args ...any) ([]int64, error) {
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

const byRole = "SELECT DISTINCT u.`id` FROM `User` u JOIN `UserRole` ur ON ur.`userId` = u.`id` JOIN `Role` r ON r.`id` = ur.`roleId` WHERE r.`name` = ? AND u.`status` = 'approved' ORDER BY u.`id`"

func (c *ctx) load() error {
	c.periode = map[string]int64{}
	for _, j := range []string{"penelitian", "pengabdian"} {
		var id int64
		err := c.db.QueryRow("SELECT `id` FROM `Periode` WHERE `jenis` = ? ORDER BY `isAktif` DESC, `tahun` DESC, `id` DESC LIMIT 1", j).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("belum ada periode %s: jalankan `go run ./cmd/seed` dulu", j)
		}
		if err != nil {
			return err
		}
		c.periode[j] = id
	}
	var err error
	if c.reviewers, err = ids(c.db, byRole, "reviewer"); err != nil {
		return err
	}
	if c.ketua, err = ids(c.db, byRole, "ketua_lppm"); err != nil {
		return err
	}
	c.dosen = map[string]user{}
	rows, err := c.db.Query("SELECT `id`,`email`,COALESCE(`fullName`,`name`) FROM `User` WHERE `email` LIKE 'dosen%@lppm.dev' AND `status` = 'approved'")
	if err != nil {
		return err
	}
	for rows.Next() {
		var u user
		var email string
		if err := rows.Scan(&u.id, &email, &u.nama); err != nil {
			rows.Close()
			return err
		}
		c.dosen[email] = u
	}
	rows.Close()
	rows, err = c.db.Query("SELECT `id`,COALESCE(`fullName`,`name`) FROM `User` WHERE `email` LIKE 'mahasiswa%@lppm.dev' AND `status` = 'approved' ORDER BY `id`")
	if err != nil {
		return err
	}
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.id, &u.nama); err != nil {
			rows.Close()
			return err
		}
		c.mhs = append(c.mhs, u)
	}
	rows.Close()
	if len(c.mhs) == 0 {
		return errors.New("belum ada akun mahasiswa: jalankan `go run ./cmd/seed` dulu")
	}
	c.bidang = map[string][]string{}
	rows, err = c.db.Query("SELECT `nama`,`jenisKegiatan` FROM `MasterData` WHERE `kategori` = 'bidang' AND `isAktif` = true ORDER BY `urutan`")
	if err != nil {
		return err
	}
	for rows.Next() {
		var nama string
		var jenis sql.NullString
		if err := rows.Scan(&nama, &jenis); err != nil {
			rows.Close()
			return err
		}
		for _, j := range []string{"penelitian", "pengabdian"} {
			if !jenis.Valid || jenis.String == j {
				c.bidang[j] = append(c.bidang[j], nama)
			}
		}
	}
	rows.Close()
	rows, err = c.db.Query("SELECT `nama` FROM `MasterData` WHERE `kategori` = 'jenis_mitra' AND `isAktif` = true ORDER BY `urutan`")
	if err != nil {
		return err
	}
	for rows.Next() {
		var nama string
		if err := rows.Scan(&nama); err != nil {
			rows.Close()
			return err
		}
		c.mitraJns = append(c.mitraJns, nama)
	}
	rows.Close()
	return nil
}

func semuaJudul() []string {
	return append(append([]string{}, topikPenelitian...), topikPengabdian...)
}

func inArgs(list []string) (string, []any) {
	args := make([]any, len(list))
	for i, v := range list {
		args[i] = v
	}
	return strings.TrimSuffix(strings.Repeat("?,", len(list)), ","), args
}

func (c *ctx) sudahAda(pengusulID int64, judul string) (bool, error) {
	var n int
	err := c.db.QueryRow("SELECT COUNT(*) FROM `Proposal` WHERE `pengusulId` = ? AND `judul` = ?", pengusulID, judul).Scan(&n)
	return n > 0, err
}

// hapusSeed menghapus proposal seed (judul dari daftar topik) milik user beserta laporannya.
func (c *ctx) hapusSeed(pengusulID int64) (int, error) {
	in, args := inArgs(semuaJudul())
	pids, err := ids(c.db, "SELECT `id` FROM `Proposal` WHERE `pengusulId` = ? AND `judul` IN ("+in+")", append([]any{pengusulID}, args...)...)
	if err != nil {
		return 0, err
	}
	for _, pid := range pids {
		lids, err := ids(c.db, "SELECT `id` FROM `Laporan` WHERE `proposalId` = ?", pid)
		if err != nil {
			return 0, err
		}
		all := append(lids, pid)
		for _, id := range all {
			if _, err := c.db.Exec("DELETE FROM `Notification` WHERE `refType` IN ('proposal','laporan') AND `refId` = ?", id); err != nil {
				return 0, err
			}
			if _, err := c.db.Exec("DELETE FROM `Kegiatan` WHERE `id` = ?", id); err != nil {
				return 0, err
			}
		}
	}
	return len(pids), nil
}

func (c *ctx) reviewer(kecuali int64) int64 {
	for k := 0; k < len(c.reviewers); k++ {
		id := c.reviewers[(c.n+k)%len(c.reviewers)]
		if id != kecuali {
			return id
		}
	}
	return 0
}

type exec interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func notif(tx exec, userID int64, typ, judul, pesan string, refID int64, refType string, at time.Time) error {
	_, err := tx.Exec("INSERT INTO `Notification` (`userId`,`type`,`judul`,`pesan`,`isRead`,`refId`,`refType`,`createdAt`) VALUES (?,?,?,?,false,?,?,?)",
		userID, typ, judul, pesan, refID, refType, at)
	return err
}

// tim memilih anggota selain pengusul sesuai aturan komposisi.
func (c *ctx) tim(pengusulEmail, jenis string) []user {
	calon := []string{"dosen3@lppm.dev", "dosen4@lppm.dev", "dosen5@lppm.dev", "dosen6@lppm.dev", "dosen7@lppm.dev", "dosen8@lppm.dev"}
	var dosen []user
	for k := 0; k < len(calon) && len(dosen) < 1+c.n%2; k++ {
		e := calon[(c.n+k)%len(calon)]
		if u, ok := c.dosen[e]; ok && e != pengusulEmail {
			dosen = append(dosen, u)
		}
	}
	mhsN := 1
	if jenis == "penelitian" {
		mhsN = 1 + c.n%2
	}
	out := dosen
	for k := 0; k < mhsN && k < len(c.mhs); k++ {
		out = append(out, c.mhs[(c.n+k)%len(c.mhs)])
	}
	return out
}

func (c *ctx) buatProposal(pengusul user, email string, s skenario, judul string) (int64, error) {
	c.n++
	now := c.now
	hari := func(d int) time.Time { return now.Add(time.Duration(-d) * 24 * time.Hour) }
	created := hari(40 - c.n%10)
	var submitted, approved any
	if s.status != "draft" {
		submitted = created.Add(48 * time.Hour)
	}
	if s.status == "disetujui" {
		approved = created.Add(10 * 24 * time.Hour)
	}
	var catatan any
	switch s.status {
	case "revisi":
		catatan = "Perjelas metodologi dan rincian anggaran; tambahkan target luaran poster."
	case "ditolak":
		catatan = "Topik belum sesuai dengan roadmap penelitian program studi."
	}
	anggaran := fmt.Sprintf("%d.00", 7500000+(c.n%8)*2500000)
	if s.jenis == "pengabdian" {
		anggaran = fmt.Sprintf("%d.00", 5000000+(c.n%6)*1500000)
	}
	kk, _ := json.Marshal([]string{strings.Split(judul, " ")[0], rumpunIlmu[c.n%len(rumpunIlmu)], s.jenis})
	abstrak := "Kegiatan ini bertujuan " + strings.ToLower(judul[:1]) + judul[1:] +
		". Metode yang digunakan meliputi studi literatur, pengumpulan data, perancangan, implementasi, dan evaluasi bersama pengguna. " +
		"Hasil yang diharapkan berupa produk yang dapat dimanfaatkan secara langsung serta publikasi ilmiah."
	bidang := ""
	if b := c.bidang[s.jenis]; len(b) > 0 {
		bidang = b[c.n%len(b)]
	}
	luaranTeks := "Artikel jurnal nasional terakreditasi (SINTA); Poster ilmiah"

	tx, err := c.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck

	res, err := tx.Exec("INSERT INTO `Kegiatan` (`jenis`,`tipe`,`createdAt`) VALUES (?, 'proposal', ?)", s.jenis, created)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	cols := []string{"id", "tipe", "judul", "abstrak", "status", "anggaran", "luaran", "rumpunIlmu", "bidang", "kataKunci", "catatanRevisi",
		"pengusulId", "periodeId", "submittedAt", "approvedAt", "createdAt", "updatedAt"}
	args := []any{id, "proposal", judul, abstrak, s.status, anggaran, luaranTeks, rumpunIlmu[c.n%len(rumpunIlmu)], nullIfEmpty(bidang), string(kk), catatan,
		pengusul.id, c.periode[s.jenis], submitted, approved, created, now}
	if s.status != "draft" {
		cols = append(cols, "dokumenNama", "dokumenMime", "dokumenUkuran", "dokumenBlob")
		args = append(args, "Proposal - "+truncate(judul, 150)+".pdf", "application/pdf", len(pdfKecil), pdfKecil)
	}
	table := "Penelitian"
	if s.jenis == "penelitian" {
		cols = append(cols, "skema")
		args = append(args, []string{"Penelitian Dosen Pemula", "Penelitian Terapan", "Penelitian Dasar"}[c.n%3])
	} else {
		table = "Pengabdian"
		mitraJenis := "Kelompok masyarakat"
		if len(c.mitraJns) > 0 {
			mitraJenis = c.mitraJns[c.n%len(c.mitraJns)]
		}
		cols = append(cols, "mitra", "mitraJenis", "mitraAlamat", "mitraKontak", "mitraKebutuhan")
		args = append(args, []string{"Kelompok Tani Maju Bersama", "UMKM Sejahtera Mandiri", "SD Negeri 101 Percut", "Pemerintah Desa Sei Rotan"}[c.n%4],
			mitraJenis, "Kec. Percut Sei Tuan, Kab. Deli Serdang, Sumatera Utara", fmt.Sprintf("0812-6%03d-%04d", c.n, 1000+c.n),
			"Mitra membutuhkan pendampingan pemanfaatan teknologi informasi untuk meningkatkan layanan dan usaha.")
	}
	if _, err := tx.Exec("INSERT INTO `"+table+"` (`"+strings.Join(cols, "`,`")+"`) VALUES ("+strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",")+")", args...); err != nil {
		return 0, err
	}

	// Tim: draft → undangan menunggu, selain itu sudah diterima semua.
	statusUndangan := "diterima"
	if s.status == "draft" {
		statusUndangan = "pending"
	}
	anggota := c.tim(email, s.jenis)
	// dosen1/dosen2 saling menjadi anggota (diterima) agar bagian "sebagai anggota" terisi.
	if pasangan := map[string]string{"dosen1@lppm.dev": "dosen2@lppm.dev", "dosen2@lppm.dev": "dosen1@lppm.dev"}[email]; pasangan != "" && s.status == "disetujui" {
		anggota = append([]user{c.dosen[pasangan]}, anggota...)
	}
	// draft dosen3 mengundang dosen1 & dosen2 (menunggu) untuk mencoba Detail Undangan.
	if email == "dosen3@lppm.dev" && s.status == "draft" {
		anggota = append([]user{c.dosen["dosen1@lppm.dev"], c.dosen["dosen2@lppm.dev"]}, anggota...)
	}
	seen := map[int64]bool{pengusul.id: true}
	for _, a := range anggota {
		if a.id == 0 || seen[a.id] {
			continue
		}
		seen[a.id] = true
		if _, err := tx.Exec("INSERT INTO `ProposalAnggota` (`proposalId`,`userId`,`peran`,`statusUndangan`,`createdAt`) VALUES (?,?,?,?,?)",
			id, a.id, "anggota", statusUndangan, created); err != nil {
			return 0, err
		}
	}

	// Target luaran prioritas: jurnal & poster.
	for _, l := range [][2]string{{"jurnal", "Artikel jurnal nasional terakreditasi (SINTA 4)"}, {"poster", "Poster ilmiah seminar nasional"}} {
		if _, err := tx.Exec("INSERT INTO `LuaranKegiatan` (`proposalId`,`jenis`,`target`,`targetTanggal`,`status`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,'belum',?,?)",
			id, l[0], l[1], now.AddDate(0, 4, 0), created, now); err != nil {
			return 0, err
		}
	}

	// Reviewer & review sesuai status proposal.
	if s.status == "review" || s.status == "revisi" || s.status == "ditolak" || s.status == "disetujui" {
		rid := c.reviewer(pengusul.id)
		if rid != 0 {
			if _, err := tx.Exec("INSERT INTO `ReviewerTugasan` (`proposalId`,`reviewerId`,`createdAt`) VALUES (?,?,?)", id, rid, created.Add(72*time.Hour)); err != nil {
				return 0, err
			}
			if err := notif(tx, rid, "reviewer_ditugaskan", "Penugasan Review Baru", `Anda ditugaskan untuk mereview proposal "`+judul+`"`, id, "proposal", created.Add(72*time.Hour)); err != nil {
				return 0, err
			}
			rek, done, cat := "disetujui", true, "Proposal layak didanai; metodologi jelas dan luaran terukur."
			switch s.status {
			case "review":
				rek, done, cat = "revisi", false, "Masih ditinjau: perlu memeriksa kesesuaian anggaran."
			case "revisi":
				rek, cat = "revisi", "Perlu perbaikan pada metodologi dan rincian anggaran."
			case "ditolak":
				rek, cat = "ditolak", "Topik kurang relevan dengan bidang fokus."
			}
			if _, err := tx.Exec("INSERT INTO `ProposalReview` (`proposalId`,`reviewerId`,`nilaiRelevansi`,`nilaiMetodologi`,`nilaiAnggaran`,`nilaiLuaran`,`catatan`,`rekomendasi`,`isDone`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
				id, rid, "80", "78", "82", "85", cat, rek, done, created.Add(96*time.Hour), now); err != nil {
				return 0, err
			}
			if done {
				if err := notif(tx, pengusul.id, "review_selesai", "Review Selesai", `Review untuk proposal "`+judul+`" telah selesai`, id, "proposal", created.Add(5*24*time.Hour)); err != nil {
					return 0, err
				}
			}
		}
	}
	if s.status != "draft" {
		for _, k := range c.ketua {
			if err := notif(tx, k, "proposal_diajukan", "Proposal Baru Diajukan", pengusul.nama+` mengajukan proposal "`+judul+`"`, id, "proposal", created.Add(48*time.Hour)); err != nil {
				return 0, err
			}
		}
	}
	switch s.status {
	case "disetujui", "ditolak", "revisi":
		if err := notif(tx, pengusul.id, "proposal_"+s.status, "Proposal "+s.status, `Proposal "`+judul+`" telah `+s.status, id, "proposal", created.Add(10*24*time.Hour)); err != nil {
			return 0, err
		}
	}

	if s.laporan != "" {
		if err := c.buatLaporan(tx, id, table, pengusul, s, judul, created.Add(12*24*time.Hour)); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit()
}

func (c *ctx) buatLaporan(tx *sql.Tx, pid int64, table string, pengusul user, s skenario, judul string, created time.Time) error {
	now := c.now
	var submitted, approved, catatan any
	if s.laporan != "draft" {
		submitted = created.Add(5 * 24 * time.Hour)
	}
	switch s.laporan {
	case "disetujui":
		approved = created.Add(9 * 24 * time.Hour)
	case "revisi":
		catatan = "Lengkapi bukti luaran poster dan rincian realisasi anggaran."
	case "ditolak":
		catatan = "Laporan tidak sesuai dengan proposal yang disetujui."
	}
	res, err := tx.Exec("INSERT INTO `Kegiatan` (`jenis`,`tipe`,`createdAt`) VALUES (?, 'laporan', ?)", s.jenis, created)
	if err != nil {
		return err
	}
	lid, _ := res.LastInsertId()
	extraCols, extraSel := "`skema`,`metodePenelitian`", "`skema`, 'Metode eksperimen dengan pengujian black-box dan evaluasi usability (SUS).'"
	if s.jenis == "pengabdian" {
		extraCols, extraSel = "`mitra`,`mitraJenis`,`mitraAlamat`,`mitraKontak`,`mitraKebutuhan`", "`mitra`,`mitraJenis`,`mitraAlamat`,`mitraKontak`,`mitraKebutuhan`"
	}
	var dokCols, dokSel string
	dokArgs := []any{}
	if s.laporan != "draft" {
		dokCols, dokSel = ",`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`dokumenBlob`", ",?,?,?,?"
		dokArgs = append(dokArgs, "Laporan - "+truncate(judul, 150)+".pdf", "application/pdf", len(pdfKecil), pdfKecil)
	}
	q := "INSERT INTO `" + table + "` (`id`,`tipe`,`proposalId`,`judul`,`abstrak`,`status`,`anggaran`,`luaran`,`rumpunIlmu`,`bidang`,`kataKunci`," +
		"`luaranTercapai`,`ringkasanHasil`,`realisasiAnggaran`," + extraCols + ",`catatanRevisi`,`pengusulId`,`periodeId`,`submittedAt`,`approvedAt`,`createdAt`,`updatedAt`" + dokCols + ")" +
		" SELECT ?, 'laporan', `id`, `judul`, `abstrak`, ?, `anggaran`, `luaran`, `rumpunIlmu`, `bidang`, `kataKunci`, ?, ?, ROUND(`anggaran` * 0.92, 2), " + extraSel +
		", ?, `pengusulId`, `periodeId`, ?, ?, ?, ?" + dokSel + " FROM `" + table + "` WHERE `id` = ?"
	args := []any{lid, s.laporan, "Artikel telah disubmit ke jurnal SINTA 4; poster dipresentasikan pada seminar nasional.",
		`Kegiatan "` + judul + `" telah dilaksanakan sesuai jadwal. Seluruh tahapan selesai dan hasil dimanfaatkan mitra/pengguna.`,
		catatan, submitted, approved, created, now}
	args = append(args, dokArgs...)
	args = append(args, pid)
	if _, err := tx.Exec(q, args...); err != nil {
		return err
	}
	if s.laporan != "draft" {
		if _, err := tx.Exec("UPDATE `LuaranKegiatan` SET `status` = 'tercapai', `tercapaiAt` = ?, `judulCapaian` = ?, `buktiUrl` = ?, `updatedAt` = ? WHERE `proposalId` = ?",
			created.Add(3*24*time.Hour), truncate("Capaian: "+judul, 191), fmt.Sprintf("https://jurnal.example.ac.id/artikel/%d", pid), now, pid); err != nil {
			return err
		}
		for _, k := range c.ketua {
			if err := notif(tx, k, "laporan_diajukan", "Laporan Diajukan", `Laporan "`+judul+`" telah diajukan dan menunggu penugasan reviewer`, lid, "laporan", submitted.(time.Time)); err != nil {
				return err
			}
		}
	}
	if s.laporan == "review" || s.laporan == "revisi" || s.laporan == "ditolak" || s.laporan == "disetujui" {
		rid := c.reviewer(pengusul.id)
		if rid != 0 {
			if _, err := tx.Exec("INSERT INTO `ReviewerTugasan` (`proposalId`,`reviewerId`,`createdAt`) VALUES (?,?,?)", lid, rid, created.Add(6*24*time.Hour)); err != nil {
				return err
			}
			rek, done := s.laporan, true
			if s.laporan == "review" {
				rek, done = "disetujui", false
			}
			if _, err := tx.Exec("INSERT INTO `ProposalReview` (`proposalId`,`reviewerId`,`nilaiRelevansi`,`nilaiMetodologi`,`nilaiAnggaran`,`nilaiLuaran`,`catatan`,`rekomendasi`,`isDone`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
				lid, rid, "84", "80", "83", "86", "Laporan sesuai rencana; periksa kelengkapan bukti luaran.", rek, done, created.Add(7*24*time.Hour), now); err != nil {
				return err
			}
		}
	}
	switch s.laporan {
	case "revisi", "ditolak", "disetujui":
		if err := notif(tx, pengusul.id, "laporan_"+s.laporan, "Laporan "+s.laporan, `Laporan "`+judul+`" telah `+s.laporan, lid, "laporan", created.Add(9*24*time.Hour)); err != nil {
			return err
		}
	}
	return nil
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
