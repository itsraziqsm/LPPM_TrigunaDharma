// Command seed fills an empty database with the roles, accounts and periods
// created by the Node seeder (src/config/seed.ts), so the Go backend can be
// used without Node. Existing accounts (same email) are left untouched.
//
// The Node seeder additionally generates random demo proposals, reviews and
// reports; those are not reproduced here.
package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"lppm-backend-go/internal/database"
)

type account struct {
	email, name, password string
	extra                 map[string]string
	roles                 []string
	status                string
}

func nidn(prefix string, i int) string { return fmt.Sprintf("%s%08d", prefix, i) }

func accounts() []account {
	prodiDosen := []string{"Teknik Informatika", "Sistem Informasi", "Sistem Komputer", "Teknik Elektro", "Manajemen Informatika"}
	prodiMhs := []string{"Teknik Informatika", "Sistem Informasi", "Sistem Komputer", "Manajemen Informatika"}
	list := []account{
		{"admin@lppm.dev", "Admin LPPM", "admin123456", map[string]string{"institusi": "Universitas LPPM"}, []string{"admin"}, "approved"},
		{"ketua@lppm.dev", "Dr. Ketua LPPM, M.Kom", "ketua123456", map[string]string{"nidn": nidn("99", 1), "institusi": "Universitas LPPM", "programStudi": "Teknik Informatika"}, []string{"ketua_lppm"}, "approved"},
		{"wakil.ketua@lppm.dev", "Dr. Wakil Ketua LPPM, M.T", "wakil123456", map[string]string{"nidn": nidn("98", 1), "institusi": "Universitas LPPM", "programStudi": "Sistem Informasi"}, []string{"ketua_lppm", "dosen"}, "approved"},
	}
	for i := 1; i <= 4; i++ {
		list = append(list, account{fmt.Sprintf("reviewer%d@lppm.dev", i), fmt.Sprintf("Dr. Reviewer %d, M.T", i), "reviewer123",
			map[string]string{"nidn": nidn("88", i), "institusi": "Universitas LPPM", "programStudi": prodiDosen[(i-1)%len(prodiDosen)]},
			[]string{"reviewer"}, "approved"})
	}
	list = append(list, account{"pending.reviewer@lppm.dev", "Calon Reviewer Baru", "pending123",
		map[string]string{"nidn": nidn("87", 1), "institusi": "Universitas LPPM", "programStudi": "Teknik Elektro"}, []string{"reviewer"}, "pending"})
	for i := 1; i <= 12; i++ {
		title := "Dr. "
		if i%3 == 0 {
			title = "Prof. "
		}
		suffix := ", M.T"
		if i%2 == 0 {
			suffix = ", M.Kom"
		}
		roles := []string{"dosen"}
		if i <= 3 {
			roles = []string{"dosen", "reviewer"}
		}
		list = append(list, account{fmt.Sprintf("dosen%d@lppm.dev", i), fmt.Sprintf("%sDosen %d%s", title, i, suffix), "dosen123456",
			map[string]string{"nidn": nidn("01", i), "institusi": "Universitas LPPM", "programStudi": prodiDosen[(i-1)%len(prodiDosen)],
				"alamat": fmt.Sprintf("Jl. Akademik No. %d, Medan", i*3), "kontak": fmt.Sprintf("0812000%05d", i)},
			roles, "approved"})
	}
	for i := 1; i <= 8; i++ {
		list = append(list, account{fmt.Sprintf("mahasiswa%d@lppm.dev", i), fmt.Sprintf("Mahasiswa %d", i), "mhs1234567",
			map[string]string{"nim": fmt.Sprintf("2021%06d", i), "prodi": prodiMhs[(i-1)%len(prodiMhs)], "noHp": fmt.Sprintf("0813000%05d", i)},
			[]string{"mahasiswa"}, "approved"})
	}
	list = append(list,
		account{"pending.dosen@lppm.dev", "Calon Dosen Baru", "pending123",
			map[string]string{"nidn": nidn("77", 1), "institusi": "Universitas LPPM", "programStudi": "Teknik Informatika"}, []string{"dosen"}, "pending"},
		account{"rejected.mhs@lppm.dev", "Mahasiswa Ditolak", "rejected123",
			map[string]string{"nim": "2021999999", "prodi": "Sistem Informasi"}, []string{"mahasiswa"}, "rejected"},
	)
	return list
}

func main() {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("load .env: %v", err)
	}
	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()
	now := time.Now().UTC().Truncate(time.Millisecond)

	fmt.Println("Membuat roles...")
	roleIDs := map[string]int64{}
	for _, name := range []string{"admin", "ketua_lppm", "dosen", "reviewer", "mahasiswa"} {
		if _, err := db.Exec("INSERT INTO `Role` (`name`,`createdAt`,`updatedAt`) SELECT ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `Role` WHERE `name` = ?)", name, now, now, name); err != nil {
			log.Fatalf("role %s: %v", name, err)
		}
		var id int64
		if err := db.QueryRow("SELECT `id` FROM `Role` WHERE `name` = ?", name).Scan(&id); err != nil {
			log.Fatalf("role %s: %v", name, err)
		}
		roleIDs[name] = id
		fmt.Println("  ✔ Role:", name)
	}

	fmt.Println("Membuat users...")
	for _, a := range accounts() {
		var existing int64
		err := db.QueryRow("SELECT `id` FROM `User` WHERE `email` = ?", a.email).Scan(&existing)
		if err == nil {
			fmt.Println("  • sudah ada:", a.email)
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			log.Fatalf("user %s: %v", a.email, err)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(a.password), 10)
		if err != nil {
			log.Fatal(err)
		}
		// emailVerifiedAt: akun demo dianggap sudah verifikasi email (W-18).
		cols := []string{"email", "name", "fullName", "password", "status", "emailVerifiedAt", "createdAt", "updatedAt"}
		args := []any{a.email, a.name, a.name, string(hash), a.status, now, now, now}
		for k, v := range a.extra {
			cols = append(cols, k)
			args = append(args, v)
		}
		quoted := make([]string, len(cols))
		for i, c := range cols {
			quoted[i] = "`" + c + "`"
		}
		tx, err := db.Begin()
		if err != nil {
			log.Fatal(err)
		}
		res, err := tx.Exec("INSERT INTO `User` ("+strings.Join(quoted, ",")+") VALUES ("+strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",")+")", args...)
		if err != nil {
			tx.Rollback()
			log.Fatalf("user %s: %v", a.email, err)
		}
		id, _ := res.LastInsertId()
		for _, r := range a.roles {
			if _, err := tx.Exec("INSERT INTO `UserRole` (`userId`,`roleId`,`createdAt`) VALUES (?,?,?)", id, roleIDs[r], now); err != nil {
				tx.Rollback()
				log.Fatalf("user role %s: %v", a.email, err)
			}
		}
		if err := tx.Commit(); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("  ✔ %s (%s, %s)\n", a.email, strings.Join(a.roles, "+"), a.status)
	}

	// Master program studi (W-19): nilai yang dipakai akun seed; yang sudah ada dilewati.
	fmt.Println("Membuat program studi...")
	for _, nama := range []string{"Manajemen Informatika", "Sistem Informasi", "Sistem Komputer", "Teknik Elektro", "Teknik Informatika"} {
		if _, err := db.Exec("INSERT IGNORE INTO `ProgramStudi` (`nama`,`jenjang`,`isAktif`,`createdAt`,`updatedAt`) VALUES (?,NULL,true,?,?)", nama, now, now); err != nil {
			log.Fatalf("program studi %s: %v", nama, err)
		}
	}

	var periodeCount int64
	if err := db.QueryRow("SELECT COUNT(*) FROM `Periode`").Scan(&periodeCount); err != nil {
		log.Fatal(err)
	}
	if periodeCount > 0 {
		fmt.Println("Periode sudah ada, dilewati.")
		return
	}
	fmt.Println("Membuat periode...")
	date := func(s string) time.Time { t, _ := time.Parse("2006-01-02", s); return t }
	days := func(n int) time.Time { return time.Now().AddDate(0, 0, n).UTC().Truncate(time.Millisecond) }
	periodes := []struct {
		nama       string
		tahun      int
		jenis      string
		mulai, end time.Time
		aktif      bool
	}{
		{"Penelitian Semester Ganjil 2024", 2024, "penelitian", date("2024-08-01"), date("2024-12-31"), false},
		{"Pengabdian Semester Ganjil 2024", 2024, "pengabdian", date("2024-08-01"), date("2024-12-31"), false},
		{"Penelitian Semester Genap 2025", 2025, "penelitian", date("2025-02-01"), date("2025-07-31"), false},
		{"Pengabdian Semester Genap 2025", 2025, "pengabdian", date("2025-02-01"), date("2025-07-31"), false},
		{"Penelitian Semester Ganjil 2025", 2025, "penelitian", days(-30), days(150), true},
		{"Pengabdian Semester Ganjil 2025", 2025, "pengabdian", days(-30), days(150), true},
		{"Penelitian Semester Genap 2026", 2026, "penelitian", days(60), days(240), false},
	}
	for _, p := range periodes {
		if _, err := db.Exec("INSERT INTO `Periode` (`nama`,`tahun`,`jenis`,`tanggalMulai`,`tanggalSelesai`,`isAktif`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?)",
			p.nama, p.tahun, p.jenis, p.mulai, p.end, p.aktif, now, now); err != nil {
			log.Fatalf("periode %s: %v", p.nama, err)
		}
		fmt.Printf("  ✔ %s (aktif: %v)\n", p.nama, p.aktif)
	}
	fmt.Println("Seeding selesai.")
}
