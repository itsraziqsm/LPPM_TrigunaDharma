// Command migrate applies the SQL migrations in ./migrations (copied from
// the Node project's prisma/migrations) and records them in the
// `_prisma_migrations` table exactly like `prisma migrate deploy`, so both
// tools stay interchangeable on the same database.
//
//	go run ./cmd/migrate            # apply pending migrations
//	go run ./cmd/migrate -status    # list applied / pending migrations
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path"
	"sort"
	"time"

	"github.com/joho/godotenv"

	"lppm-backend-go/internal/database"
)

const createTable = "CREATE TABLE IF NOT EXISTS `_prisma_migrations` (" +
	"`id` VARCHAR(36) PRIMARY KEY NOT NULL," +
	"`checksum` VARCHAR(64) NOT NULL," +
	"`finished_at` DATETIME(3)," +
	"`migration_name` VARCHAR(255) NOT NULL," +
	"`logs` TEXT," +
	"`rolled_back_at` DATETIME(3)," +
	"`started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)," +
	"`applied_steps_count` INTEGER UNSIGNED NOT NULL DEFAULT 0" +
	") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

func uuid() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

func main() {
	dir := flag.String("dir", "migrations", "directory containing <timestamp>_<name>/migration.sql")
	statusOnly := flag.Bool("status", false, "only print the migration status")
	flag.Parse()

	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("load .env: %v", err)
	}
	db, err := database.OpenMultiStatements(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(createTable); err != nil {
		log.Fatalf("create _prisma_migrations: %v", err)
	}

	// Semua berkas migrasi dibaca lewat os.Root: tidak bisa keluar dari folder migrasi.
	root, err := os.OpenRoot(*dir)
	if err != nil {
		log.Fatalf("read %s: %v", *dir, err)
	}
	defer func() { _ = root.Close() }()
	migrations := root.FS()
	entries, err := fs.ReadDir(migrations, ".")
	if err != nil {
		log.Fatalf("read %s: %v", *dir, err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			if _, err := fs.Stat(migrations, path.Join(e.Name(), "migration.sql")); err == nil {
				names = append(names, e.Name())
			}
		}
	}
	sort.Strings(names)

	applied := 0
	for _, name := range names {
		script, err := fs.ReadFile(migrations, path.Join(name, "migration.sql"))
		if err != nil {
			log.Fatal(err)
		}
		sum := sha256.Sum256(script)
		checksum := hex.EncodeToString(sum[:])

		var finished sql.NullTime
		var storedChecksum string
		err = db.QueryRow("SELECT `finished_at`, `checksum` FROM `_prisma_migrations` WHERE `migration_name` = ? AND `rolled_back_at` IS NULL ORDER BY `started_at` DESC LIMIT 1", name).
			Scan(&finished, &storedChecksum)
		switch {
		case err == nil && finished.Valid:
			if *statusOnly {
				fmt.Println("applied  ", name)
			}
			if storedChecksum != checksum {
				fmt.Printf("warning: %s was modified after it was applied\n", name)
			}
			continue
		case err == nil:
			log.Fatalf("migration %s previously failed; fix the database and mark it resolved (prisma migrate resolve) before continuing", name)
		case !errors.Is(err, sql.ErrNoRows):
			log.Fatal(err)
		}
		if *statusOnly {
			fmt.Println("pending  ", name)
			continue
		}

		id := uuid()
		started := time.Now().UTC().Truncate(time.Millisecond)
		if _, err := db.Exec("INSERT INTO `_prisma_migrations` (`id`,`checksum`,`migration_name`,`started_at`,`applied_steps_count`) VALUES (?,?,?,?,0)",
			id, checksum, name, started); err != nil {
			log.Fatal(err)
		}
		if _, err := db.Exec(string(script)); err != nil {
			_, _ = db.Exec("UPDATE `_prisma_migrations` SET `logs` = ? WHERE `id` = ?", err.Error(), id)
			log.Fatalf("migration %s failed: %v", name, err)
		}
		if _, err := db.Exec("UPDATE `_prisma_migrations` SET `finished_at` = ?, `applied_steps_count` = 1 WHERE `id` = ?",
			time.Now().UTC().Truncate(time.Millisecond), id); err != nil {
			log.Fatal(err)
		}
		fmt.Println("applied  ", name)
		applied++
	}
	if !*statusOnly {
		fmt.Printf("%d migration(s) applied, database is up to date.\n", applied)
	}
}
