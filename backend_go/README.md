# LPPM Backend (Go)

Port backend Node.js/Express (`backend/`) ke Go. API, database, dan
format respons **dibuat sama persis** dengan versi Node, sehingga frontend
tidak perlu diubah: cukup arahkan base URL ke server Go.

- Semua 73 endpoint `/api/v1/...` (+ `/health`) dengan urutan route, role, pesan, dan
  status code yang sama (termasuk perilaku "aneh" Node seperti error
  "Proposal tidak ditemukan" yang dikembalikan sebagai HTTP 500).
- Pakai **database MySQL yang sama** (skema Prisma, tabel & kolom sama).
  Tanggal disimpan dalam UTC seperti Prisma, jadi data lama dan baru konsisten.
- JSON dibentuk seperti output Prisma: urutan field sama, tanggal
  `2026-05-16T04:53:59.000Z`, `anggaran` (Decimal) sebagai string `"15000000"`,
  boolean `true/false`.
- Token JWT kompatibel dua arah (payload `{userId, email, roles}`, HS256).
  Jika `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` sama, user yang sudah login
  di backend Node tidak perlu login ulang. Hash password bcrypt juga kompatibel.
- Validasi meniru zod (respon 422 `{"errors": {"field": ["pesan"]}}` dengan
  pesan yang sama), helmet, CORS, rate limit, ETag/304, access log format
  "combined" di `logs/access.log` (bisa dibaca GoAccess seperti sebelumnya).
- Upload PDF/DOCX (maks 10 MB, field `file`) dengan validasi magic-bytes.

> **Sejak migrasi `20261024000000_split_proposal_penelitian_pengabdian`** backend Go adalah
> satu-satunya backend: tabel `Proposal` dipecah menjadi `Penelitian` dan `Pengabdian`
> (+ registri id `Kegiatan`, VIEW `Proposal` dan `Laporan`), sehingga backend Node/Prisma
> lama tidak bisa lagi memakai database ini. Endpoint lama tetap kompatibel (ditambah field
> `tipe` dan `luaran`), dan ada fitur baru **laporan** di `/api/v1/laporan`.
> Dokumentasi API baru untuk frontend: [`new-api.md`](new-api.md).

## Menjalankan

Butuh Go 1.23+ dan MySQL/MariaDB.

```bash
cp .env.example .env          # isi DATABASE_URL & JWT secret (bisa salin dari .env Node)
go mod download
go run ./cmd/migrate          # buat/upgrade tabel (setara `npx prisma migrate deploy`)
go run ./cmd/seed             # opsional: role + akun demo + periode
go run ./cmd/seed-tahap-1     # opsional: laporan contoh untuk proposal yang sudah disetujui
go run ./cmd/server           # server di PORT (default 3000)
```

Build binary produksi:

```bash
go build -o bin/server ./cmd/server
go build -o bin/migrate ./cmd/migrate
go build -o bin/seed ./cmd/seed
```

Atau dengan Docker: `docker compose up --build` (migrasi otomatis dijalankan
saat container start).

### Pakai database yang sudah ada dari backend Node

Tidak perlu migrasi ulang. `cmd/migrate` membaca tabel `_prisma_migrations`
yang sama dengan Prisma, jadi migrasi yang sudah diterapkan oleh Prisma akan
dilewati. Cek status: `go run ./cmd/migrate -status`.

**Backup dulu** (`mysqldump`) sebelum menerapkan migrasi pemecahan tabel
`20261024000000_split_proposal_penelitian_pengabdian`: DDL MySQL tidak transaksional,
jadi jika gagal di tengah, pulihkan dari backup. Data proposal lama dipindah apa adanya
(id sama, `tipe = 'proposal'`). Setelah migrasi ini, jangan jalankan lagi backend Node
terhadap database tersebut.

### Akun dari `cmd/seed`

Sama dengan seeder Node: `admin@lppm.dev / admin123456`,
`ketua@lppm.dev / ketua123456`, `reviewer1@lppm.dev / reviewer123`,
`dosen1@lppm.dev / dosen123456`, `mahasiswa1@lppm.dev / mhs1234567`, dst.
(Seeder Go tidak membuat proposal/review demo acak seperti seeder Node.)

### Backup database

Server membuat backup penuh (`.sql.gz`, struktur + data + blob + VIEW, snapshot konsisten, tanpa
butuh `mysqldump`) **sebulan sekali** dan admin bisa backup kapan saja lewat `/api/v1/backup`.
Log di tabel `BackupLog`, file di `BACKUP_DIR`.

| Env | Default | Arti |
|---|---|---|
| `BACKUP_OTOMATIS` | `true` | `false` mematikan backup terjadwal (manual tetap bisa) |
| `BACKUP_DIR` | `backups` | folder file backup (Docker: volume `backup_data` di `/app/backups`) |
| `BACKUP_HARI` | `1` | tanggal 1–28 |
| `BACKUP_JAM` | `2` | jam 0–23 |
| `BACKUP_ZONA` | `Asia/Jakarta` | zona waktu jadwal |

Bila server mati saat jadwal, backup bulan itu dibuat begitu server menyala (dicek tiap 10 menit).
Hanya satu backup berjalan per database (`GET_LOCK`). Log `berjalan` sisa server mati ditandai
`gagal` saat start. Memulihkan: `gunzip < file.sql.gz | mysql -u <user> -p <database>`.

### Hapus proposal yang pengusulnya mahasiswa

Mahasiswa tidak lagi boleh mengusulkan proposal (tugasnya laporan harian). Untuk membersihkan
data lama:

```bash
go run ./cmd/hapus-proposal-mahasiswa        # pratinjau: daftar proposal yang akan dihapus
go run ./cmd/hapus-proposal-mahasiswa -yes   # hapus permanen (BACKUP dulu)
```

"Pengusul mahasiswa" = user berperan `mahasiswa` dan tidak berperan `dosen`. Per proposal, dalam
satu transaksi: laporan turunannya (beserta tugasan/review laporan), anggota, tugasan, review,
laporan kemajuan/akhir, dokumen, laporan harian, item luaran (CASCADE dari `Kegiatan`), dan
notifikasi yang merujuknya ikut dihapus; log aktivitas tetap (proposalId menjadi NULL).
Di Docker: `docker compose exec app /app/hapus-proposal-mahasiswa -yes`.

### Seed tahap 1: laporan atas proposal disetujui

```bash
go run ./cmd/seed-tahap-1                # status laporan campur (draft → diajukan → review → revisi → disetujui)
go run ./cmd/seed-tahap-1 -status=draft  # semua laporan berstatus tertentu
go run ./cmd/seed-tahap-1 -dry-run       # hanya tampilkan rencana
```

Untuk setiap proposal `disetujui` yang **belum** punya laporan, seeder membuat satu laporan
(data proposal disalin seperti `POST /laporan`; luaran tercapai, ringkasan hasil, realisasi
anggaran = 90% anggaran, metode penelitian untuk penelitian, link dokumen). Laporan
review/revisi/disetujui mendapat reviewer berperan `reviewer` (bukan pengusul) dan review-nya;
notifikasi `laporan_diajukan` ke ketua dan `laporan_revisi/disetujui` ke pengusul. Proposal tanpa
item luaran diberi 2 target luaran, ditandai tercapai bila laporan sudah diajukan. Aman diulang
(proposal yang sudah punya laporan dilewati). Di Docker: `docker compose exec app /app/seed-tahap-1`.

## Struktur

```
cmd/server      entrypoint HTTP server
cmd/migrate     runner migrasi (kompatibel _prisma_migrations)
cmd/seed        seeder role, akun, periode
cmd/seed-tahap-1  seeder laporan untuk proposal yang sudah disetujui
cmd/hapus-proposal-mahasiswa  hapus proposal yang ketua pengusulnya mahasiswa
migrations/     salinan prisma/migrations dari project Node
internal/config     pembacaan .env
internal/database   koneksi MySQL (parsing DATABASE_URL gaya Prisma, UTC)
internal/httpapi    router ala Express, middleware, dan semua handler
  auth.go, users.go, periode.go, proposals.go, proposal_dosen.go,
  reviewer.go, laporan.go (laporan + dokumen lampiran), laporan_harian.go,
  misc.go (notifikasi, dashboard, activity log, export),
  kegiatan.go (helper tulis ke tabel Penelitian/Pengabdian via registri Kegiatan),
  laporan_kegiatan.go (fitur laporan baru, /api/v1/laporan),
  program_studi.go (master program studi, /api/v1/program-studi),
  profil_akun.go (SINTA, foto profil, unduh data akun, hapus akun sendiri),
  luaran.go (item luaran kegiatan, /api/v1/luaran), kepercayaan.go (nilai kepercayaan),
  verifikasi_email.go (verifikasi email opsional), master.go (master rumpun ilmu, bidang,
  luaran), kata_kunci.go (validasi & simpan kata kunci), reviewer_akses.go (hak akses reviewer
  dosen: beri, cabut, cabut paksa + pengalihan tugasan)
scripts/e2e.py  uji end-to-end seluruh alur (khusus database development!)
```

## Pengujian

```bash
go test ./...                                 # unit test (tanpa database)
python3 scripts/e2e.py http://localhost:3000  # 599 pengecekan end-to-end
```

`scripts/e2e.py` membuat & menghapus data, jadi jalankan hanya di database
development yang sudah di-seed, dengan `TRUST_PROXY=true`.

## Perbedaan yang disengaja dengan versi Node

1. `PATCH /api/v1/users/profile/me` hanya mengubah field profil
   (`name, fullName, alamat, kontak, noHp, institusi, programStudi, prodi,
   tempatLahir, tanggalLahir, nidn, nim`). Versi Node meneruskan `req.body`
   langsung ke Prisma sehingga user bisa mengubah `password`/`status`
   miliknya sendiri; field seperti itu sekarang diabaikan.
2. `GET /api/v1/mahasiswa/laporan-harian/dokumen/:id` mengirim file asli.
   Versi Node memakai `res.send(Uint8Array)` yang oleh Express dikirim sebagai
   teks JSON (file hasil download rusak).
3. Pesan error internal Prisma (HTTP 500, mis. id bukan angka) teksnya bisa
   sedikit berbeda; status code-nya sama. Di `NODE_ENV=production` keduanya
   sama-sama menjadi `"Internal server error"`.
4. Skema database berbeda dari Prisma sejak pemecahan tabel `Proposal` (lihat atas).
   Respons proposal mendapat field `tipe` (selalu `"proposal"`) dan `luaran`;
   create/update proposal menerima `luaran` opsional. `GET /reviewer/my-tugasan` hanya
   memuat tugasan proposal (tugasan laporan ada di `GET /laporan/tugasan`).
5. Tambahan Grup A waiting API (lihat `new-api.md` bagian 10): `GET /auth/me` ikut
   mengirim field profil + `jabatanFungsional`; `GET /users/profile/me` baru;
   `PATCH /users/profile/me` menerima `jabatanFungsional`; `GET /dosen/proposals/stats`
   punya key `review` dan filter `?jenis=`; `GET /dosen/proposals/as-member` baru; field
   `skema` (penelitian) dan `mitra` (pengabdian) di proposal; `/api/v1/program-studi`
   baru (GET publik).
6. Tambahan Grup B (lihat `new-api.md` bagian 11): field `tahapan` di semua respons
   proposal; `sintaId`/`sintaScore`/`fotoUrl` di `/auth/me` dan profil; foto profil
   (`POST/DELETE /users/profile/foto`, `GET /users/:id/foto` publik); `GET
   /users/profile/export`; `DELETE /users/profile/me` (nonaktif + anonimkan).
7. Tambahan Grup C (lihat `new-api.md` bagian 12): `/api/v1/luaran` (item luaran
   kegiatan + statistik), `GET /dosen/kepercayaan`, verifikasi email
   (`emailVerifiedAt` di `/auth/me` & profil, `POST /auth/verify-email[/resend]`). Tanpa
   `SMTP_HOST` di luar production, link verifikasi hanya dicetak ke log.
8. W-22 sampai W-25 (lihat `new-api.md` bagian 13): field `rumpunIlmu`, `bidang`,
   `kataKunci` (array) di proposal & laporan; `kontak`/`noHp` di pencarian user, pencarian
   anggota, dan `anggota[].user`; `/api/v1/master/{rumpun-ilmu,bidang,luaran}`.
9. W-26 (lihat `new-api.md` bagian 14): `mitraJenis`, `mitraAlamat`, `mitraKontak`,
   `mitraKebutuhan` (khusus pengabdian) di proposal & laporan; master `jenis-mitra`.
10. W-27/W-28/W-30 (lihat `new-api.md` bagian 15): `kataKunci` dan `metodePenelitian`
    (khusus penelitian) bisa diubah di laporan; `PATCH /users/:id/roles` terbuka untuk
    `ketua_lppm`, tetapi hanya untuk menambah/mencabut `reviewer` pada dosen.
11. Hak akses reviewer (lihat `new-api.md` bagian 16): hanya user berperan `reviewer`
    (dicek di DB) yang bisa ditugaskan, melihat tugasan, dan menyimpan review; endpoint
    `/users/:id/reviewer` (GET/PATCH) dan `/users/:id/reviewer/force-revoke` (Ketua);
    `PATCH /users/:id/roles` menolak (409) pencabutan reviewer yang masih punya tugasan terbuka;
    `GET /users/kandidat-reviewer` (urut beban, `prioritas` = belum punya tugasan aktif),
    `rekomendasi` per tugasan dan `otomatis: true` saat cabut paksa.
12. Mahasiswa tidak lagi bisa menulis proposal, laporan (kegiatan maupun kemajuan/akhir),
    dokumen lampiran, dan luaran (`403`); tetap bisa undangan tim, `as-member`, membaca proposal
    tempat ia anggota, dan laporan harian. Lihat `new-api.md` bagian 17.
13. Submit proposal mewajibkan komposisi tim (selain ketua): penelitian minimal 2 dosen,
    pengabdian minimal 2 dosen + 1 mahasiswa; gagal → 400. Lihat `new-api.md` bagian 18.
14. Backup database `/api/v1/backup` (admin, baru): otomatis sebulan sekali + manual, log,
    unduh, hapus. Lihat bagian "Backup database" di bawah dan `new-api.md` bagian 19.
15. Periode: admin hanya melihat; tambah/ubah hanya Ketua; Ketua hapus langsung (`DELETE
    /periode/:id` + password sendiri, baru); admin hapus lewat permintaan yang disetujui Ketua
    (Node: admin ↔ ketua saling menyetujui). Lihat `new-api.md` bagian 20.
16. Endpoint `/api/v1/laporan` tidak ada di Node. Error bisnisnya memakai status HTTP
   yang sesuai (400/403/404/409), bukan 500 gaya Node. Lihat `new-api.md`.

Catatan: seperti versi Node, `GET /proposals/:id`, `GET /dosen/proposals/:id`
dan `PATCH /proposals/laporan/:id` tetap menyertakan isi file
(`dokumenBlob`/`fileBlob`) dalam bentuk objek `{"0":37,"1":80,...}` demi
kompatibilitas penuh. Jika frontend tidak memakainya, field ini sebaiknya
dihapus agar respons lebih ringan.
