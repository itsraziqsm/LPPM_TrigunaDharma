// Command hapus-proposal-mahasiswa menghapus semua proposal yang ketua pengusulnya
// mahasiswa (user berperan `mahasiswa` dan tidak berperan `dosen`). Mahasiswa tidak lagi
// boleh mengusulkan proposal; tugasnya hanya laporan harian.
//
//	go run ./cmd/hapus-proposal-mahasiswa        # hanya tampilkan daftar (tidak menghapus)
//	go run ./cmd/hapus-proposal-mahasiswa -yes   # hapus permanen
//
// Yang ikut terhapus per proposal (dalam satu transaksi):
//   - laporan (tipe 'laporan') milik proposal itu beserta tugasan & review laporan;
//   - anggota, tugasan reviewer, review, laporan kemajuan/akhir, dokumen lampiran,
//     laporan harian, item luaran (semuanya lewat ON DELETE CASCADE dari `Kegiatan`);
//   - notifikasi yang merujuk proposal/laporan tersebut.
//
// Log aktivitas tetap disimpan (kolom proposalId otomatis menjadi NULL).
// BACKUP database dulu (mysqldump): penghapusan tidak bisa dibatalkan.
package main

import (
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"

	"lppm-backend-go/internal/database"
	"lppm-backend-go/internal/sqlb"
)

type target struct {
	id                         int64
	jenis, judul, status, nama string
	laporan                    []int64
}

func main() {
	yes := flag.Bool("yes", false, "benar-benar menghapus (tanpa flag ini hanya menampilkan daftar)")
	flag.Parse()

	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("load .env: %v", err)
	}
	db, err := database.Open(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	targets, err := findTargets(db)
	if err != nil {
		log.Fatal(err)
	}
	if len(targets) == 0 {
		fmt.Println("Tidak ada proposal dengan ketua pengusul mahasiswa. Tidak ada yang dihapus.")
		return
	}
	totalLaporan := 0
	fmt.Printf("Ditemukan %d proposal dengan ketua pengusul mahasiswa:\n", len(targets))
	for _, t := range targets {
		totalLaporan += len(t.laporan)
		fmt.Printf("  • %s #%d [%s] \"%s\" (pengusul: %s, laporan: %d)\n", t.jenis, t.id, t.status, t.judul, t.nama, len(t.laporan))
	}
	if !*yes {
		fmt.Println("\nMode pratinjau: tidak ada yang dihapus. Jalankan ulang dengan -yes untuk menghapus permanen.")
		return
	}
	if err := deleteTargets(db, targets); err != nil {
		log.Fatalf("gagal menghapus (tidak ada perubahan, transaksi dibatalkan): %v", err)
	}
	fmt.Printf("\nSelesai: %d proposal dan %d laporan terkait dihapus.\n", len(targets), totalLaporan)
}

func findTargets(db *sql.DB) ([]target, error) {
	var out []target
	if err := eachRow(db, "SELECT p.`id`,p.`jenis`,p.`judul`,p.`status`,COALESCE(u.`fullName`,u.`name`) FROM `Proposal` p JOIN `User` u ON u.`id` = p.`pengusulId`"+
		" WHERE EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`name` = 'mahasiswa')"+
		" AND NOT EXISTS (SELECT 1 FROM `UserRole` ur JOIN `Role` r ON r.`id` = ur.`roleId` WHERE ur.`userId` = u.`id` AND r.`name` = 'dosen')"+
		" ORDER BY p.`id`", func(rows *sql.Rows) error {
		var t target
		if err := rows.Scan(&t.id, &t.jenis, &t.judul, &t.status, &t.nama); err != nil {
			return err
		}
		out = append(out, t)
		return nil
	}); err != nil {
		return nil, err
	}
	for i := range out {
		if err := eachRow(db, "SELECT `id` FROM `Laporan` WHERE `proposalId` = ?", func(rows *sql.Rows) error {
			var id int64
			if err := rows.Scan(&id); err != nil {
				return err
			}
			out[i].laporan = append(out[i].laporan, id)
			return nil
		}, out[i].id); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// eachRow menjalankan query lalu memanggil scan untuk setiap baris; rows selalu ditutup.
func eachRow(db *sql.DB, query string, scan func(*sql.Rows) error, args ...any) error {
	rows, err := db.Query(query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := scan(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

func deleteTargets(db *sql.DB, targets []target) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op after commit
	for _, t := range targets {
		ids := append([]int64{}, t.laporan...)
		ids = append(ids, t.id)
		args := make([]any, len(ids))
		for i, id := range ids {
			args[i] = id
		}
		if _, err := tx.Exec(sqlb.In("DELETE FROM `Notification` WHERE `refType` IN ('proposal','laporan') AND `refId` IN (?*)", len(ids)), args...); err != nil {
			return err
		}
		// Laporan dulu: baris Kegiatan laporan tidak ikut terhapus oleh CASCADE proposal.
		for _, lid := range t.laporan {
			if _, err := tx.Exec("DELETE FROM `Kegiatan` WHERE `id` = ?", lid); err != nil {
				return err
			}
		}
		if _, err := tx.Exec("DELETE FROM `Kegiatan` WHERE `id` = ?", t.id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
