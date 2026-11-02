// Command truncate-data mengosongkan SELURUH data aplikasi kecuali akun user, untuk menguji
// ulang alur dari awal (login tetap bisa dengan email & password yang sama).
//
//	go run ./cmd/truncate-data                  # pratinjau: tabel & jumlah baris yang akan dihapus
//	go run ./cmd/truncate-data -yes             # hapus permanen
//	go run ./cmd/truncate-data -yes -produksi   # wajib bila NODE_ENV=production
//
// Dipertahankan: `User`, `UserRole`, `Role` (peran wajib ada untuk login/hak akses) dan
// `_prisma_migrations` (status migrasi). Semua tabel lain di database di-TRUNCATE (id mulai
// lagi dari 1), termasuk proposal/laporan, review, notifikasi, log aktivitas, periode, master
// data (program studi, rumpun ilmu, bidang, luaran, jenis mitra), foto profil, pengaturan,
// template proposal, surat tugas, log backup, refresh token, dan token reset/verifikasi —
// semua user harus login ulang. Penanda `wajibGantiPassword` dikosongkan.
// Tabel baru dari migrasi berikutnya otomatis ikut dikosongkan (daftar diambil dari database).
// File backup .sql.gz di BACKUP_DIR tidak disentuh. VIEW (`Proposal`, `Laporan`) tidak diubah.
//
// BACKUP database dulu: penghapusan tidak bisa dibatalkan.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"

	"github.com/joho/godotenv"

	"lppm-backend-go/internal/database"
	"lppm-backend-go/internal/sqlb"
)

var dipertahankan = map[string]bool{"User": true, "UserRole": true, "Role": true, "_prisma_migrations": true}

func main() {
	yes := flag.Bool("yes", false, "benar-benar menghapus (tanpa flag ini hanya pratinjau)")
	produksi := flag.Bool("produksi", false, "izinkan berjalan saat NODE_ENV=production")
	flag.Parse()

	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("load .env: %v", err)
	}
	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()
	ctx := context.Background()

	var dbName string
	if err := db.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&dbName); err != nil {
		log.Fatal(err)
	}
	tabel, err := daftarTabel(ctx, db)
	if err != nil {
		log.Fatal(err)
	}
	var users int64
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM `User`").Scan(&users); err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Database: %s\nDipertahankan: User (%d akun), UserRole, Role, _prisma_migrations\n\nAkan dikosongkan (%d tabel):\n", dbName, users, len(tabel))
	total, err := hitungBaris(ctx, db, tabel)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("  %-30s %8d baris\n", "Total", total)

	if !*yes {
		fmt.Println("\nMode pratinjau: tidak ada yang dihapus. Jalankan ulang dengan -yes untuk menghapus permanen.")
		return
	}
	if os.Getenv("NODE_ENV") == "production" && !*produksi {
		log.Fatal("NODE_ENV=production: tambahkan -produksi bila benar-benar ingin mengosongkan database produksi.")
	}
	if err := kosongkan(ctx, db, tabel); err != nil {
		log.Fatalf("gagal mengosongkan: %v", err)
	}
	fmt.Printf("\nSelesai: %d tabel dikosongkan (%d baris), %d akun user dipertahankan. Semua user perlu login ulang.\n", len(tabel), total, users)
}

// daftarTabel: semua BASE TABLE di database aktif kecuali yang dipertahankan.
func daftarTabel(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, "SELECT `TABLE_NAME` FROM information_schema.`TABLES` WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_TYPE` = 'BASE TABLE'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		if !dipertahankan[t] {
			out = append(out, t)
		}
	}
	sort.Strings(out)
	return out, rows.Err()
}

// hitungBaris mencetak jumlah baris tiap tabel (nama tabel dari metadata database) dan totalnya.
func hitungBaris(ctx context.Context, db *sql.DB, tabel []string) (int64, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	var total int64
	for _, t := range tabel {
		var n int64
		if err := conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+sqlb.QuoteAny(t)).Scan(&n); err != nil {
			return 0, fmt.Errorf("hitung %s: %w", t, err)
		}
		total += n
		fmt.Printf("  • %-28s %8d baris\n", t, n)
	}
	return total, nil
}

// kosongkan men-TRUNCATE tabel dengan pemeriksaan foreign key dimatikan pada satu koneksi
// (TRUNCATE tidak bisa di-rollback; dijalankan berurutan).
func kosongkan(ctx context.Context, db *sql.DB, tabel []string) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "SET FOREIGN_KEY_CHECKS = 0"); err != nil {
		return err
	}
	defer func() { _, _ = conn.ExecContext(context.Background(), "SET FOREIGN_KEY_CHECKS = 1") }()
	for _, t := range tabel {
		if _, err := conn.ExecContext(ctx, "TRUNCATE TABLE "+sqlb.QuoteAny(t)); err != nil {
			return fmt.Errorf("truncate %s: %w", t, err)
		}
		fmt.Printf("  ✔ %s\n", t)
	}
	_, err = conn.ExecContext(ctx, "UPDATE `User` SET `wajibGantiPassword` = false WHERE `wajibGantiPassword` = true")
	return err
}
