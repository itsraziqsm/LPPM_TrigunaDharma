# CLAUDE.md — Konteks Proyek LPPM Universitas Triguna Dharma

Sistem informasi **LPPM** (Lembaga Penelitian dan Pengabdian kepada Masyarakat) untuk
mengelola siklus proposal **penelitian** dan **pengabdian**: periode → pengajuan proposal
(dengan tim anggota) → penugasan reviewer → review → keputusan → laporan kemajuan/akhir,
laporan harian mahasiswa, notifikasi, log aktivitas, dan export laporan.

Bahasa domain, pesan API, dan komentar kode mayoritas **bahasa Indonesia**. Pertahankan itu.

## Struktur repo

```
backend_go/     Backend aktif (Go 1.23+, net/http murni, MySQL). Port 1:1 dari backend Node.
frontend/    Frontend aktif (React 19 + Vite 8 + Tailwind 4 + Zustand + React Router 7).
docs/           Dokumentasi lintas bagian, mis. waitingApi-list.md (UI yang menunggu endpoint).
Archive/        Arsip, JANGAN diedit: backend_node.zip (backend Node/Express/Prisma asli,
                termasuk prisma/schema.prisma) dan backend_go_old.zip (draf port Go lama).
```

Dokumen yang wajib dibaca sebelum mengubah bagian terkait:
- `backend_go/README.md` — cara jalan, struktur, pengujian, perbedaan sengaja dengan Node.
- `backend_go/new-api.md` — API baru (fitur laporan, Grup A, B, C, W-22–W-30, hak akses reviewer, backup, template proposal, detail undangan, hapus dokumen dengan izin, Ketua STMIK & pemantauan, luaran prioritas & unduh luaran admin, rumpun ilmu komputer, akses baca dosen diundang) untuk developer FE;
  perbarui setiap kali menambah/mengubah API baru.
- `frontend/CATATAN_REDESIGN.md` — sistem desain "Navy Akademik" & dashboard seragam.

## Prinsip utama (jangan dilanggar tanpa alasan kuat)

1. **Kompatibilitas penuh dengan backend Node (untuk endpoint lama).** Backend Go meniru API Node/Express
   byte-per-byte: urutan route, role, pesan, status code, bentuk JSON (urutan field gaya
   Prisma, tanggal `2026-05-16T04:53:59.000Z`, `anggaran` Decimal sebagai string,
   `dokumenBlob` sebagai objek `{"0":37,...}`), termasuk keanehan Node (mis. error bisnis
   `throw new Error()` → **HTTP 500** lewat `plainError`). Komentar `// Node: ...` di tiap
   file menunjuk file asal di Node. Frontend bergantung pada perilaku ini.
   Pengecualian yang disengaja: respons proposal kini punya field `tipe`, `luaran`, `skema`,
   `mitra` (+ `mitraJenis/Alamat/Kontak/Kebutuhan`), `rumpunIlmu`, `bidang`, `kataKunci`, `tahapan` (+ `kontak`/`noHp` di `anggota[].user`
   dan di pencarian user); `/auth/me` ikut mengirim field profil (+ SINTA, `fotoUrl`, `emailVerifiedAt`);
   `/dosen/proposals/stats` punya key `review`.
   Endpoint baru tanpa padanan Node (`/api/v1/laporan`) memakai status HTTP yang sesuai
   (400/403/404/409) dan didokumentasikan di `backend_go/new-api.md`.
2. **Backend Go satu-satunya backend.** Sejak migrasi
   `20261024000000_split_proposal_penelitian_pengabdian` tabel `Proposal` dipecah menjadi
   `Penelitian` + `Pengabdian`, jadi skema tidak lagi sama dengan Prisma dan backend Node
   tidak boleh dipakai pada database ini. Format `_prisma_migrations` tetap dipakai oleh
   `cmd/migrate`. Tanggal disimpan UTC.
3. **Redesign frontend hanya tampilan.** `src/api/*`, `src/store/*`, `src/router/*`,
   `src/utils/*` sengaja tidak diubah oleh redesign; logika & hak akses tetap.

## Backend (`backend_go/`)

### Perintah
```bash
cp .env.example .env            # DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET wajib
go run ./cmd/migrate            # terapkan migrasi (-status untuk melihat status)
go run ./cmd/seed               # role + akun demo + periode (opsional)
go run ./cmd/seed-tahap-1       # laporan contoh untuk proposal disetujui (status campur; -status=, -dry-run; aman diulang)
go run ./cmd/hapus-proposal-mahasiswa [-yes]  # hapus proposal berpengusul mahasiswa (tanpa -yes = pratinjau)
go run ./cmd/seed-email         # 6 akun contoh @email.com, satu per peran (ketuastmik@email.com/ketuastmik123, dst.; aman diulang)
go run ./cmd/seed-proposal [-reset|-dry-run]  # proposal + laporan contoh SEMUA status (17 per dosen1 & dosen2, 3 per dosen3–5; aman diulang)
go run ./cmd/server             # default PORT=3000
go test ./...                   # unit test tanpa DB (config, database, httpapi/compat_test)
python3 scripts/e2e.py http://localhost:3000   # ±766 cek E2E (jumlah sedikit bergantung data); HANYA DB dev ter-seed, TRUST_PROXY=true
docker compose up --build       # app :3233 + MySQL 8 (host :3307), migrasi otomatis saat start
```

### Arsitektur
- `cmd/server` (HTTP, graceful shutdown), `cmd/migrate` (runner kompatibel Prisma),
  `cmd/seed`, `cmd/seed-tahap-1` (laporan + reviewer/review + target luaran untuk proposal
  `disetujui` yang belum punya laporan; menulis SQL langsung mengikuti `insertKegiatan`).
- `internal/config` — baca env (`godotenv`). Default: `PORT=3000`, `CORS_ORIGIN=*`,
  `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=30d`, `RATE_LIMIT_MAX=500`
  per 15 menit. `NODE_ENV=production` menyembunyikan pesan error 500.
- `internal/database` — parsing `DATABASE_URL` gaya Prisma (password spesial boleh
  mentah atau URL-encoded), koneksi UTC.
- `internal/httpapi` — router mini ala Express (`router.go`: `group(prefix, middleware...)`,
  `step func(*Ctx) error`, `errStop` = respons sudah dikirim), middleware di `server.go`
  (helmet headers, CORS, rate limit global, body parser JSON 10kb/urlencoded, `/health`,
  access log "combined" ke `logs/access.log`), validasi ala zod (`validate.go`,
  422 `{"errors":{"field":["pesan"]}}`), respons (`respond.go`, envelope
  `{success, message, data[, meta]}`, ETag/304), JWT HS256 payload `{userId,email,roles}`.
- Rate limit khusus: login/forgot/reset 10 per 15 menit per IP; register 5 per jam per IP.
- Upload: multipart field `file`, PDF/DOCX saja, maks 10 MB, cek magic bytes; file disimpan
  sebagai **LONGBLOB** di DB (bukan filesystem).
- Mendaftarkan route baru: tambahkan di `registerXxxRoutes()` file domainnya; urutan route
  penting (route statis seperti `/my`, `/stats` harus sebelum `/:id`).
- **Proposal & laporan (tabel terpecah):** BACA lewat VIEW `Proposal` (tipe proposal) /
  VIEW `Laporan` (tipe laporan) — query baca lama (`FROM Proposal`) tetap jalan. TULIS jangan
  ke VIEW: pakai helper di `kegiatan.go` — `insertKegiatan` (registri `Kegiatan` + tabel
  fisik sesuai `jenis`), `updateKegiatan`, `deleteKegiatan` (hapus `Kegiatan` → CASCADE ke
  tabel fisik & semua relasi), `moveKegiatanJenis` (PATCH `jenis`), `kegiatanFile` (blob,
  tidak ada di VIEW).

### Peran (`Role.name`)
`admin`, `ketua_lppm` (dulu `ketua_prpm`, sudah dimigrasi), `ketua_stmik`, `dosen`, `reviewer`, `mahasiswa`.
**Ketua STMIK** (`ketua_stmik`, migrasi `20261103000000`): memantau seluruh proposal, **hanya baca** — list/detail
proposal & laporan (+ review, unduh dokumen), `/dashboard/stats`, `/export/proposals`, dan `/monitoring`
(ringkasan, proposals, dosen pengusul + status + anggaran); akses baca lewat `ensureProposalAccess`/`ensureLaporanAccess`
level read. Peran diberikan admin lewat `PATCH /users/:id/roles`.
User bisa punya banyak peran. Registrasi publik hanya dosen/mahasiswa dengan status
`pending`; login ditolak sampai admin mengubah status ke `approved` (`pending|approved|rejected`).
**Mahasiswa tidak mengusulkan proposal**: tugasnya laporan harian; mahasiswa hanya bisa undangan
tim, `/dosen/proposals/as-member`, membaca proposal tempat ia anggota, dan `/mahasiswa/laporan-harian`.
Semua penulisan proposal, laporan (kegiatan & kemajuan/akhir), dokumen lampiran, dan luaran hanya
`dosen` (+ admin untuk hapus/ubah tertentu); data lama dibersihkan `cmd/hapus-proposal-mahasiswa`.
**Hak akses reviewer:** dosen default bukan reviewer; Admin/Ketua memberi peran `reviewer`
(`PATCH /users/:id/reviewer`); cabut biasa hanya bila tidak ada tugasan belum selesai (review belum
final pada item `diajukan`/`review`), selain itu 409; cabut paksa hanya Ketua
(`POST /users/:id/reviewer/force-revoke`) dengan mengalihkan semua tugasan terbuka ke reviewer lain
dalam satu transaksi (`otomatis: true` memakai rekomendasi). Prioritas: `GET /users/kandidat-reviewer`
(`?itemId=&exclude=`) mengurutkan reviewer dari tugasan aktif paling sedikit (`prioritas` = 0 tugasan
aktif); `GET /users/:id/reviewer` memberi `rekomendasi` per tugasan yang disebar merata. Hanya user berperan `reviewer` (cek DB lewat `requireReviewerRole`, bukan
token) yang bisa ditugaskan, membuka tugasan, dan menyimpan/finalisasi review. `hasTugasan` di
`/auth/me` tetap ada (frontend `canReview` mewajibkan peran reviewer untuk dosen).

### Endpoint (`/api/v1`, semua butuh Bearer token kecuali auth publik & `/health`)
| Grup | Endpoint utama | Akses |
|---|---|---|
| `/auth` | login, refresh, logout, logout-all, register/dosen, register/mahasiswa, forgot-password, reset-password, me (+ field profil, `emailVerifiedAt`), verify-email/resend (login), verify-email (publik) | publik / login |
| `/users` | `/kandidat-reviewer` (admin+ketua, sebelum `/:id`), `/:id/reviewer` (GET/PATCH admin+ketua), `/:id/reviewer/force-revoke` (ketua), search, profile/me (GET; PATCH field profil + `jabatanFungsional`, `sintaId`, `sintaScore`; DELETE = hapus akun sendiri, wajib password), profile/export (file JSON), profile/foto (POST multipart / DELETE), `/:id/foto` (GET **publik**, router terpisah sebelum `/users`), profile/password, list, `/:id`, `/:id/status`, `/:id/roles`, delete | list/detail admin+ketua; status/delete admin; roles admin (ketua hanya tambah/cabut `reviewer` pada dosen) |
| `/periode` | list, detail, create, update, DELETE `/:id` (hapus langsung + password); `deletion-request` (+ approve/cancel) | baca: semua; create/update/DELETE: ketua; deletion-request: admin; approve: ketua |
| `/proposals` | list (admin/ketua/reviewer), `/my`, detail, create/update/submit (dosen/mhs), `/:id/status` (ketua/admin), delete, `dokumen-utama` upload/download | sesuai kolom |
| `/proposals/:id/reviewers`, `/reviews`, `/reviews/finalize` | tugaskan/hapus reviewer (ketua/admin); simpan & finalisasi review (reviewer) | |
| `/proposals/:id/laporan`, `/laporan/:id[/download]` | laporan `kemajuan`/`akhir` (file atau URL) | dosen/mhs; admin edit/hapus |
| `/proposals/:id/dokumen`, `/dokumen/:id[/download]` | dokumen lampiran | dosen/mhs; admin hapus |
| `/dosen/proposals` | stats (`?jenis=`, + key `review`), `as-member` (proposal orang lain tempat user anggota `diterima`), members/search, invitations (+ `GET /:id` detail untuk penerima: `aksesPenuh` → lengkap + `dokumenUtama` untuk dosen diundang/anggota diterima, selain itu ringkas; + PATCH respon), CRUD + submit | dosen; mahasiswa hanya invitations & as-member |
| `/program-studi` | list (`?semua=true` termasuk nonaktif), create, `/:id` update/delete | GET publik; tulis admin |
| `/master/:kategori` | `rumpun-ilmu`, `bidang`, `luaran`, `jenis-mitra`: list (`?jenis=`, `?semua=true`), create, `/:id` update/delete | GET login; tulis admin |
| `/mahasiswa/laporan-harian` | proposals, `/:proposalId` list/create (upload/link GDrive), dokumen/:id, delete | mahasiswa anggota |
| `/reviewer/my-tugasan` | tugasan review **proposal** milik user | hanya peran reviewer (cek DB) |
| `/laporan` | list (admin, ketua), `/my`, `/eligible`, `/tugasan`, create, detail, update, submit, delete, `/:id/dokumen` upload/download, `/:id/status` (ketua/admin), `/:id/reviewers` (+ `DELETE /:reviewerId`), `/:id/reviews` (+ `/finalize`) | lihat `backend_go/new-api.md` |
| `/luaran` | `/jenis` (daftar jenis, jurnal & poster prioritas), `/stats` (+ `poster`), `/proposal/:proposalId`, create, `/:id` update/delete (target: proposal draft/revisi), `/:id/capaian`, `/:id/bukti` upload/download (capaian: proposal disetujui & laporan belum diajukan); admin: `GET /` (semua luaran + filter), `/unduh-csv`, `/unduh-zip` (bukti + daftar-luaran.csv, maks 1000) | pengusul tulis; baca = akses proposal; admin unduh |
| `/dosen/kepercayaan` | nilai kepercayaan 0–5 (`?userId=` admin/ketua) | dosen, mahasiswa, admin, ketua |
| `/notifications` | list, read-all, `/:id/read`, delete | login |
| `/dashboard/stats` | statistik | admin, ketua |
| `/activity-logs` | `/my`; list semua (admin, ketua) | |
| `/export/proposals` | data export | admin, ketua |
| `/proposals/:id/deletion-request`, `/laporan/:id/deletion-request`, `/dokumen/deletion-request` | admin minta hapus dokumen yang sudah diajukan (`{password, alasan}`, GET = permintaan menunggu); daftar (`?status=&tipe=`); Ketua `/:requestId/approve` (`{password}`, hapus proposal + laporannya) / `/cancel` (admin batal, Ketua tolak) | admin / ketua |
| `/monitoring` | `/ringkasan`, `/proposals` (`status`, `urut`, paginasi; + `tahapan`, `anggaran`, `laporan`), `/dosen` (dosen pengusul + perStatus/perJenis/anggaran); filter `periodeId`, `tahun`, `jenis`, `search`, `termasukDraft` (bawaan tanpa draft) | ketua_stmik, ketua, admin |
| `/template-proposal` | `/aktif?jenis=` + `/aktif/unduh?jenis=` (**publik**, jatuh ke `umum`); list, POST multipart (file DOCX/PDF + `jenis`/`tahun`/`keterangan`, langsung aktif), `/:id/unduh`, `/:id/aktifkan`, DELETE `/:id` (aktif → 409) | publik / admin |
| `/backup` | log (`?sumber=sistem\|admin&status=`), `/jadwal`, POST manual (202, latar; 409 bila ada yang berjalan), `/:id`, `/:id/download` (.sql.gz), DELETE `/:id` (hapus file, log tetap) | admin |

### Aturan bisnis penting
- Status proposal: `draft → diajukan → review → revisi|disetujui|ditolak`.
  - Edit & submit hanya saat `draft`/`revisi`; hapus hanya saat `draft`.
  - Submit lewat `/dosen/proposals/:id/submit` mewajibkan **semua anggota sudah menerima
    undangan** (`ProposalAnggota.statusUndangan`: `pending|diterima|ditolak`).
  - **Akses anggota tim** (`ensureProposalAccess`): anggota `diterima` dan **dosen** yang masih diundang
    (`pending`) boleh **membaca** semua detail & file proposal; **semua anggota hanya baca** — aksi tulis
    `/proposals/...` → 403 "Anggota tim hanya dapat melihat proposal…". Mahasiswa pending & undangan
    ditolak tidak bisa membaca (detail undangan ringkas, `aksesPenuh: false`).
  - **Komposisi tim** dicek saat submit (kedua route submit, `komposisi_tim.go`; draft bebas), anggota
    selain ketua pengusul, yang menolak tidak dihitung: penelitian dosen min. 0 maks. 5 + mahasiswa
    min. 1 (tanpa maks.), pengabdian dosen min. 1 maks. 5 + mahasiswa min. 1 (tanpa maks.); gagal → 400.
  - Menugaskan reviewer hanya untuk status `diajukan`/`review`, dan otomatis set `review`.
  - Field `tahapan` `{kode,label,urutan}` dihitung (tidak disimpan): belum `disetujui` →
    seleksi_usulan(1); disetujui + laporan tidak ada/draft → pelaksanaan(2); laporan
    diajukan/review/revisi/ditolak → seleksi_lanjutan(3); laporan disetujui → pasca_pelaksanaan(4).
  - `rumpunIlmu` **wajib nama aktif di master `rumpun_ilmu`** (kini hanya bidang komputer: Ilmu Komputer,
    Teknik Informatika, Sistem Informasi, dst.; 12 rumpun umum DIKTI dinonaktifkan) — dicek `checkRumpunIlmu`
    (`rumpun_ilmu.go`) saat dikirim di proposal & laporan, 400 bila tidak, `""` = kosong; laporan bisa
    mengubah `rumpunIlmu` sendiri. `bidang` (teks bebas, pilihan dari `MasterData`), `kataKunci` (array maks
    10 × 50 karakter, disimpan JSON di TEXT, respons selalu array).
  - `skema` hanya untuk penelitian, `mitra` + detail mitra (`mitraJenis`, `mitraAlamat`,
    `mitraKontak`, `mitraKebutuhan`) hanya untuk pengabdian (400 jika salah jenis; detail mitra
    `null` untuk penelitian diabaikan);
    pindah jenis menghapus nilai milik jenis lama.
  - Ketua/admin mengubah status (`review|revisi|disetujui|ditolak`, opsional `catatanRevisi`);
    `disetujui` mengisi `approvedAt`; pengusul mendapat notifikasi.
- Review: nilai (`nilaiRelevansi/Metodologi/Anggaran/Luaran`) bertipe **TEXT**,
  `rekomendasi` ∈ `disetujui|revisi|ditolak`; simpan ulang mereset `isDone=false`;
  finalisasi set `isDone=true` dan memberi notifikasi `review_selesai` ke pengusul.
- Laporan kemajuan/akhir (`LaporanProposal`, fitur lama tanpa review) hanya untuk proposal
  `disetujui`; wajib file atau `dokumenUrl`.
- **Laporan** (baris `tipe='laporan'` di Penelitian/Pengabdian, endpoint `/laporan`): dibuat
  pengusul dari proposal `disetujui`, maks 1 per proposal (`proposalId` unik), data proposal
  (judul, abstrak, anggaran, `luaran`, periode, kata kunci, dll.) disalin. Kolom khusus:
  `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `metodePenelitian` (khusus laporan
  penelitian); `kataKunci` laporan bisa diubah terpisah dari proposal. Status sama dengan proposal. Edit/upload saat
  `draft`/`revisi`; submit wajib `luaranTercapai` + dokumen (file/URL) dan menotifikasi semua
  ketua; ketua/admin menugaskan reviewer (hanya `diajukan`/`review`, bukan pengusul) → `review`;
  reviewer simpan/finalisasi (hanya saat `review`); ketua/admin set status. Tugasan & review
  laporan memakai `ReviewerTugasan`/`ProposalReview` dengan `proposalId` = id laporan;
  `/reviewer/my-tugasan` menyaring hanya tipe proposal.
- Hapus akun sendiri (`DELETE /users/profile/me`): bukan hapus fisik — status `rejected`,
  refresh token dicabut, profil dianonimkan ("Pengguna Dihapus", `deleted-<id>@deleted.invalid`),
  foto dihapus, undangan pending → ditolak, `deletedAt` diisi; admin terakhir tidak boleh.
- Foto profil: JPG/PNG/WebP maks 2 MB (`multerImage`, magic bytes), blob di tabel `UserFoto`;
  `fotoUrl` relatif ke base URL API (`/users/:id/foto?v=<ms>`).
- **Luaran kegiatan** (`LuaranKegiatan`, milik id proposal): target (jenis, target,
  targetTanggal) diubah saat proposal draft/revisi; capaian (status tercapai/belum, judul,
  keterangan, tercapaiAt, bukti URL/file) saat proposal disetujui dan laporan belum diajukan.
  Dapat diklaim = tercapai + laporan disetujui; jurnal = dapat diklaim berjenis jurnal.
  Jenis: jurnal, **poster**, prosiding, hki, buku, produk, media_massa, lainnya; **jurnal & poster = prioritas**
  (ditampilkan paling atas di `/luaran/jenis`, `/master/luaran` (+ `prioritas`), daftar admin), tidak wajib.
  (Menu `/luaran` di frontend = pencairan dana, hal lain, menunggu kampus.)
- **Nilai kepercayaan** = 5 × rata-rata komponen yang ada datanya (persetujuan proposal,
  persetujuan laporan dari proposal disetujui yang periodenya selesai/laporannya diputuskan,
  rekomendasi reviewer final 1/0,5/0, ketepatan waktu luaran ≤ targetTanggal).
- **Verifikasi email** opsional (login tetap bisa): token 24 jam di `EmailVerificationToken`,
  link `FRONTEND_URL/verify-email?token=`; user lama & seed dianggap terverifikasi; tanpa
  `SMTP_HOST` di luar production link hanya di-log.
- Periode: **admin hanya melihat**; tambah/ubah hanya Ketua LPPM. Hapus: Ketua langsung
  (`DELETE /periode/:id` + password sendiri; permintaan admin yang menunggu ikut disetujui);
  admin membuat permintaan (berlaku 1 hari) yang harus disetujui **Ketua** dengan password.
  Notifikasi `deletion_request|approved|cancelled`.
- Notifikasi (`NotifType`): `proposal_diajukan`, `proposal_disetujui`, `proposal_ditolak`,
  `proposal_revisi`, `reviewer_ditugaskan`, `review_selesai`, `laporan_diunggah`,
  `deletion_request`, `deletion_approved`, `deletion_cancelled`, `laporan_diajukan`,
  `laporan_disetujui`, `laporan_ditolak`, `laporan_revisi` (notifikasi laporan memakai
  `refType: "laporan"`).
- Aksi penting dicatat ke `ActivityLog` (dengan `ipAddress`, `userAgent`).
- **Backup database** (`backup.go`, `backup_dump.go`): otomatis sebulan sekali (env `BACKUP_HARI`=1,
  `BACKUP_JAM`=2, `BACKUP_ZONA`=Asia/Jakarta, `BACKUP_OTOMATIS`; terlewat → dijalankan saat server
  hidup, cek tiap 10 menit) + manual admin; dump SQL gzip ditulis Go sendiri (snapshot konsisten) ke
  `BACKUP_DIR` (default `backups/`, tidak di-commit); log `BackupLog` (`sumber` sistem|admin,
  `dibuatOlehId`, status berjalan|berhasil|gagal, `periode` YYYY-MM untuk otomatis, `dihapusAt`).

### Database (MySQL/MariaDB)
Tabel: `Role` (`name` ENUM admin|ketua_lppm|ketua_stmik|dosen|reviewer|mahasiswa), `User` (+ `jabatanFungsional`, `sintaId`, `sintaScore`, `deletedAt`, `emailVerifiedAt`),
`EmailVerificationToken`, `LuaranKegiatan` (item luaran per proposal, bukti blob), `MasterData`
(`kategori` rumpun_ilmu|bidang|luaran|jenis_mitra, `nama` unik per kategori, `jenisKegiatan` NULL = keduanya,
`jenisLuaran`, `urutan`, `isAktif`), `UserFoto`
(foto profil: `userId` PK, blob, mime, ukuran), `UserRole`, `RefreshToken`, `PasswordResetToken`, `Periode`
(`jenis`: penelitian|pengabdian, `isAktif`), `Kegiatan` (registri id global: `jenis`, `tipe`),
`Penelitian` dan `Pengabdian` (kolom identik: kolom proposal lama tanpa `jenis` + `tipe`
ENUM('proposal','laporan'), `proposalId` (laporan → proposal asal), `luaran`,
`luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `rumpunIlmu`, `bidang`, `kataKunci`; plus `skema` dan `metodePenelitian` (laporan) hanya di Penelitian dan
`mitra`, `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan` hanya di Pengabdian), `ProgramStudi` (master: `nama` unik, `jenjang`, `isAktif`;
`User.programStudi/prodi` tetap teks bebas), `ProposalAnggota`,
`ReviewerTugasan`, `ProposalReview`, `LaporanProposal`, `DokumenLampiran`, `LaporanHarian`,
`Notification`, `ActivityLog`, `PeriodeDeletionRequest`, `DokumenDeletionRequest` (permintaan hapus proposal/laporan:
`kegiatanId` SET NULL setelah terhapus, salinan `judul`/`jenis`/`pengusulId`, `alasan`, `catatan`, status
pending|approved|rejected|cancelled), `BackupLog`, `TemplateProposal` (versi template
proposal: `jenis` umum|penelitian|pengabdian, `tahun`, blob, `isAktif` satu per jenis), `_prisma_migrations`.
VIEW (baca saja): `Proposal`, `Laporan`. Kolom `proposalId` di tabel relasi ber-FK ke
`Kegiatan.id`; id proposal & laporan unik bersama sehingga URL `/proposals/:id` tidak berubah.
Migrasi baru: buat folder `migrations/<YYYYMMDDHHMMSS>_<nama>/migration.sql` (format Prisma);
jangan ubah migrasi yang sudah diterapkan (checksum dicatat).

### Perbedaan sengaja dengan Node (lihat README)
`PATCH /users/profile/me` hanya menerima field profil; download dokumen laporan harian
mengirim file asli; teks error internal 500 bisa sedikit beda; skema DB terpecah
(Penelitian/Pengabdian) + field `tipe`/`luaran`/`skema`/`mitra` di proposal; endpoint
`/laporan`, `/program-studi`, `/users/profile/me` (GET), `/dosen/proposals/as-member` baru;
`/auth/me` + field profil; stats + `review` & `?jenis=`; field `tahapan`; foto profil,
export & hapus akun sendiri; luaran kegiatan, nilai kepercayaan, verifikasi email; rumpun ilmu/bidang/kata kunci + master data; detail mitra pengabdian; kata kunci & metode
penelitian di laporan; ketua boleh mengatur peran reviewer; hanya peran reviewer yang bisa
ditugaskan/mereview, beri/cabut/cabut paksa reviewer; periode: admin hanya melihat, Ketua
tambah/ubah/hapus langsung, admin hapus lewat persetujuan Ketua.

### Akun seed (`cmd/seed`)
`admin@lppm.dev/admin123456`, `ketua@lppm.dev/ketua123456`,
`wakil.ketua@lppm.dev/wakil123456` (ketua_lppm+dosen), `reviewerN@lppm.dev/reviewer123`,
`dosenN@lppm.dev/dosen123456`, `mahasiswaN@lppm.dev/mhs1234567`, plus akun
`pending.*`/`rejected.*` untuk uji status. `cmd/seed-email`: `admin|ketua|ketuastmik|dosen|reviewer|mahasiswa@email.com`
(password `admin123456`, `ketua123456`, `ketuastmik123`, `dosen123456`, `reviewer123`, `mhs1234567`).

## Frontend (`frontend/`)

### Perintah
```bash
npm install
npm run dev       # Vite, http://localhost:5173 (cocokkan CORS_ORIGIN backend)
npm run build
npm run lint      # baseline: 0 error, 2 peringatan lama
```
Base URL API: `VITE_API_URL` (default `http://localhost:3000/api/v1`, di `src/api/axios.js`).

### Arsitektur
- `src/router/index.jsx` — `GuestRoute` (`/login`, `/register`), `/verify-email?token=` publik
  (`VerifyEmailPage.jsx`, tanpa guard) dan `PrivateRoute`; semua
  halaman privat merender `DashboardLayout` dengan prop `page`: `/dashboard`, `/periode`,
  `/proposals`, `/users`, `/cetak-dokumen[/rekap-proposal|/surat-tugas]` (admin/ketua; `/export` lama
  dialihkan ke sini), `/kegiatan/penelitian`,
  `/kegiatan/pengabdian`, `/kegiatan/:jenis/detail/:id` (semua peran terkait), `/kegiatan/:jenis/usulan[/:id]`, `/kegiatan/:jenis/laporan/(baru|:id)`,
  `/luaran` (dosen), `/laporan-masuk` (admin/ketua), `/backup`, `/template-proposal`, `/luaran-dosen` (admin), `/pemantauan` (Ketua STMIK; juga bisa admin/ketua), `/notifikasi` & `/notifikasi/:id` (semua peran), `/undangan[/:id]`
  (dosen/mhs), `/laporan-harian` (mhs, semua project), `/project/penelitian|pengabdian[/input]` & `/riwayat-project` (mhs), `/penugasan` (reviewer / punya tugasan), `/proposals/detail/:id` & `/laporan-masuk/detail/:id` (**halaman detail, bukan modal**: Ketua/Admin =
  `ProposalMasukDetailPage` / `LaporanMasukDetailPage` (kelola), reviewer = `pages/review/` (penilaian); tautan lama
  `/proposals?detail=` & `/laporan-masuk?id=` dialihkan ke sini), `/profil`.
  `/proposal-saya` (halaman lama, sudah dihapus) dialihkan ke `/kegiatan/penelitian`.
- `src/pages/DashboardLayout.jsx` — pemilihan halaman berdasarkan **peran pertama**
  (`roles[0]`) + `isReviewer` = `canReview(user)` di `src/utils/roles.js` (hanya peran
  `reviewer`; `hasTugasan` tidak lagi dipakai — backend menolak user tanpa peran reviewer).
  Admin/Ketua mengatur dosen ↔ reviewer di panel detail Manajemen User (`ReviewerAccess`:
  `GET/PATCH /users/:id/reviewer`; masih ada tugasan → Ketua **cabut paksa** lewat
  `ForceRevokeModal` (`POST .../force-revoke`, pilih reviewer baru per tugasan dari `GET /users/kandidat-reviewer?itemId=&exclude=`,
  nilai awal `rekomendasi`, atau **Alihkan otomatis** `otomatis: true`), Admin diberi tahu. Semua dialog Tugaskan Reviewer
  (Proposal Kegiatan, Laporan Kegiatan, panel Periode) memakai kandidat-reviewer (urut beban) + lencana `components/BebanReviewer.jsx`;
  ubah akun sendiri → roles di store diperbarui). `Sidebar.jsx`
  memakai logika yang sama; ubah keduanya bersamaan.
- `src/store/authStore.js` (Zustand) — token di `localStorage` (`accessToken`,
  `refreshToken`); `fetchMe()` mengisi `user`.
- `src/api/axios.js` — interceptor Bearer token + auto refresh saat 401, gagal → logout.
- `src/api/*.js` — satu modul per domain (`proposalApi`, `proposalDosenApi`, dst.).
  **Catatan dokumen utama:** respons `GET /dosen/proposals/:id` (bentuk Node) tidak memuat
  `dokumenNama/Mime/Ukuran` walau file tersimpan — pakai `proposalDosenApi.getByIdLengkap(id)` (menggabungkan
  field itu dari `GET /proposals/:id`) di layar yang menampilkan dokumen (Usulan mode ubah, Detail Kegiatan).
- `src/pages/dashboard/` — dashboard seragam semua peran; data per peran lewat
  `adapters/` (`pengelola`, `dosen`, `mahasiswa`, `reviewer`, `shared`). Status Inggris &
  Indonesia dipetakan ke satu kunci.
  **Semua peran memakai layout dashboard dosen** (`src/pages/dashboard/HaloLayout.jsx`) dengan **urutan bagian Beranda
  yang sama**: 1. **Halo** (`HaloHeader`: judul + breadcrumb, "Halo {nama}!" — `fullName` tanpa gelar depan/belakang
  (`namaSapaan`), tanggal & peran, muat ulang; **tanpa** ringkasan "Anda memiliki…" dan tanpa tombol aksi) → 2. **Pintasan**
  (`PintasanSection`: `model.shortcuts` sebagai baris kartu horizontal **judul saja** (`desc` jadi tooltip) `ShortcutStrip`, digeser
  di ponsel, lalu kartu angka `ToneCard`; dosen = info dokumen & luaran `DocCards`, peran lain = `KpiToneCards(model.kpis)`)
  → [dosen: **Usulan Terakhir**] → 3. **Informasi** (`DashboardBody`: Perlu perhatian, daftar utama (kegiatan terbaru: **hanya 3 item** + "Lihat selengkapnya" ke `list.to`, `LIST_MAX`) (+ umpan aktivitas
  bila adapter mengirim `feed`), status (`pipeline`), panel samping/periode **diminimalkan** (`<details>` tertutup);
  **Notifikasi terbaru dihapus** — adapter dosen & reviewer `feed: null`, tidak lagi memanggil `/notifications`)
  → [dosen: **Profil Dosen** (identitas & data dosen) lalu **Statistik Dosen** (angka capaian)]. Isi tiap peran tetap dari
  adapter masing-masing (`DashboardScreen` untuk admin, ketua, mahasiswa, reviewer; `DosenScreen` untuk dosen).
- Dashboard **dosen** memakai tampilan revamp sendiri `src/pages/dashboard/DosenScreen.jsx`
  (urutan di atas: Pintasan + kartu dokumen, Usulan Terakhir + tahapan, Informasi, Profil Dosen, Statistik Dosen). Data dari `adapters/dosen.js` (`model.dosen`).
  Bagian tanpa endpoint memakai penanda `ApiPending` ("API belum ada") dan **wajib**
  dicatat di `docs/waitingApi-list.md`; hapus barisnya setelah API tersedia.
- Menu **Kegiatan** (dosen) di `Sidebar.jsx` adalah grup bertingkat (item dengan `children`,
  dirender `NavGroup`) berisi `/kegiatan/penelitian` & `/kegiatan/pengabdian` →
  `src/pages/KegiatanPage.jsx` (prop `jenis`, di-`key` per jenis) = halaman **Status
  Penelitian/Pengabdian**: kartu Proposal Aktif/Diterima & Laporan Diterima (ringkas di ponsel),
  lalu **Riwayat** yang disorot (kartu berbingkai navy, header gelap, pintasan "N proposal perlu
  dilanjutkan", baris draft/revisi disorot + tombol "Lanjutkan" di sel judul; satu baris cari ·
  filter status (select) · Cari · "Hapus filter" hanya saat ada filter) tab Proposal
  (`/dosen/proposals`) / Laporan (`/laporan/my`, `src/api/laporan.js`), lalu tombol sekunder
  **Usulkan Proposal Baru** & **Kirim Laporan Baru**. Draft bisa **Hapus** dari Riwayat. Paginasi Riwayat & tabel "sebagai anggota tim" = 5 baris per halaman (`LIMIT`). **Tanpa tombol Detail**:
  seluruh baris bisa diklik/Enter (`barisKlik`; proposal → Detail Kegiatan, laporan → index laporan; tombol di
  dalam baris menghentikan propagasi). Query `?status=<status>` membuka dengan filter, `?detail=<id>` (tautan
  lama) dialihkan ke Detail Kegiatan.
- **Detail Kegiatan** (`src/pages/KegiatanDetailPage.jsx`, `/kegiatan/:jenis/detail/:id`, menggantikan
  `ProposalDetailModal` yang dihapus): kepala (judul, status, ketua, periode, stepper 4 tahapan, aksi pengusul:
  Lanjutkan, Ajukan, Kirim/Buka laporan), kolom utama (Abstrak, Informasi kegiatan, Mitra untuk pengabdian, Target &
  capaian luaran, Hasil review; pengusul: Dokumen lampiran & Laporan kemajuan/akhir) dan samping (Tim, Dokumen utama,
  Riwayat waktu). Dosen pengusul `GET /dosen/proposals/:id`; anggota tim (dosen/mahasiswa) & admin/ketua
  `GET /proposals/:id` (baca saja). Jenis di URL disesuaikan dengan proposal (notifikasi tanpa jenis). Halaman ini menggantikan "Proposal Saya" (`ProposalDosenPage`,
  dihapus): menu dosen = Dashboard, Kegiatan, Luaran, Undangan Kerja Sama (+ Penugasan Review); `/undangan` berjudul "Undangan Kerja Sama" (dosen) / "Undangan Ikut Serta" (mahasiswa), istilah "undangan tim" tidak dipakai lagi.
  `/undangan`: judul lalu satu kartu ringkasan (teks + 3 kotak sejajar Total/Menunggu/Riwayat), tiap kartu undangan punya
  tombol **Lihat kegiatan** di bawah kalimat pengusul → **Detail Undangan** `/undangan/:id` (`UndanganDetailPage.jsx`,
  konstanta `pages/undanganConst.js`): data dari `GET /dosen/proposals/invitations/:id` (`proposalDosenApi.getInvitation`) —
  abstrak, info kegiatan, mitra, target luaran, tim untuk semua status; Terima/Tolak di kepala. **Dosen yang diundang
  (`aksesPenuh`) dan anggota yang menerima = akses baca penuh**: kartu Dokumen utama + "Unduh file proposal"
  (`dokumenUtama.unduhUrl`, blob) dan "Lihat seluruh informasi kegiatan" → Detail Kegiatan. Di Detail Kegiatan non-pengusul
  (anggota, dosen diundang, pengelola) melihat Dokumen lampiran & Laporan kemajuan/akhir mode `readOnly` (tanpa
  tambah/unggah/hapus) + dokumen utama; dosen dengan undangan `pending` mendapat banner "Tanggapi undangan" → `/undangan/:id`.
- Menu **Ketua LPPM** (`KETUA_NAV_ITEMS` di `Sidebar.jsx`, peran pertama `ketua_lppm`): Dashboard,
  grup **Dokumen Masuk** (Proposal Kegiatan `/proposals`, Laporan Kegiatan `/laporan-masuk`), Periode,
  User, **Cetak Dokumen**. Admin `ADMIN_NAV_ITEMS`: grup Dokumen Masuk yang sama (`DOKUMEN_MASUK`), Periode, User,
  Cetak Dokumen, **Luaran Dosen** (`LuaranDosenPage.jsx`: `GET /luaran` filter + paginasi, unduh bukti, Unduh CSV `;` & ZIP),
  **Template Proposal** (`TemplateProposalPage.jsx`: unggah versi DOCX/PDF per jenis umum/penelitian/pengabdian, unduh,
  aktifkan, hapus versi riwayat), Backup Data. Unduhan blob lewat `utils/unduhBlob.js` (`simpanBlob`).
- Menu **Ketua STMIK** (`STMIK_NAV_ITEMS`, peran pertama `ketua_stmik`, hanya baca): Dashboard (adapter
  `dashboard/adapters/stmik.js`: `GET /monitoring/ringkasan` & `/monitoring/proposals`), **Pemantauan Proposal**
  (`PemantauanPage.jsx`, `/pemantauan`: filter periode/jenis/cari/termasuk draft, kartu ringkasan + per status (klik =
  saring), tab Proposal (`/monitoring/proposals`, urut; baris → Detail Kegiatan baca saja, kembali ke Pemantauan) & Dosen
  pengusul (`/monitoring/dosen`; klik = cari proposal dosen itu)), **Rekap Proposal** (`/cetak-dokumen/rekap-proposal`;
  `/cetak-dokumen` dialihkan ke sana). Label "Ketua STMIK" ada di semua `ROLE_LABEL` + opsi peran Manajemen User.
- **Hak akses Admin (peran pertama `admin`)**: **Periode** lihat saja (tanpa Tambah/Edit, `canEdit` = Ketua); Hapus =
  "Ajukan ke Ketua LPPM" (`deletion-request`, pantau/batalkan). **Ketua** di `PeriodePage`: hapus langsung (dialog
  password → `periodeApi.remove` = `DELETE /periode/:id`), permintaan admin yang menunggu → Setujui & Hapus / Tolak; **Dokumen Masuk** lihat &
  hapus saja (`viewOnly`: tanpa Ubah Status/Tugaskan reviewer/Keputusan; `components/HapusDokumen.jsx` (prop `tipe`, `id`) =
  hapus langsung bila draft, selain itu **Ajukan hapus (izin Ketua)** → dialog alasan + password (`POST /proposals|laporan/:id/
  deletion-request`, `api/dokumenHapus.js`), status menunggu + Batalkan). Ketua menyetujui di kartu
  `components/PermintaanHapusDokumen.jsx` (Proposal Kegiatan: semua; Laporan Kegiatan: laporan) → Setujui & Hapus (password) / Tolak.
- Menu **Mahasiswa** (`MAHASISWA_NAV_ITEMS`): Dashboard, grup **Project Saya** (`/project/penelitian`,
  `/project/pengabdian` → `LaporanHarianPage` prop `jenis`: daftar project = `GET /mahasiswa/laporan-harian/proposals`
  disaring per jenis; kepala + 3 `StatusCard` (diekspor dari `KegiatanPage`) seperti Status Penelitian dosen: **Total Project**,
  **Project Selesai** (tahap 4) & **Project Berlangsung** (belum tahap 4, bukan ditolak) — tahapan dari `GET /dosen/proposals/as-member`
  → pilih project (`?id=`) → Laporan Harian: tabel **Riwayat Laporan Harian** bergaya Riwayat dosen
  (bingkai navy, kepala gelap, `table-tight`, kolom/aksi tetap); tombol **Input Laporan Harian** → halaman satu formulir
  `LaporanHarianInputPage.jsx` (`/project/:jenis/input?id=`, tanpa kolom samping; simpan → kembali dengan `state.flash`;
  modal lama dihapus)), **Riwayat Project** (`/riwayat-project`,
  `RiwayatProjectPage.jsx`; dulu menu "Periode" — diganti karena rancu dengan fitur Periode admin/ketua, `/periode` untuk
  mahasiswa dialihkan ke sini): project yang diikuti dikelompokkan per periode (hanya periode dari project tsb., digabung
  `GET /periode` untuk tanggal/status); tiap periode = **dropdown** (buka/tutup, jumlah project; bawaan periode aktif terbuka,
  lama tertutup; status diingat di `localStorage.riwayatProjectBuka`); klik project → `/project/:jenis?id=`),
  **Undangan Ikut Serta** (`/undangan`). Semua dari API yang sudah ada.
- **Dokumen Masuk** (Proposal Kegiatan `ProposalPage` & Laporan Kegiatan `LaporanMasukPage`, ketua & admin) memakai
  logika bersama `src/hooks/useDokumenMasuk.js` + `src/components/PeriodeAktif.jsx`: hanya periode aktif (kartu +
  jumlah perlu ditangani, klik = saring), filter bawaan "Perlu ditangani" (`diajukan`+`review`), Revisi/Disetujui/
  Ditolak/Semua (tanpa draft); data per periode × status (limit 100) digabung & dipaginasi di peramban. Dokumen
  periode lama → Periode → panel periode tab Proposal/Laporan (klik → halaman detail; `KetuaProposalDetail`/
  `AdminProposalDetail` dihapus). **Detail = halaman, bukan modal**: `ProposalMasukDetailPage.jsx` (`/proposals/detail/:id`:
  abstrak, info, mitra, luaran, hasil review, lampiran & laporan `readOnly`, dokumen utama, reviewer (Tugaskan dari
  kandidat-reviewer saat diajukan/review, hapus), tim, riwayat, **Keputusan** (`#keputusan`, tombol "Ubah Status" di daftar;
  revisi/ditolak wajib catatan, disetujui final); Admin: kartu Akses Admin + `HapusDokumen`) dan `LaporanMasukDetailPage.jsx`
  (`/laporan-masuk/detail/:id`, isi panel lama). Notifikasi & pencarian global pengelola menuju halaman ini.
- **Backup Data** (`src/pages/BackupPage.jsx`, `/backup`, admin; `src/api/backup.js`, new-api.md bagian 19): kartu
  "Backup sekarang" (`POST /backup` 202 → pantau `GET /backup/:id` tiap 1,5 dtk; info jadwal `GET /backup/jadwal`),
  lalu tabel **Daftar Backup** (`GET /backup`, filter pelaku `sumber`) dengan kolom "Dilakukan oleh" (Sistem /
  nama admin), status, file + ukuran (atau "dihapus oleh"), isi, durasi, Unduh (blob `.sql.gz`) & Hapus file.
- **Cetak Dokumen** (`src/pages/cetak/`, admin & ketua): `CetakDokumenPage` = wadah kartu dokumen
  (status konfigurasi, Cetak, Konfigurasi). (1) **Export Rekapitulasi Proposal** → konfigurasi =
  `ExportPage.jsx` lama (`/cetak-dokumen/rekap-proposal`, + "Simpan konfigurasi" filter); Cetak =
  `GET /export/proposals` + `exportToPDF`. (2) **Surat Tugas** → `SuratTugasPage`: pilih proposal
  disetujui/laporan, tugas/petugas (pengusul + anggota)/tanggal (periode)/alamat (mitra atau kampus)
  diwarisi lalu bisa diubah; PDF `utils/suratTugasPDF.js`. Konfigurasi di `localStorage`
  (`utils/cetakConfig.js`, kunci di `pages/cetak/dokumen.js`); simpan server/nomor otomatis/arsip =
  ApiPending W-42.
- **Usulan** (`src/pages/UsulanPage.jsx`, `/kegiatan/:jenis/usulan[/:id]`): wizard Identitas →
  Anggota → Dokumen → Preview untuk buat/ubah proposal (menggantikan `ProposalFormModal`, sudah
  dihapus). **Pengabdian** punya desain sendiri (5 langkah, `stepsFor(jenis)`): Identitas →
  Anggota (dosen & mahasiswa dipisah, `AnggotaSearch fixedRole`) → **Mitra** (nama → field
  `mitra`, wajib; jenis dari `GET /master/jenis-mitra`, alamat, kontak, pernyataan kebutuhan →
  `mitraJenis/Alamat/Kontak/Kebutuhan`) → Dokumen → Preview. Penelitian mengisi `skema` di Identitas. Langkah Dokumen punya editor **Target Luaran**
  (item `/luaran`: jenis dari `GET /luaran/jenis` (cadangan `LUARAN_JENIS`), **prioritas jurnal & poster** ditandai, target, tanggal target) yang disinkronkan
  (`syncLuaran`: hapus/ubah/tambah) setelah proposal tersimpan; field teks `luaran` diisi
  ringkasan item; pilihan cepat dari `GET /master/luaran`. Identitas: Rumpun Ilmu & Bidang
  (dropdown dari `src/api/master.js`), Dokumen: Kata Kunci (koma → array `kataKunci`). Tabel
  anggota menampilkan kontak (`noHp`/`kontak`), tanpa alamat. **Ketua pengusul (akun yang masuk) tidak bisa menjadi
  anggota**: `AnggotaSearch` prop `ketuaId` → hasil nonaktif "Ketua kegiatan", `addAnggota` menolak. **Aturan tim** (anggota selain ketua, `src/utils/aturanTim.js`):
  penelitian dosen 0–5 + mahasiswa ≥ 1, pengabdian dosen 1–5 + mahasiswa ≥ 1 (sama dengan backend) — panel
  `KomposisiTim` di langkah Anggota, blokir Berikutnya/Simpan & tolak tambah melebihi batas (draf tidak
  terkena). Semua isian langkah Dokumen wajib (Kata Kunci ≥ 1) kecuali **Target Luaran**; Isi Laporan:
  semua wajib termasuk Realisasi Anggaran (Link Jurnal/Video = bagian luaran, opsional). Jenis kegiatan tidak bisa diubah (mengikuti
  route/menu Kegiatan; mode ubah memakai `jenis` proposal). Tombol **Simpan draf** di tengah
  Sebelumnya/Berikutnya (semua langkah): validasi longgar (backend tetap mensyaratkan judul ≥ 5 &
  abstrak ≥ 20), POST pertama lalu PATCH (`draftId`, URL diganti ke `/usulan/:id` lewat
  `history.replaceState`), upload file & sinkron target luaran yang valid, tetap di halaman.
  Halaman laporan (`LaporanPage`) berupa satu formulir yang sudah punya "Simpan draft".
  Semua tombol buat/edit proposal mengarah ke sini. Simpan = draft, lalu upload file,
  lalu kembali ke halaman Status dengan pesan (`location.state.flash`).
- **Laporan** (API `/laporan`, `src/api/laporan.js`): pengusul di `LaporanPage.jsx`
  (`/kegiatan/:jenis/laporan/baru` pilih proposal disetujui → langsung ke wizard; `/:id` = index
  laporan: ringkasan, tombol Isi laporan, Ajukan, Hapus, hasil review; rute menyesuaikan `jenis`
  laporan) dan wizard **Isi Laporan** `LaporanIsiPage.jsx` (`/:id/isi`, desain UI Laporan
  Penelitian/Pengabdian: Informasi Umum (baca saja dari proposal + anggota) → Informasi Laporan →
  Dokumen & Luaran (file/URL, capaian luaran) → Preview; Simpan draf di tengah, Simpan → kembali
  ke index; Link Jurnal/Video = `buktiUrl` item luaran jurnal/prosiding & media_massa lewat
  `PATCH /luaran/:id/capaian`; Kata Kunci laporan (`kataKunci`, terpisah dari proposal) & Metode
  Penelitian (`metodePenelitian`, khusus penelitian) wajib di Informasi Laporan; Rumpun Ilmu laporan (dropdown master, terpisah dari proposal) juga di Informasi Laporan; helper
  `src/utils/kataKunci.js` dipakai bersama Usulan), Ketua/Admin di `LaporanMasukPage.jsx`
  (menu "Laporan Masuk"/"Laporan Kegiatan", logika Dokumen Masuk di atas;
  laporan periode lama dilihat di **Periode** → panel periode (`periode/ProposalPanel.jsx`) tab **Laporan**
  (bawaan Disetujui, klik → `/laporan-masuk?id=`); panel `?id=`: tugaskan reviewer, keputusan status; status `disetujui` final,
  form keputusan disembunyikan — sama dengan tombol Ubah Status di `ProposalPage` yang nonaktif), reviewer di tab
  Laporan `ReviewTugasanPage` (`?tab=laporan`, `pages/laporan/LaporanTugasan.jsx`). **Penugasan Review** hanya daftar (kepala = judul lalu satu kartu ringkasan teks + 3 kotak Total/Belum Selesai/Selesai, sama
  dengan Undangan; angka per tab, tab Laporan lewat `LaporanTugasan onRingkasan`); tombol
  Mulai/Lanjutkan/Lihat & Nilai membuka halaman detail di `src/pages/review/`: `ReviewProposalPage` (`/proposals/detail/:id`:
  abstrak, info, mitra, target luaran, lampiran `readOnly`, dokumen utama, tim, riwayat + form) dan `ReviewLaporanPage`
  (`/laporan-masuk/detail/:id`: isi laporan, dokumen, capaian luaran + form; terkunci bila laporan bukan `review`); form
  bersama `FormPenilaian.jsx`; `myReview` dicari dari daftar tugasan (`cariTugasan.js`, tanpa endpoint detail tugasan).
  Notifikasi `reviewer_ditugaskan` menuju halaman detail ini. Buka dokumen utama: `utils/dokumenUtama.js`. Blok bersama
  di `src/pages/laporan/` (`shared.jsx`, `format.js`, `LuaranCapaian.jsx` = daftar item luaran
  + form capaian/bukti, `editable` hanya untuk pengusul saat laporan draft/revisi).
- Foto profil: `src/components/UserAvatar.jsx` dipakai di **semua** tempat yang menampilkan orang (sidebar, profil,
  Manajemen User, tim & reviewer di Detail Kegiatan/Dokumen Masuk/panel Periode, hasil cari anggota, review laporan,
  Profil Dosen). Sumber: `user.fotoUrl` bila field ada di respons (null = tanpa foto), selain itu `GET /users/:id/foto`
  (publik) dari `user.id`/`userId`; gagal (404) → inisial, URL gagal diingat selama sesi. Daftar orang baru wajib memakainya.
- Sidebar bisa diciutkan di desktop (≥1024px) lewat **Ctrl/⌘ + B** atau tombol "Sembunyikan
  menu"; saat ciut tampil logo (bukan tombol) + rail ikon akses cepat untuk semua
  menu (anak grup Kegiatan tampil sebagai ikon sendiri, label lewat tooltip), lonceng, profil,
  dan keluar; satu-satunya tombol buka = ikon `PanelLeftOpen` (kebalikan `PanelLeftClose`) di posisi yang sama (tepat di atas profil). Menu baru wajib punya `icon` (termasuk item `children`). Sidebar dua bagian:
  **atas** terang `bg-rail-soft` (#E5EDFF: merek, menu, lalu tombol "Sembunyikan menu" tepat di
  atas profil, dengan bantuan pintasan `Ctrl`/`⌘` + `B` (`MOD_KEY`); item aktif kartu putih +
  garis brass) dan **bawah** gelap `bg-rail` (#0D1C3F: kartu profil, di bawahnya tombol
  "Keluar dari Sistem" selebar kartu profil, merah saat hover). Sisi kanan sidebar diberi
  bayangan pemisah dari konten (dihapus saat sidebar diciutkan). Lonceng memakai warna gelap di `lg:` dan putih di bilah atas ponsel.
  Keluar selalu lewat dialog konfirmasi (`ConfirmDialog`, portal ke body). Status disimpan di
  `localStorage` (`sidebarCollapsed`). Di ponsel, Ctrl/⌘ + B membuka/menutup laci.
- `/profil` = halaman **Pengaturan** (`ProfilePage.jsx`): kiri kartu ringkasan `sticky`,
  kanan Foto Profil (unggah/hapus), Informasi Profil (+ jabatan fungsional, SINTA, dropdown
  program studi, status verifikasi email `emailVerifiedAt` + kirim ulang), Ganti Password, Zona Berbahaya (unduh data, hapus akun → logout; **Ketua LPPM tidak bisa menghapus akun
  sendiri**, diganti keterangan hubungi Admin). Nilai awal
  dari `/auth/me`; simpan hanya mengirim field yang berubah dan memperbarui store lewat
  `useAuthStore.setState` tanpa `fetchMe()` (fetchMe memicu layar memuat global).
- Smooth scroll: **Lenis** (paket npm `lenis`, CSS di `main.jsx`) lewat hook
  `src/hooks/useLenis.js`. Setiap halaman menggulir di elemennya sendiri, bukan window:
  `DashboardLayout` memasang Lenis di `<section>` konten (reset ke atas saat pindah halaman),
  Login/Register di `<main>`, Manajemen User di area daftarnya. Halaman baru yang punya wadah
  gulir sendiri wajib memanggil `useLenis`. Elemen bergulir bersarang tetap jalan
  (`allowNestedScroll`); pakai `data-lenis-prevent` untuk pengecualian.
- **Detail Notifikasi** (`NotifikasiDetailPage.jsx`, `/notifikasi/:id`): dibuka dari item lonceng (klik/Enter) dan
  judul/"Lihat detail" di `/notifikasi`; notifikasi dari state navigasi atau `GET /notifications` (tanpa endpoint
  detail, dicari ≤ 5 × 100), ditandai dibaca saat dibuka; isi: ikon + label jenis, judul, pesan, tombol halaman
  terkait (`targetFor`), kartu data terkait (proposal/laporan/periode via `GET /proposals|laporan|periode/:id`:
  judul, status, pengusul, periode, tanggal, catatan revisi), panel Informasi (Dari = `pengirimFor`, karena backend
  tidak menyimpan pengirim; tanggal & waktu WIB), Hapus. Helper bersama di `src/utils/notifikasi.js`
  (`TYPE_META`, `targetFor`, `pengirimFor`).
- `/notifikasi` (`NotifikasiPage.jsx`): daftar per rentang waktu, filter Semua/Belum dibaca,
  tandai dibaca/semua, hapus, muat lebih banyak, tautan ke halaman terkait sesuai peran
  (`refType` `laporan` belum punya halaman). Dibuka dari "Lihat semua notifikasi" di lonceng.
  Lonceng & halaman disinkronkan lewat `src/utils/notificationEvents.js`; jumlah belum dibaca
  diambil dari `GET /notifications?onlyUnread=true` → `meta.total`.
- **Halaman galat**: `src/components/ErrorState.jsx` (tampilan) + `src/utils/errorCodes.js` (teks/ikon/
  ilustrasi per kode 400, 401, 403, 404, 408, 429, 500, 501, 502, 503, 504). Ilustrasi WebP latar
  transparan di `public/images/errors/` (408 & 504 berbagi `408-504.webp`; kode tanpa `image` →
  ubin ikon) tampil di depan angka kode besar. `src/pages/ErrorPage.jsx` mandiri
  dipakai untuk `/error/:code`, route tak dikenal (`*` → 404, sebelumnya redirect ke /login) dan
  `errorElement` router (galat render → 500). Fitur yang belum dibangun memakai `ErrorState`
  kode 501 di dalam layout, mis. `/luaran` (`LuaranPage.jsx`, menu Luaran dosen) — menunggu
  keputusan Pihak Kampus.
- **Jangan pakai `window.alert/confirm`.** Pakai `confirmDialog({ title, message, tone, confirmText })`
  / `alertDialog({ title, message })` dari `src/utils/dialog.js` (Promise → `true/false`), dirender
  `<DialogHost />` (dipasang di `main.jsx`) dengan `src/components/ConfirmDialog.jsx` (gaya dialog
  Keluar; tone `danger|warning|primary|info|error`). ConfirmDialog juga bisa dipakai langsung.
- **Pencarian global** (`src/components/GlobalSearch.jsx`, dipasang di `DashboardLayout`): tombol
  kaca pembesar melayang kanan bawah (bulat; hover/fokus melebar ke kiri jadi pil "Telusuri" + ikon; disembunyikan saat ada modal, `.global-search-fab` di
  `index.css`) atau **Ctrl/⌘ + F** membuka `SearchPopup` (`src/components/SearchPopup.jsx`: portal,
  kolom cari di atas, rekomendasi berkelompok di bawahnya mengikuti ketikan, ↑/↓/Enter/Esc). Latar
  di-blur dan tidak bisa digulir: kelas `search-open` di `<html>` mengunci `body` + elemen
  `data-scroll-container` (wadah gulir `DashboardLayout`, daftar Manajemen User) — wadah gulir baru
  wajib diberi atribut ini. Kunci yang sama berlaku **global untuk semua modal** (`html:has([aria-modal='true'],
  .overlay, [data-scroll-lock])` di `index.css`, laci ponsel `data-scroll-lock`, panel detail Manajemen User di bawah
  xl `data-scroll-lock-mobile`) dan Lenis berhenti lewat opsi `prevent` (`adaModalTerbuka()` di `hooks/useLenis.js`):
  modal baru wajib punya `aria-modal="true"` atau kelas `.overlay`. Sumber hasil di `src/utils/globalSearch.js`: halaman sesuai peran
  pertama + data (`search=`, limit 5) — dosen: proposal → `/kegiatan/:jenis?detail=`, laporan;
  admin/ketua: proposal → `/proposals?detail=`, laporan → `/laporan-masuk?id=`, user →
  `/users?id=`; mahasiswa: proposal tim (laporan harian). Kolom cari/filter di tiap halaman tetap
  seperti semula.
- **Breadcrumb wajib di semua halaman semua peran**: komponen bersama `src/components/Breadcrumb.jsx` (`items: [{label, to?}]`,
  "Home" → `/dashboard` otomatis di depan, item terakhir = halaman saat ini). Letak: kanan kepala halaman, baris sendiri
  rata kanan di atas judul, atau sebaris dengan tautan kembali di halaman detail. Halaman baru wajib memakainya.
- Penanda placeholder bersama: `src/components/ApiPending.jsx`.
- Komponen wizard bersama (`Stepper`, `StepCard`, `PreviewTable`, `Required`, `FieldError`):
  `src/components/Wizard.jsx` (dipakai Usulan & Isi Laporan).
- `public/` per kategori (lihat `public/README.md`): `brand/` (logo), `images/errors/`,
  `templates/` (`template-proposal.docx`, cadangan bila server belum punya template aktif — tautan Usulan = `components/TemplateProposalLink.jsx`), `legacy/` (sprite Vite, hanya `App.jsx`).
- **Intro autentikasi** (`src/components/AuthIntro.jsx`, dipasang di Login & Register, portal `z-[60]`): sekali per sesi
  (`sessionStorage.authIntroSelesai`), tidak diputar bila `prefers-reduced-motion`; klik/tombol apa pun = lewati. Urutan
  (frame desain): lencana muncul di tengah → naik → huruf L P P M naik bergiliran → subjudul "Lembaga Penelitian dan
  Pengabdian kepada Masyarakat" diketik → panel navy menyempit ke panel kiri (`[data-intro="panel"]`; ponsel: memudar),
  lencana & judul meluncur (FLIP) ke header asli `[data-intro="logo|title"]` (target yang terlihat: panel kiri di desktop,
  merek ringkas di ponsel; disembunyikan selama terbang) lalu lapisan memudar. Halaman asli tidak berubah. Web Animations API,
  hanya transform/opacity/clip-path. `LogoLppm` meneruskan props tambahan (`data-intro`).
- Logo: `src/components/LogoLppm.jsx` (`public/brand/logo-lppm.webp`, lencana resmi LPPM STMIK Triguna
  Dharma, juga favicon) dipakai di sidebar, Login/Register, halaman galat, verifikasi email.
- Ikon: **`lucide-react`** (paket npm, bukan CDN), mis. `import { Plus } from 'lucide-react'`;
  beri `aria-hidden="true"` untuk ikon dekoratif. Jangan menulis `<svg>` inline baru. Sisa
  SVG inline hanya ada di berkas tak terpakai (`App.jsx`, `DashboardDosen.jsx`,
  `DashboardMahasiswa.jsx`).
- `src/pages/periode/*`, `src/pages/ProposalDosen/*` — subkomponen halaman besar.
- `src/utils/exportPDF.js` (jspdf + autotable), `exportExcel.js` (xlsx).
- Gaya: Tailwind 4 dengan token di `@theme` `src/index.css` (skala `navy-*`, aksen
  `brass-*`, kanvas `#f4f6fa`) dan kelas komponen `.btn*`, `.card`, `.badge-*`, `.input`,
  `.table*`, `.dialog`, dll. Font Newsreader + Plus Jakarta Sans. Tanpa gradien/emoji/
  label huruf besar. Gunakan kelas yang sudah ada, jangan buat palet baru.

### Catatan / sisa kode
- `DashboardPage.jsx`, `DashboardDosen.jsx`, `DashboardMahasiswa.jsx` masih ada di
  `src/pages/` tetapi **tidak dipakai** (diganti `pages/dashboard/`); `ProfileModal.jsx`
  juga tidak dipakai. `recharts` hanya dipakai oleh berkas-berkas tak terpakai itu.
- Dashboard baru belum diuji terhadap backend asli (lihat CATATAN_REDESIGN.md).

## Konvensi kerja
- Sebelum push perubahan backend: `go vet ./... && go test ./...`; untuk frontend:
  `npm run lint && npm run build`.
- Jangan commit `.env`, `node_modules/`, `dist/`, `logs/`, atau binary `bin/`.
- Jika mengubah kontrak API, perbarui pemanggil di `frontend/src/api/` dan dokumen ini.
