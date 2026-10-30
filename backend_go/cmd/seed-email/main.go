// Command seed-email membuat 6 akun contoh @email.com, satu untuk setiap peran:
//
//	go run ./cmd/seed-email
//
// Aman diulang: akun yang emailnya sudah ada dilewati. Jalankan setelah `go run ./cmd/migrate`
// (peran ketua_stmik dibuat oleh migrasi 20261103000000_role_ketua_stmik).
// Akun berstatus approved dan dianggap sudah verifikasi email. Ganti password setelah dipakai
// di server sungguhan.
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
	"lppm-backend-go/internal/sqlb"
)

type account struct {
	email, name, password string
	extra                 map[string]string
	roles                 []string
}

var accounts = []account{
	{"admin@email.com", "Admin LPPM", "admin123456", nil, []string{"admin"}},
	{"ketua@email.com", "Ketua LPPM", "ketua123456",
		map[string]string{"nidn": "6600000001", "institusi": "STMIK Triguna Dharma", "programStudi": "Sistem Informasi"}, []string{"ketua_lppm"}},
	{"ketuastmik@email.com", "Ketua STMIK Triguna Dharma", "ketuastmik123",
		map[string]string{"nidn": "6600000002", "institusi": "STMIK Triguna Dharma"}, []string{"ketua_stmik"}},
	{"dosen@email.com", "Dosen STMIK", "dosen123456",
		map[string]string{"nidn": "6600000003", "institusi": "STMIK Triguna Dharma", "programStudi": "Teknik Informatika"}, []string{"dosen"}},
	{"reviewer@email.com", "Reviewer LPPM", "reviewer123",
		map[string]string{"nidn": "6600000004", "institusi": "STMIK Triguna Dharma", "programStudi": "Sistem Komputer"}, []string{"reviewer"}},
	{"mahasiswa@email.com", "Mahasiswa STMIK", "mhs1234567",
		map[string]string{"nim": "2026000001", "prodi": "Sistem Informasi"}, []string{"mahasiswa"}},
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

	roleIDs := map[string]int64{}
	for _, a := range accounts {
		for _, r := range a.roles {
			if _, ok := roleIDs[r]; ok {
				continue
			}
			var id int64
			err := db.QueryRow("SELECT `id` FROM `Role` WHERE `name` = ?", r).Scan(&id)
			if errors.Is(err, sql.ErrNoRows) {
				log.Fatalf("peran %q belum ada: jalankan `go run ./cmd/migrate` (dan `go run ./cmd/seed` untuk peran dasar) dulu", r)
			}
			if err != nil {
				log.Fatalf("peran %s: %v", r, err)
			}
			roleIDs[r] = id
		}
	}

	fmt.Println("Membuat akun @email.com...")
	for _, a := range accounts {
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
		cols := []string{"email", "name", "fullName", "password", "status", "emailVerifiedAt", "createdAt", "updatedAt"}
		args := []any{a.email, a.name, a.name, string(hash), "approved", now, now, now}
		for k, v := range a.extra {
			cols = append(cols, k)
			args = append(args, v)
		}
		tx, err := db.Begin()
		if err != nil {
			log.Fatal(err)
		}
		res, err := tx.Exec(sqlb.Insert("User", cols), args...)
		if err != nil {
			_ = tx.Rollback()
			log.Fatalf("user %s: %v", a.email, err)
		}
		id, _ := res.LastInsertId()
		for _, r := range a.roles {
			if _, err := tx.Exec("INSERT INTO `UserRole` (`userId`,`roleId`,`createdAt`) VALUES (?,?,?)", id, roleIDs[r], now); err != nil {
				_ = tx.Rollback()
				log.Fatalf("user role %s: %v", a.email, err)
			}
		}
		if err := tx.Commit(); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("  ✔ %-22s %-12s password: %s\n", a.email, strings.Join(a.roles, "+"), a.password)
	}
	fmt.Println("Selesai.")
}
