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
- `backend_go/new-api.md` — API baru (fitur laporan, Grup A, B, C, W-22–W-25) untuk developer FE;
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
   `mitra`, `rumpunIlmu`, `bidang`, `kataKunci`, `tahapan` (+ `kontak`/`noHp` di `anggota[].user`
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
go run ./cmd/server             # default PORT=3000
go test ./...                   # unit test tanpa DB (config, database, httpapi/compat_test)
python3 scripts/e2e.py http://localhost:3000   # 448 cek E2E; HANYA DB dev ter-seed, TRUST_PROXY=true
docker compose up --build       # app :3233 + MySQL 8 (host :3307), migrasi otomatis saat start
```

### Arsitektur
- `cmd/server` (HTTP, graceful shutdown), `cmd/migrate` (runner kompatibel Prisma),
  `cmd/seed`.
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
`admin`, `ketua_lppm` (dulu `ketua_prpm`, sudah dimigrasi), `dosen`, `reviewer`, `mahasiswa`.
User bisa punya banyak peran. Registrasi publik hanya dosen/mahasiswa dengan status
`pending`; login ditolak sampai admin mengubah status ke `approved` (`pending|approved|rejected`).
Dosen/mahasiswa yang memiliki baris `ReviewerTugasan` mendapat `hasTugasan: true` di `/auth/me`
dan diperlakukan sebagai reviewer di UI.

### Endpoint (`/api/v1`, semua butuh Bearer token kecuali auth publik & `/health`)
| Grup | Endpoint utama | Akses |
|---|---|---|
| `/auth` | login, refresh, logout, logout-all, register/dosen, register/mahasiswa, forgot-password, reset-password, me (+ field profil, `emailVerifiedAt`), verify-email/resend (login), verify-email (publik) | publik / login |
| `/users` | search, profile/me (GET; PATCH field profil + `jabatanFungsional`, `sintaId`, `sintaScore`; DELETE = hapus akun sendiri, wajib password), profile/export (file JSON), profile/foto (POST multipart / DELETE), `/:id/foto` (GET **publik**, router terpisah sebelum `/users`), profile/password, list, `/:id`, `/:id/status`, `/:id/roles`, delete | list/detail admin+ketua; status/roles/delete admin |
| `/periode` | list, detail, create, update; hapus 2 langkah via `deletion-request` (+ approve/cancel) | tulis: admin+ketua |
| `/proposals` | list (admin/ketua/reviewer), `/my`, detail, create/update/submit (dosen/mhs), `/:id/status` (ketua/admin), delete, `dokumen-utama` upload/download | sesuai kolom |
| `/proposals/:id/reviewers`, `/reviews`, `/reviews/finalize` | tugaskan/hapus reviewer (ketua/admin); simpan & finalisasi review (reviewer) | |
| `/proposals/:id/laporan`, `/laporan/:id[/download]` | laporan `kemajuan`/`akhir` (file atau URL) | dosen/mhs; admin edit/hapus |
| `/proposals/:id/dokumen`, `/dokumen/:id[/download]` | dokumen lampiran | dosen/mhs; admin hapus |
| `/dosen/proposals` | stats (`?jenis=`, + key `review`), `as-member` (proposal orang lain tempat user anggota `diterima`), members/search, invitations (+ PATCH respon), CRUD + submit | dosen, mahasiswa |
| `/program-studi` | list (`?semua=true` termasuk nonaktif), create, `/:id` update/delete | GET publik; tulis admin |
| `/master/:kategori` | `rumpun-ilmu`, `bidang`, `luaran`: list (`?jenis=`, `?semua=true`), create, `/:id` update/delete | GET login; tulis admin |
| `/mahasiswa/laporan-harian` | proposals, `/:proposalId` list/create (upload/link GDrive), dokumen/:id, delete | mahasiswa anggota |
| `/reviewer/my-tugasan` | tugasan review **proposal** milik user | reviewer, dosen, mahasiswa |
| `/laporan` | list (admin, ketua), `/my`, `/eligible`, `/tugasan`, create, detail, update, submit, delete, `/:id/dokumen` upload/download, `/:id/status` (ketua/admin), `/:id/reviewers` (+ `DELETE /:reviewerId`), `/:id/reviews` (+ `/finalize`) | lihat `backend_go/new-api.md` |
| `/luaran` | `/stats`, `/proposal/:proposalId`, create, `/:id` update/delete (target: proposal draft/revisi), `/:id/capaian`, `/:id/bukti` upload/download (capaian: proposal disetujui & laporan belum diajukan) | pengusul tulis; baca = akses proposal |
| `/dosen/kepercayaan` | nilai kepercayaan 0–5 (`?userId=` admin/ketua) | dosen, mahasiswa, admin, ketua |
| `/notifications` | list, read-all, `/:id/read`, delete | login |
| `/dashboard/stats` | statistik | admin, ketua |
| `/activity-logs` | `/my`; list semua (admin, ketua) | |
| `/export/proposals` | data export | admin, ketua |

### Aturan bisnis penting
- Status proposal: `draft → diajukan → review → revisi|disetujui|ditolak`.
  - Edit & submit hanya saat `draft`/`revisi`; hapus hanya saat `draft`.
  - Submit lewat `/dosen/proposals/:id/submit` mewajibkan **semua anggota sudah menerima
    undangan** (`ProposalAnggota.statusUndangan`: `pending|diterima|ditolak`).
  - Menugaskan reviewer hanya untuk status `diajukan`/`review`, dan otomatis set `review`.
  - Field `tahapan` `{kode,label,urutan}` dihitung (tidak disimpan): belum `disetujui` →
    seleksi_usulan(1); disetujui + laporan tidak ada/draft → pelaksanaan(2); laporan
    diajukan/review/revisi/ditolak → seleksi_lanjutan(3); laporan disetujui → pasca_pelaksanaan(4).
  - `rumpunIlmu`, `bidang` (teks bebas, pilihan dari `MasterData`), `kataKunci` (array maks
    10 × 50 karakter, disimpan JSON di TEXT, respons selalu array).
  - `skema` hanya untuk penelitian, `mitra` hanya untuk pengabdian (400 jika salah jenis);
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
  (judul, abstrak, anggaran, `luaran`, periode) disalin. Kolom khusus: `luaranTercapai`,
  `ringkasanHasil`, `realisasiAnggaran`. Status sama dengan proposal. Edit/upload saat
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
  (Menu `/luaran` di frontend = pencairan dana, hal lain, menunggu kampus.)
- **Nilai kepercayaan** = 5 × rata-rata komponen yang ada datanya (persetujuan proposal,
  persetujuan laporan dari proposal disetujui yang periodenya selesai/laporannya diputuskan,
  rekomendasi reviewer final 1/0,5/0, ketepatan waktu luaran ≤ targetTanggal).
- **Verifikasi email** opsional (login tetap bisa): token 24 jam di `EmailVerificationToken`,
  link `FRONTEND_URL/verify-email?token=`; user lama & seed dianggap terverifikasi; tanpa
  `SMTP_HOST` di luar production link hanya di-log.
- Hapus periode: admin/ketua membuat permintaan (berlaku 1 hari), harus disetujui pihak
  **lain** dengan password — admin ↔ ketua (peminta dan penyetuju tidak boleh sama-sama
  admin atau sama-sama non-admin). Notifikasi `deletion_request|approved|cancelled`.
- Notifikasi (`NotifType`): `proposal_diajukan`, `proposal_disetujui`, `proposal_ditolak`,
  `proposal_revisi`, `reviewer_ditugaskan`, `review_selesai`, `laporan_diunggah`,
  `deletion_request`, `deletion_approved`, `deletion_cancelled`, `laporan_diajukan`,
  `laporan_disetujui`, `laporan_ditolak`, `laporan_revisi` (notifikasi laporan memakai
  `refType: "laporan"`).
- Aksi penting dicatat ke `ActivityLog` (dengan `ipAddress`, `userAgent`).

### Database (MySQL/MariaDB)
Tabel: `Role`, `User` (+ `jabatanFungsional`, `sintaId`, `sintaScore`, `deletedAt`, `emailVerifiedAt`),
`EmailVerificationToken`, `LuaranKegiatan` (item luaran per proposal, bukti blob), `MasterData`
(`kategori` rumpun_ilmu|bidang|luaran, `nama` unik per kategori, `jenisKegiatan` NULL = keduanya,
`jenisLuaran`, `urutan`, `isAktif`), `UserFoto`
(foto profil: `userId` PK, blob, mime, ukuran), `UserRole`, `RefreshToken`, `PasswordResetToken`, `Periode`
(`jenis`: penelitian|pengabdian, `isAktif`), `Kegiatan` (registri id global: `jenis`, `tipe`),
`Penelitian` dan `Pengabdian` (kolom identik: kolom proposal lama tanpa `jenis` + `tipe`
ENUM('proposal','laporan'), `proposalId` (laporan → proposal asal), `luaran`,
`luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `rumpunIlmu`, `bidang`, `kataKunci`; plus `skema` hanya di Penelitian dan
`mitra` hanya di Pengabdian), `ProgramStudi` (master: `nama` unik, `jenjang`, `isAktif`;
`User.programStudi/prodi` tetap teks bebas), `ProposalAnggota`,
`ReviewerTugasan`, `ProposalReview`, `LaporanProposal`, `DokumenLampiran`, `LaporanHarian`,
`Notification`, `ActivityLog`, `PeriodeDeletionRequest`, `_prisma_migrations`.
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
export & hapus akun sendiri; luaran kegiatan, nilai kepercayaan, verifikasi email; rumpun ilmu/bidang/kata kunci + master data.

### Akun seed (`cmd/seed`)
`admin@lppm.dev/admin123456`, `ketua@lppm.dev/ketua123456`,
`wakil.ketua@lppm.dev/wakil123456` (ketua_lppm+dosen), `reviewerN@lppm.dev/reviewer123`,
`dosenN@lppm.dev/dosen123456`, `mahasiswaN@lppm.dev/mhs1234567`, plus akun
`pending.*`/`rejected.*` untuk uji status.

## Frontend (`frontend/`)

### Perintah
```bash
npm install
npm run dev       # Vite, http://localhost:5173 (cocokkan CORS_ORIGIN backend)
npm run build
npm run lint      # baseline: 0 error, 4 peringatan lama
```
Base URL API: `VITE_API_URL` (default `http://localhost:3000/api/v1`, di `src/api/axios.js`).

### Arsitektur
- `src/router/index.jsx` — `GuestRoute` (`/login`, `/register`) dan `PrivateRoute`; semua
  halaman privat merender `DashboardLayout` dengan prop `page`: `/dashboard`, `/periode`,
  `/proposals`, `/users`, `/export` (admin/ketua), `/proposal-saya`, `/kegiatan/penelitian`,
  `/kegiatan/pengabdian`, `/kegiatan/:jenis/usulan[/:id]`, `/kegiatan/:jenis/laporan/(baru|:id)`,
  `/luaran` (dosen), `/laporan-masuk` (admin/ketua), `/notifikasi` (semua peran), `/undangan`
  (dosen/mhs), `/laporan-harian` (mhs), `/penugasan` (reviewer / punya tugasan), `/profil`.
- `src/pages/DashboardLayout.jsx` — pemilihan halaman berdasarkan **peran pertama**
  (`roles[0]`) + `isReviewer` (`roles` berisi reviewer atau `hasTugasan`). `Sidebar.jsx`
  memakai logika yang sama; ubah keduanya bersamaan.
- `src/store/authStore.js` (Zustand) — token di `localStorage` (`accessToken`,
  `refreshToken`); `fetchMe()` mengisi `user`.
- `src/api/axios.js` — interceptor Bearer token + auto refresh saat 401, gagal → logout.
- `src/api/*.js` — satu modul per domain (`proposalApi`, `proposalDosenApi`, dst.).
- `src/pages/dashboard/` — dashboard seragam semua peran; data per peran lewat
  `adapters/` (`pengelola`, `dosen`, `mahasiswa`, `reviewer`, `shared`). Status Inggris &
  Indonesia dipetakan ke satu kunci.
- Dashboard **dosen** memakai tampilan revamp sendiri `src/pages/dashboard/DosenScreen.jsx`
  (kartu dokumen, usulan terakhir + tahapan, profil capaian, statistik dosen, lalu blok
  bersama `DashboardBody` tanpa ledger). Data dari `adapters/dosen.js` (`model.dosen`).
  Bagian tanpa endpoint memakai penanda `ApiPending` ("API belum ada") dan **wajib**
  dicatat di `docs/waitingApi-list.md`; hapus barisnya setelah API tersedia.
- Menu **Kegiatan** (dosen) di `Sidebar.jsx` adalah grup bertingkat (item dengan `children`,
  dirender `NavGroup`) berisi `/kegiatan/penelitian` & `/kegiatan/pengabdian` →
  `src/pages/KegiatanPage.jsx` (prop `jenis`, di-`key` per jenis) = halaman **Status
  Penelitian/Pengabdian**: kartu Proposal Aktif/Diterima & Laporan Diterima, tombol Usulan &
  Laporan, Riwayat tab Proposal (`/dosen/proposals`) / Laporan (`/laporan/my`, `src/api/laporan.js`).
- **Usulan** (`src/pages/UsulanPage.jsx`, `/kegiatan/:jenis/usulan[/:id]`): wizard Identitas →
  Anggota → Dokumen → Preview untuk buat/ubah proposal (menggantikan `ProposalFormModal`, sudah
  dihapus). **Pengabdian** punya desain sendiri (5 langkah, `stepsFor(jenis)`): Identitas →
  Anggota (dosen & mahasiswa dipisah, `AnggotaSearch fixedRole`) → **Mitra** (nama → field
  `mitra`, wajib) → Dokumen → Preview. Penelitian mengisi `skema` di Identitas. Semua tombol buat/edit proposal mengarah ke sini. Simpan = draft, lalu upload file,
  lalu kembali ke halaman Status dengan pesan (`location.state.flash`).
- **Laporan** (API `/laporan`, `src/api/laporan.js`): pengusul di `LaporanPage.jsx`
  (`/kegiatan/:jenis/laporan/baru` pilih proposal disetujui; `/:id` isi, unggah, ajukan, hapus,
  hasil review; rute menyesuaikan `jenis` laporan), Ketua/Admin di `LaporanMasukPage.jsx`
  (menu "Laporan Masuk", panel `?id=`: tugaskan reviewer, keputusan status), reviewer di tab
  Laporan `ReviewTugasanPage` (`?tab=laporan`, `pages/laporan/LaporanTugasan.jsx`). Blok bersama
  di `src/pages/laporan/` (`shared.jsx`, `format.js`).
- Foto profil: `src/components/UserAvatar.jsx` (`API_BASE_URL + user.fotoUrl`, fallback inisial).
- Sidebar bisa diciutkan di desktop (≥1024px) lewat **Ctrl/⌘ + B** atau tombol "Sembunyikan
  menu"; saat ciut tampil logo (klik untuk membuka) + rail ikon akses cepat untuk semua
  menu (anak grup Kegiatan tampil sebagai ikon sendiri, label lewat tooltip), lonceng, profil,
  dan keluar. Menu baru wajib punya `icon` (termasuk item `children`). Kaki sidebar terdiri
  dari bagian **akun** (kartu profil, latar rail) dan bagian **aksi** (latar `bg-navy-800`):
  tombol Sembunyikan menu + Keluar (merah saat hover). Keluar selalu lewat `LogoutDialog`
  (konfirmasi, portal ke body). Status disimpan di
  `localStorage` (`sidebarCollapsed`). Di ponsel, Ctrl/⌘ + B membuka/menutup laci.
- `/profil` = halaman **Pengaturan** (`ProfilePage.jsx`): kiri kartu ringkasan `sticky`,
  kanan Foto Profil (unggah/hapus), Informasi Profil (+ jabatan fungsional, SINTA, dropdown
  program studi), Ganti Password, Zona Berbahaya (unduh data, hapus akun → logout). Nilai awal
  dari `/auth/me`; simpan hanya mengirim field yang berubah dan memperbarui store lewat
  `useAuthStore.setState` tanpa `fetchMe()` (fetchMe memicu layar memuat global).
- Smooth scroll: **Lenis** (paket npm `lenis`, CSS di `main.jsx`) lewat hook
  `src/hooks/useLenis.js`. Setiap halaman menggulir di elemennya sendiri, bukan window:
  `DashboardLayout` memasang Lenis di `<section>` konten (reset ke atas saat pindah halaman),
  Login/Register di `<main>`, Manajemen User di area daftarnya. Halaman baru yang punya wadah
  gulir sendiri wajib memanggil `useLenis`. Elemen bergulir bersarang tetap jalan
  (`allowNestedScroll`); pakai `data-lenis-prevent` untuk pengecualian.
- `/notifikasi` (`NotifikasiPage.jsx`): daftar per rentang waktu, filter Semua/Belum dibaca,
  tandai dibaca/semua, hapus, muat lebih banyak, tautan ke halaman terkait sesuai peran
  (`refType` `laporan` belum punya halaman). Dibuka dari "Lihat semua notifikasi" di lonceng.
  Lonceng & halaman disinkronkan lewat `src/utils/notificationEvents.js`; jumlah belum dibaca
  diambil dari `GET /notifications?onlyUnread=true` → `meta.total`.
- **Halaman galat**: `src/components/ErrorState.jsx` (tampilan) + `src/utils/errorCodes.js` (teks/ikon
  per kode 400, 401, 403, 404, 408, 429, 500, 501, 502, 503, 504). `src/pages/ErrorPage.jsx` mandiri
  dipakai untuk `/error/:code`, route tak dikenal (`*` → 404, sebelumnya redirect ke /login) dan
  `errorElement` router (galat render → 500). Fitur yang belum dibangun memakai `ErrorState`
  kode 501 di dalam layout, mis. `/luaran` (`LuaranPage.jsx`, menu Luaran dosen) — menunggu
  keputusan Pihak Kampus.
- Penanda placeholder bersama: `src/components/ApiPending.jsx`.
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
- `src/public/` adalah salinan lama dari `public/` (favicon berbeda); yang dipakai Vite
  adalah `public/` (termasuk `template-proposal.docx`).
- Dashboard baru belum diuji terhadap backend asli (lihat CATATAN_REDESIGN.md).

## Konvensi kerja
- Sebelum push perubahan backend: `go vet ./... && go test ./...`; untuk frontend:
  `npm run lint && npm run build`.
- Jangan commit `.env`, `node_modules/`, `dist/`, `logs/`, atau binary `bin/`.
- Jika mengubah kontrak API, perbarui pemanggil di `frontend/src/api/` dan dokumen ini.
