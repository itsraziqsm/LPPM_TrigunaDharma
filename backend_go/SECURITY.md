# Keamanan & Pemindaian Backend

Dokumen ini mencatat hasil pemindaian keamanan backend Go (gosec + govulncheck), apa yang
diperbaiki, dan aturan yang harus diikuti agar temuan yang sama tidak muncul lagi.

## Ringkasan

| Alat | Sebelum | Sesudah |
|---|---|---|
| `gosec ./...` (analisis kode) | 73 temuan | **0 temuan**, tanpa satu pun `#nosec` |
| `govulncheck ./...` (dependensi & stdlib) | 0 memengaruhi kode, 1 di paket yang diimpor, 20 di modul | 0 memengaruhi kode, 0 di paket yang diimpor, 1 di modul (lihat [Sisa yang diterima](#sisa-yang-diterima)) |

Semua unit test dan 766 cek E2E (`scripts/e2e.py`) tetap lolos, di database lama maupun database
baru yang dimigrasi dari nol.

## Cara menjalankan

Pasang alat sekali:

```bash
go install github.com/securego/gosec/v2/cmd/gosec@latest
go install golang.org/x/vuln/cmd/govulncheck@latest
```

Lalu dari folder `backend_go/`:

```bash
sh scripts/security-scan.sh        # go vet + go test + gosec + govulncheck, keluar ≠ 0 bila ada temuan
# atau satu per satu:
gosec ./...
govulncheck ./...                  # ringkas
govulncheck -show verbose ./...    # rinci: tiap kerentanan + versi perbaikannya
```

Jalankan sebelum push (lihat "Konvensi kerja" di `CLAUDE.md`) dan setiap kali menambah/menaikkan
dependensi.

## Versi Go & dependensi

| Komponen | Sebelum | Sesudah | Alasan |
|---|---|---|---|
| Direktif `go` di `go.mod` | 1.23.0 | **1.26.0** | dibutuhkan `golang.org/x/crypto` ≥ v0.56.0; Go 1.23 sudah tidak didukung (tidak dapat patch keamanan stdlib) |
| `toolchain` di `go.mod` | go1.23.12 | **go1.26.10** | patch terbaru Go 1.26; dengan `GOTOOLCHAIN=auto`, `go` mengunduhnya otomatis |
| `golang.org/x/crypto` | v0.39.0 | **v0.58.0** | menutup 19 kerentanan modul (`ssh`, `ssh/agent`, `ssh/knownhosts`); backend hanya memakai `bcrypt` |
| `filippo.io/edwards25519` (tidak langsung, lewat driver MySQL) | v1.1.0 | **v1.1.1** | GO-2026-4503 (paket ini diimpor) |
| Docker builder | `golang:1.23-alpine` | **`golang:1.26-alpine`** | image resmi memakai `GOTOOLCHAIN=local`, jadi harus ≥ versi di `go.mod` |
| Docker runtime | `alpine:3.20` | **`alpine:3.22`** | Alpine 3.20 sudah habis masa dukungannya |

Untuk build di laptop dibutuhkan Go **1.26 atau lebih baru** (atau Go lama dengan `GOTOOLCHAIN=auto`,
yang otomatis mengunduh go1.26.10).

## Temuan gosec dan perbaikannya

| Aturan | Jumlah | Risiko | Perbaikan |
|---|---|---|---|
| **G202** SQL dirangkai dengan string | 22 | SQL injection bila bagian yang dirangkai berasal dari input | Paket baru **`internal/sqlb`** membangun query dinamis: nilai selalu lewat placeholder `?`, nama tabel/kolom divalidasi pola `^[A-Za-z_][A-Za-z0-9_]*$` lalu diberi backtick (tidak valid → panic, karena itu bug pemrograman). Semua INSERT/UPDATE dengan kolom opsional, `IN (...)`, dan insert banyak baris di handler & alat CLI kini memakai `sqlb`. Seed laporan tidak lagi memakai `INSERT … SELECT` dengan potongan SQL dinamis. |
| **G104** error tidak ditangani | 40 | resource bocor / kegagalan diam-diam | Penutupan pada jalur error ditulis eksplisit `_ = x.Close()`; ditambah pemeriksaan `rows.Err()` setelah loop; alat CLI memakai helper `eachRow` dengan `defer rows.Close()`; penulisan dump backup memakai sifat error *sticky* `bufio.Writer` yang diperiksa sekali di `Flush()`. |
| **G304** path file dari variabel | 3 | path traversal (`../`) | File backup dibuka, ditulis, di-rename, dan dihapus lewat **`os.Root`** pada `BACKUP_DIR`, sehingga tidak bisa keluar dari folder itu. `cmd/migrate` membaca migrasi lewat `os.Root(...).FS()`. |
| **G302** izin file terlalu longgar | 2 | file backup (berisi seluruh data) & log akses bisa dibaca user lain di server | File backup dan `logs/access.log` dibuat **0600**; log akses lama ikut di-`chmod 0600` saat server start. |
| **G401 + G505** SHA-1 | 2 | primitive kriptografi lemah | ETag kini memakai **SHA-256** (format tetap `W/"<panjang hex>-<27 karakter>"`). ETag bukan fitur keamanan dan bersifat opak bagi klien, jadi 304 tetap berjalan. |
| **G101** kredensial tertanam | 1 | — (hash dummy untuk login) | Hash dummy untuk menyamakan waktu respons login saat email tidak terdaftar kini **dibuat saat runtime** dari password acak (`crypto/rand`) dengan biaya bcrypt yang sama (12), sekali saja dan disiapkan di latar saat server start. |
| **G115** konversi `uint64` → `int64` | 1 | overflow | Dicek batasnya dulu; nilai di atas `MaxInt64` dikembalikan apa adanya, tidak dipotong. |
| **G602** indeks slice di luar batas | 2 | — (false positive) | `stripInternal`/`nestColumns` dirapikan menjadi helper per objek (`withoutInternal`, `nestPrefixed`); perilaku sama, analisis gosec tidak lagi salah membaca. |

## Aturan untuk kode baru

1. **SQL dinamis wajib lewat `internal/sqlb`.** Jangan merangkai teks query dengan `+`/`fmt.Sprintf`
   dari variabel. Nilai selalu `?` + argumen. Contoh:

   ```go
   cols = append(cols, "updatedAt")
   args = append(args, s.nowMs(), id)
   _, err := s.db.ExecContext(ctx, sqlb.UpdateByID("Periode", cols), args...)

   q := sqlb.In("DELETE FROM `Notification` WHERE `refId` IN (?*)", len(ids))
   ```

   | Fungsi | Hasil |
   |---|---|
   | `sqlb.Insert(table, cols)` | ``INSERT INTO `t` (`a`,`b`) VALUES (?,?)`` |
   | `sqlb.InsertIgnoreRows(table, cols, n)` | ``INSERT IGNORE INTO `t` (…) VALUES (?,?),(?,?)`` untuk n baris |
   | `sqlb.UpdateByID(table, cols)` | ``UPDATE `t` SET `a` = ?, `b` = ? WHERE `id` = ?`` |
   | `sqlb.In(query, n)` | mengganti penanda `(?*)` dengan `(?,?,…)` |
   | `sqlb.Ident(name)` / `sqlb.QuoteAny(name)` | identifier tervalidasi / identifier dari metadata DB (backtick di-escape) |

   Query dengan teks tetap atau diawali konstanta (`const …Select = "SELECT …"` + kondisi berisi `?`)
   tetap boleh.
2. **Akses file lewat `os.Root`** bila nama file berasal dari data (database, request).
3. **File berisi data sensitif dibuat 0600**, folder 0750.
4. **Tangani error**, termasuk `rows.Err()` setelah iterasi; abaikan hanya penutupan di jalur error
   dengan `_ =` yang eksplisit.
5. **Jangan menulis kredensial/hash/secret di kode**; ambil dari env atau buat saat runtime.
6. **Kriptografi**: password memakai bcrypt (`hashPassword`), hash umum memakai SHA-256 ke atas,
   token acak memakai `crypto/rand`.
7. Jalankan `sh scripts/security-scan.sh` sebelum push. Bila gosec memberi false positive yang
   benar-benar tidak bisa dihindari, pakai `// #nosec Gxxx -- alasan` di baris itu dan catat di sini.

## Sisa yang diterima

| ID | Modul | Status |
|---|---|---|
| GO-2026-5932 | `golang.org/x/crypto/openpgp` (tidak dirawat, tidak ada versi perbaikan) | Hanya tingkat **modul**: paket `openpgp` tidak diimpor backend (yang dipakai hanya `x/crypto/bcrypt`), jadi `govulncheck` melaporkan "doesn't appear to call". Tidak bisa hilang selama memakai modul `x/crypto`. |

## Catatan saat memperbarui server

- **Build butuh Go 1.26+.** Docker: `docker compose up --build` (image sudah dinaikkan).
- **File lama tidak otomatis diperketat** kecuali `logs/access.log`. Untuk backup lama:
  `chmod 600 backups/*.sql.gz`.
- File backup 0600 hanya bisa dibaca user yang menjalankan server; bila backup disalin oleh user
  lain (mis. cron), atur `chown`/grup sesuai kebutuhan.
- **ETag berubah sekali** (SHA-1 → SHA-256): peramban akan menerima 200, bukan 304, satu kali per
  halaman setelah update; setelah itu normal.

## Di luar cakupan pemindaian ini

gosec dan govulncheck tidak memeriksa konfigurasi deploy. Untuk produksi tetap perhatikan: HTTPS,
`CORS_ORIGIN` diisi alamat frontend (bukan `*`), JWT secret kuat, `NODE_ENV=production`,
`TRUST_PROXY` sesuai, MySQL tidak dibuka ke internet, header Content-Security-Policy di sisi frontend,
dan endpoint publik `GET /users/:id/foto` yang memakai ID berurutan (lihat diskusi URL acak).
