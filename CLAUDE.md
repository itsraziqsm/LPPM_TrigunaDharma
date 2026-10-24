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
- `backend_go/new-api.md` — API baru (fitur laporan, Grup A waiting API) untuk developer FE;
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
   `mitra`; `/auth/me` ikut mengirim field profil; `/dosen/proposals/stats` punya key `review`.
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
python3 scripts/e2e.py http://localhost:3000   # 335 cek E2E; HANYA DB dev ter-seed, TRUST_PROXY=true
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
| `/auth` | login, refresh, logout, logout-all, register/dosen, register/mahasiswa, forgot-password, reset-password, me (+ field profil & `jabatanFungsional`) | publik / login |
| `/users` | search, profile/me (GET; PATCH field profil saja + `jabatanFungsional`), profile/password, list, `/:id`, `/:id/status`, `/:id/roles`, delete | list/detail admin+ketua; status/roles/delete admin |
| `/periode` | list, detail, create, update; hapus 2 langkah via `deletion-request` (+ approve/cancel) | tulis: admin+ketua |
| `/proposals` | list (admin/ketua/reviewer), `/my`, detail, create/update/submit (dosen/mhs), `/:id/status` (ketua/admin), delete, `dokumen-utama` upload/download | sesuai kolom |
| `/proposals/:id/reviewers`, `/reviews`, `/reviews/finalize` | tugaskan/hapus reviewer (ketua/admin); simpan & finalisasi review (reviewer) | |
| `/proposals/:id/laporan`, `/laporan/:id[/download]` | laporan `kemajuan`/`akhir` (file atau URL) | dosen/mhs; admin edit/hapus |
| `/proposals/:id/dokumen`, `/dokumen/:id[/download]` | dokumen lampiran | dosen/mhs; admin hapus |
| `/dosen/proposals` | stats (`?jenis=`, + key `review`), `as-member` (proposal orang lain tempat user anggota `diterima`), members/search, invitations (+ PATCH respon), CRUD + submit | dosen, mahasiswa |
| `/program-studi` | list (`?semua=true` termasuk nonaktif), create, `/:id` update/delete | GET publik; tulis admin |
| `/mahasiswa/laporan-harian` | proposals, `/:proposalId` list/create (upload/link GDrive), dokumen/:id, delete | mahasiswa anggota |
| `/reviewer/my-tugasan` | tugasan review **proposal** milik user | reviewer, dosen, mahasiswa |
| `/laporan` | list (admin, ketua), `/my`, `/eligible`, `/tugasan`, create, detail, update, submit, delete, `/:id/dokumen` upload/download, `/:id/status` (ketua/admin), `/:id/reviewers` (+ `DELETE /:reviewerId`), `/:id/reviews` (+ `/finalize`) | lihat `backend_go/new-api.md` |
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
Tabel: `Role`, `User` (+ `jabatanFungsional`), `UserRole`, `RefreshToken`, `PasswordResetToken`, `Periode`
(`jenis`: penelitian|pengabdian, `isAktif`), `Kegiatan` (registri id global: `jenis`, `tipe`),
`Penelitian` dan `Pengabdian` (kolom identik: kolom proposal lama tanpa `jenis` + `tipe`
ENUM('proposal','laporan'), `proposalId` (laporan → proposal asal), `luaran`,
`luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`; plus `skema` hanya di Penelitian dan
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
`/auth/me` + field profil; stats + `review` & `?jenis=`.

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
  `/kegiatan/pengabdian`, `/kegiatan/:jenis/usulan[/:id]` (dosen), `/notifikasi` (semua peran), `/undangan`
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
  dihapus). Semua tombol buat/edit proposal mengarah ke sini. Simpan = draft, lalu upload file,
  lalu kembali ke halaman Status dengan pesan (`location.state.flash`).
- Sidebar bisa diciutkan di desktop (≥1024px) lewat **Ctrl/⌘ + B** atau tombol "Sembunyikan
  menu"; saat ciut tampil logo (klik untuk membuka) + rail ikon akses cepat untuk semua
  menu (anak grup Kegiatan tampil sebagai ikon sendiri, label lewat tooltip), lonceng, profil,
  dan keluar. Menu baru wajib punya `icon` (termasuk item `children`). Status disimpan di
  `localStorage` (`sidebarCollapsed`). Di ponsel, Ctrl/⌘ + B membuka/menutup laci.
- `/profil` = halaman **Pengaturan** (`ProfilePage.jsx`): kiri kartu ringkasan `sticky`,
  kanan Foto Profil, Informasi Profil, Ganti Password, Zona Berbahaya. Simpan profil hanya
  mengirim field yang berubah (nilai awal bisa kosong karena `/auth/me` belum membawa field
  profil) dan memperbarui nama di store tanpa `fetchMe()`.
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
