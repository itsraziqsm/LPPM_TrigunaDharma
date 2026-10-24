# Daftar API yang Ditunggu (waiting API)

Bagian UI yang sudah dibuat tetapi **belum punya endpoint backend**. Di tampilan, bagian ini
berisi placeholder `—` dengan penanda kuning bergaris putus-putus **"API belum ada"**
(komponen `ApiPending`). Setelah endpoint tersedia, sambungkan datanya lalu hapus baris
terkait dari daftar ini.

Backend acuan: `backend_go/` (satu-satunya backend; endpoint lama tetap kompatibel dengan kontrak
Node, API baru didokumentasikan di `backend_go/new-api.md`, lihat `CLAUDE.md`).

## API sudah tersedia — tinggal disambungkan di frontend

Endpoint di bawah sudah ada di backend (detail & contoh respons: `backend_go/new-api.md`
bagian 12 untuk Grup C, bagian 13 untuk W-22 sampai W-25) tetapi **belum disambungkan** di frontend. Setelah UI-nya disambungkan
dan penanda `ApiPending` dihapus, pindahkan barisnya ke tabel "Sudah disambungkan".

| ID | Elemen UI | API yang tersedia | Catatan untuk frontend |
|---|---|---|---|
| W-01 | Dashboard dosen: Luaran Dapat Diklaim | `GET /luaran/stats` → `dapatDiklaim` (tercapai + laporan disetujui) | Luaran = output kegiatan yang dijanjikan di proposal (bukan menu `/luaran` pencairan dana). |
| W-02 | Profil: Jurnal · Statistik Dosen: Jurnal Diterbitkan | `GET /luaran/stats` → `jurnal` | |
| W-12 | Kegiatan: Luaran tercatat & daftar luaran per kegiatan | `GET /luaran/stats` → `total`; item per proposal `GET /luaran/proposal/:proposalId` (+ CRUD target, capaian, bukti) | Target diisi di wizard Usulan (setelah draft tersimpan), capaian di halaman laporan. |
| W-06 | Profil: Nilai Kepercayaan | `GET /dosen/kepercayaan` → `{ nilai, skala: 5, komponen[] }` | `nilai` bisa `null` untuk dosen tanpa riwayat; rumus di new-api.md 12.2. |
| W-22 | Usulan: Rumpun Ilmu & Bidang | Field `rumpunIlmu`, `bidang` di create/update/respons proposal; pilihan dari `GET /master/rumpun-ilmu`, `GET /master/bidang?jenis=…` | Nilai disimpan sebagai teks (nama dari master). |
| W-23 | Usulan: Kontak di tabel Anggota | `kontak`, `noHp` di `GET /users/search`, `members/search`, dan `anggota[].user` | **Alamat tidak disediakan** (keputusan privasi). Hapus kolom Alamat dari UI. |
| W-24 | Usulan: Kata Kunci | Field `kataKunci` (array string, maks 10 × 50 karakter) di create/update/respons proposal | Respons selalu array; `[]` mengosongkan. |
| W-25 | Usulan: pilihan Luaran Tambahan | `GET /master/luaran?jenis=…` | 7 pilihan pertama sama dengan `LUARAN_OPTIONS`; ganti daftar statis. |
| W-18 | Pengaturan: Status verifikasi email + kirim ulang | `emailVerifiedAt` di `/auth/me`; `POST /auth/verify-email/resend`; `POST /auth/verify-email` | Perlu halaman publik `/verify-email?token=` yang memanggil verify. |

### Sudah disambungkan

Grup A (`new-api.md` bagian 10) dan Grup B (bagian 11):

| ID | Disambungkan di |
|---|---|
| W-03 / W-13 | Field `tahapan` → Usulan Terakhir (dashboard) dan kolom Tahapan (Status Kegiatan) |
| W-04 | SINTA ID & skor → input Pengaturan, kartu Nilai Sinta (dashboard) |
| W-07 / W-10 | Foto profil → unggah/hapus di Pengaturan; tampil di dashboard, kartu Pengaturan, sidebar (`UserAvatar`) |
| W-08 / W-09 | Field profil + jabatan fungsional dari `/auth/me` → dashboard & form Pengaturan |
| W-11 / W-17 | `GET /dosen/proposals/stats?jenis=` (+ `review`) → dashboard & Status Kegiatan (1 permintaan) |
| W-14 / W-15 | `skema` (input di Identitas, penelitian) / `mitra` (langkah Mitra, pengabdian) + kolom di Riwayat |
| W-16 | Bagian "sebagai anggota tim" di Status Kegiatan (`as-member`), detail via `GET /proposals/:id` |
| W-19 | Dropdown Program Studi di Pengaturan (`GET /program-studi`) |
| W-20 / W-21 | Unduh data akun & Hapus akun (konfirmasi password, lalu logout) di Zona Berbahaya |

## Dashboard Dosen (`frontend/src/pages/dashboard/DosenScreen.jsx`)

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Dokumen Diterima / Ditolak / Diproses | `GET /dosen/proposals/stats` (`disetujui`, `ditolak`, `diajukan` + `review`) |
| Usulan Terakhir (judul, status, jenis, periode) | `GET /dosen/proposals?limit=6` (baris pertama) |
| Tahapan usulan | field `tahapan` {label, urutan} di proposal |
| Profil: Pengabdian, Penelitian | `GET /dosen/proposals?jenis=…&status=disetujui&limit=1` → `meta.total` |
| Nama, email, foto, jabatan fungsional, No. HP, NIDN, institusi, TTL, prodi, SINTA | `GET /auth/me` |

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-05 | Profil: **Sertifikasi** | Jumlah sertifikasi dosen | `GET /dosen/sertifikasi/stats` → `{ total: number }` | **Ditunda** (keputusan pemilik proyek). Belum ada tabel sertifikasi. |

## Menu Kegiatan → Status Penelitian / Pengabdian (`frontend/src/pages/KegiatanPage.jsx`)

Route `/kegiatan/penelitian` dan `/kegiatan/pengabdian` (dosen), dari grup menu **Kegiatan** di
sidebar.

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Kartu **Proposal Aktif** (draft+diajukan+review+revisi), **Proposal Diterima**, jumlah per chip status | `GET /dosen/proposals/stats?jenis=…` |
| Kartu **Laporan Diterima** | `GET /laporan/my?jenis=…&status=disetujui&limit=1` → `meta.total` |
| Riwayat tab **Proposal** (tanggal upload/update, judul, status, target `luaran`), cari, filter, paginasi | `GET /dosen/proposals?jenis=…&status=…&search=…&page=…&limit=10` |
| Riwayat tab **Proposal**: Skema/Mitra, Tahapan | field `skema`/`mitra`, `tahapan` |
| Riwayat tab **Laporan** (status, `luaranTercapai`), tombol Lengkapi/Detail → halaman laporan | `GET /laporan/my?jenis=…&status=…&search=…&page=…&limit=10` |
| Bagian **sebagai anggota tim** | `GET /dosen/proposals/as-member` |
| Tombol Detail / Edit proposal | `GET /dosen/proposals/:id` (modal detail) / halaman Usulan |

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|

## Usulan Penelitian / Pengabdian (`frontend/src/pages/UsulanPage.jsx`)

Route `/kegiatan/:jenis/usulan` (buat) dan `/kegiatan/:jenis/usulan/:id` (ubah, hanya draft/revisi).
Menggantikan modal Buat/Edit Proposal. Penelitian: Identitas → Anggota → Dokumen → Preview.
Pengabdian (desain terpisah): Identitas → Anggota (dosen & mahasiswa dipisah) → **Mitra** → Dokumen → Preview.

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Judul, jenis, periode (+ Tahun Pelaksanaan dari `periode.tahun`), anggaran, abstrak, anggota + peran | `POST /dosen/proposals` / `PATCH /dosen/proposals/:id` (`anggotaIds`), `GET /periode?isAktif=true` |
| Luaran Tambahan | field `luaran` (string) di create/update — API baru |
| Skema Penelitian (Identitas, penelitian) · Nama Mitra (langkah Mitra, pengabdian, wajib) | field `skema` / `mitra` |
| Upload Proposal (wajib di wizard) | `POST /proposals/:id/dokumen-utama` setelah proposal tersimpan |
| Cari anggota | `GET /users/search` |
| Ketua Pengusul | user yang login (`GET /auth/me`) |

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-26 | Langkah **Mitra** (pengabdian): **Jenis Mitra**, **Alamat Mitra**, **Kontak Mitra**, **Pernyataan Kebutuhan** | Detail mitra selain nama | Kolom `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan` di Pengabdian (ikut create/update/respons, disalin ke laporan) atau tabel `Mitra` + master jenis mitra | Saat ini hanya nama mitra yang tersimpan (field `mitra`). Input lain nonaktif. |

## Laporan kegiatan (API `/laporan`, `backend_go/new-api.md` bagian 3–5)

Semua sudah tersambung, tidak ada placeholder:

| Halaman | Route | API |
|---|---|---|
| Buat laporan (pilih proposal disetujui) | `/kegiatan/:jenis/laporan/baru` (`LaporanPage.jsx`) | `GET /laporan/eligible`, `POST /laporan` |
| Isi/ajukan/hapus/detail laporan (pengusul; anggota baca saja) | `/kegiatan/:jenis/laporan/:id` | `GET/PATCH/DELETE /laporan/:id`, `POST /laporan/:id/dokumen`, `POST /laporan/:id/submit`, `GET /laporan/:id/dokumen` |
| Laporan Masuk (Ketua LPPM/Admin): tugaskan reviewer, keputusan | `/laporan-masuk[?id=]` (`LaporanMasukPage.jsx`) | `GET /laporan`, `POST/DELETE /laporan/:id/reviewers`, `PATCH /laporan/:id/status` |
| Tab Laporan di Penugasan Review (reviewer) | `/penugasan?tab=laporan` | `GET /laporan/tugasan`, `POST /laporan/:id/reviews[/finalize]` |
| Tautan notifikasi `refType: laporan` | `/notifikasi` | — |

## Pengaturan (`frontend/src/pages/ProfilePage.jsx`, route `/profil`)

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Simpan Informasi Profil | `PATCH /users/profile/me` — hanya field yang diubah yang dikirim; respons (profil lengkap) dipakai mengisi ulang form & ringkasan |
| Ganti Password | `PATCH /users/profile/password` (validasi frontend: minimal 8 karakter, konfirmasi cocok) |
| Nama, email, peran, status, nilai awal semua field profil, jabatan fungsional, SINTA | `GET /auth/me` |
| Foto profil (unggah/hapus) | `POST/DELETE /users/profile/foto`, `fotoUrl` |
| Program studi (dropdown) | `GET /program-studi` |
| Unduh data akun · Hapus akun | `GET /users/profile/export` · `DELETE /users/profile/me` |

Data yang **menunggu API**: tidak ada lagi. Verifikasi email (W-18) sudah tersedia di backend
tetapi belum disambungkan, lihat bagian "API sudah tersedia" di atas.

## Elemen desain yang belum dibuat (bukan soal API)

- Grup menu **Kegiatan → Penelitian, Pengabdian** sudah dibuat (khusus dosen).
- Menu **Luaran** (`/luaran`, dosen) sudah ada tetapi menampilkan **501 Not Implemented**:
  fitur menunggu kelanjutan perkembangan dari Pihak Kampus (berkaitan dengan W-01).
- Menu **Panduan** dari desain belum ada halamannya.
- Halaman **Pengaturan** sudah ada di `/profil` (dibuka dari kartu nama di bawah sidebar).
