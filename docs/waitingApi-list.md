# Daftar API yang Ditunggu (waiting API)

Bagian UI yang sudah dibuat tetapi **belum punya endpoint backend**. Di tampilan, bagian ini
berisi placeholder `—` dengan penanda kuning bergaris putus-putus **"API belum ada"**
(komponen `ApiPending`). Setelah endpoint tersedia, sambungkan datanya lalu hapus baris
terkait dari daftar ini.

Backend acuan: `backend_go/` (satu-satunya backend; endpoint lama tetap kompatibel dengan kontrak
Node, API baru didokumentasikan di `backend_go/new-api.md`, lihat `CLAUDE.md`).

## API sudah tersedia — tinggal disambungkan di frontend

Endpoint di bawah sudah ada di backend (detail & contoh respons: `backend_go/new-api.md`
bagian 10 untuk Grup A, bagian 11 untuk Grup B). Setelah UI-nya disambungkan dan penanda `ApiPending` dihapus, hapus barisnya dari
tabel ini.

| ID | Elemen UI | API yang tersedia | Catatan untuk frontend |
|---|---|---|---|
| W-08 | Dashboard dosen: No. HP, NIDN/NIDK, Institusi, TTL, Program Studi · Pengaturan: nilai awal form Informasi Profil & Ringkasan | `GET /auth/me` kini mengirim `nidn`, `nim`, `prodi`, `programStudi`, `institusi`, `kontak`, `noHp`, `alamat`, `tempatLahir`, `tanggalLahir`, `jabatanFungsional`; juga `GET /users/profile/me` | `authStore.user` otomatis berisi field ini setelah `fetchMe()`; cukup hapus penanda `ApiPending`. |
| W-09 | Statistik Dosen: Jabatan fungsional | Field `jabatanFungsional` di `/auth/me`; ubah lewat `PATCH /users/profile/me` | Form Pengaturan bisa menambah input jabatan fungsional. |
| W-11 | Kartu Dokumen Diproses (akurasi) | Key `review` di `GET /dosen/proposals/stats` | Hitungan selisih di frontend bisa diganti `diajukan + review`. |
| W-17 | Kegiatan: ringkasan per status | `GET /dosen/proposals/stats?jenis=…` (+ key `review`) | Mengganti 6 permintaan menjadi 1. |
| W-16 | Kegiatan: bagian sebagai anggota tim | `GET /dosen/proposals/as-member?jenis=…&status=…&search=…&page=…` | Detail untuk anggota pakai `GET /proposals/:id`, bukan `/dosen/proposals/:id`. |
| W-14 | Kegiatan: kolom Skema (penelitian) | Field `skema` di respons & body create/update proposal | Hanya untuk penelitian; form proposal perlu input baru. |
| W-15 | Kegiatan: kolom Mitra (pengabdian) | Field `mitra` di respons & body create/update proposal | Hanya untuk pengabdian; form proposal perlu input baru. |
| W-03 | Dashboard dosen: Tahapan pada Usulan Terakhir | Field `tahapan` `{kode, label, urutan}` di semua respons proposal (dihitung dari status proposal + laporan baru) | Ganti perkiraan dari laporan kemajuan/akhir; tidak perlu panggilan tambahan. |
| W-13 | Kegiatan: kolom Tahapan | Field `tahapan` di `GET /dosen/proposals` (dan `as-member`) | Sudah ada per baris, tanpa permintaan tambahan. |
| W-04 | Profil: Nilai SINTA | Field `sintaId`, `sintaScore` di `/auth/me` & profil; diisi dosen lewat `PATCH /users/profile/me` | Form Pengaturan perlu input SINTA ID & skor. |
| W-07 | Statistik Dosen & Pengaturan: Foto profil | `POST /users/profile/foto` (multipart `file`, JPG/PNG/WebP maks 2 MB), `DELETE /users/profile/foto`, field `fotoUrl` | `<img src={API_BASE_URL + user.fotoUrl}>`; panggil `fetchMe()` setelah upload/hapus. |
| W-10 | Header aplikasi: foto di kanan atas | Sama dengan W-07 (`fotoUrl` di `/auth/me`) | |
| W-20 | Pengaturan: Unduh data akun | `GET /users/profile/export` → file JSON (tanpa isi dokumen) | Unduh dengan `responseType: 'blob'`. |
| W-21 | Pengaturan: Hapus akun ini | `DELETE /users/profile/me` body `{ password }` | Akun dinonaktifkan + dianonimkan; setelah 200 frontend wajib logout. |
| W-19 | Pengaturan: Program Studi sebagai dropdown | `GET /program-studi` (publik) + CRUD admin | Kirim `nama` terpilih ke `programStudi`/`prodi`; bisa juga dipakai di form registrasi. |

## Dashboard Dosen (`frontend/src/pages/dashboard/DosenScreen.jsx`)

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Dokumen Diterima / Ditolak / Diproses | `GET /dosen/proposals/stats` (`disetujui`, `ditolak`, `diajukan` + review*) |
| Usulan Terakhir (judul, status, jenis, periode) | `GET /dosen/proposals?limit=6` (baris pertama) |
| Tahapan usulan (diturunkan) | status proposal + `GET /proposals/:id/laporan` (sementara; backend kini mengirim `tahapan`, lihat W-03 di "API sudah tersedia") |
| Profil: Pengabdian, Penelitian | `GET /dosen/proposals?jenis=…&status=disetujui&limit=1` → `meta.total` |
| Nama & email | `GET /auth/me` |

\* Frontend saat ini menghitung `review` sebagai
`total − (draft + diajukan + revisi + disetujui + ditolak)`. Backend kini sudah mengirim key
`review` (lihat W-11 di bagian "API sudah tersedia").

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-01 | Kartu **Luaran Dapat Diklaim** | Jumlah luaran (output kegiatan) yang bisa diklaim dosen | `GET /dosen/luaran/stats` → `{ dapatDiklaim: number }` | Belum ada tabel/model "Luaran" sama sekali; perlu desain skema + migrasi. Menu "Luaran" di desain juga belum ada. |
| W-02 | Profil: **Jurnal** dan Statistik Dosen: **Jurnal Diterbitkan** | Jumlah jurnal/publikasi dosen | `GET /dosen/publikasi/stats` → `{ jurnal: number }` | Belum ada tabel publikasi/jurnal. |
| W-05 | Profil: **Sertifikasi** | Jumlah sertifikasi dosen | `GET /dosen/sertifikasi/stats` → `{ total: number }` | Belum ada tabel sertifikasi. |
| W-06 | Profil: **Nilai Kepercayaan** | Skor kepercayaan, mis. `4.7/5.0` | `GET /dosen/kepercayaan` → `{ nilai: number, skala: 5 }` | Definisi/rumus skor belum ada. Perlu keputusan bisnis. |

## Menu Kegiatan → Status Penelitian / Pengabdian (`frontend/src/pages/KegiatanPage.jsx`)

Route `/kegiatan/penelitian` dan `/kegiatan/pengabdian` (dosen), dari grup menu **Kegiatan** di
sidebar.

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Kartu **Proposal Aktif** (draft+diajukan+review+revisi), **Proposal Diterima**, jumlah per chip status | `GET /dosen/proposals?jenis=…&status=…&limit=1` → `meta.total` (6 permintaan, satu per status) |
| Kartu **Laporan Diterima** | `GET /laporan/my?jenis=…&status=disetujui&limit=1` → `meta.total` |
| Riwayat tab **Proposal** (tanggal upload/update, judul, status, target `luaran`), cari, filter, paginasi | `GET /dosen/proposals?jenis=…&status=…&search=…&page=…&limit=10` |
| Riwayat tab **Laporan** (status, `luaranTercapai`) — juga dibuka tombol "Laporan Penelitian/Pengabdian" | `GET /laporan/my?jenis=…&status=…&search=…&page=…&limit=10` |
| Tombol Detail / Edit proposal | `GET /dosen/proposals/:id` (modal detail) / halaman Usulan |

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-12 | ~~Kartu Luaran tercatat & kolom Luaran~~ | — | — | **Selesai sebagian**: kolom Luaran kini memakai field `luaran` (target) dan `luaranTercapai` (laporan) dari API baru; kartu diganti "Laporan Diterima" sesuai desain. Rekap luaran yang dapat diklaim tetap menunggu W-01. |

## Usulan Penelitian / Pengabdian (`frontend/src/pages/UsulanPage.jsx`)

Route `/kegiatan/:jenis/usulan` (buat) dan `/kegiatan/:jenis/usulan/:id` (ubah, hanya draft/revisi).
Menggantikan modal Buat/Edit Proposal. Wizard: Identitas → Anggota → Dokumen → Preview.

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Judul, jenis, periode (+ Tahun Pelaksanaan dari `periode.tahun`), anggaran, abstrak, anggota + peran | `POST /dosen/proposals` / `PATCH /dosen/proposals/:id` (`anggotaIds`), `GET /periode?isAktif=true` |
| Luaran Tambahan | field `luaran` (string) di create/update — API baru |
| Upload Proposal (wajib di wizard) | `POST /proposals/:id/dokumen-utama` setelah proposal tersimpan |
| Cari anggota | `GET /users/search` |
| Ketua Pengusul | user yang login (`GET /auth/me`) |

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-22 | **Rumpun Ilmu** dan **Bidang Penelitian/Pengabdian** (langkah Identitas & Preview) | Rumpun ilmu & bidang per proposal + daftar pilihannya | Kolom `rumpunIlmu`, `bidang` di Penelitian/Pengabdian (ikut create/update/respons) + `GET /master/rumpun-ilmu`, `GET /master/bidang?jenis=…` | Input nonaktif. |
| W-23 | Kolom **Alamat** dan **Kontak** di tabel Anggota | Alamat & kontak user hasil pencarian | Tambahkan `alamat`, `kontak`/`noHp` ke respons `GET /users/search` (dan `anggota.user` di detail proposal) | Pertimbangkan privasi: mungkin cukup kontak saja. |
| W-24 | **Kata Kunci** (langkah Dokumen & Preview) | Kata kunci proposal | Kolom `kataKunci` (teks/JSON array) di Penelitian/Pengabdian, ikut create/update/respons | Input nonaktif. |
| W-25 | Daftar pilihan **Luaran Tambahan** | Master jenis luaran | `GET /master/luaran?jenis=…` | Sementara daftar statis di frontend; nilai dikirim sebagai teks ke field `luaran`. |

## Pengaturan (`frontend/src/pages/ProfilePage.jsx`, route `/profil`)

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Simpan Informasi Profil | `PATCH /users/profile/me` — hanya field yang diubah yang dikirim; respons (profil lengkap) dipakai mengisi ulang form & ringkasan |
| Ganti Password | `PATCH /users/profile/password` (validasi frontend: minimal 8 karakter, konfirmasi cocok) |
| Nama, email, peran, status | `GET /auth/me` |

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-18 | **Status verifikasi email** ("Akun email anda belum diverifikasi. Klik disini") | Status verifikasi + kirim ulang email verifikasi | Field `emailVerifiedAt` di `GET /auth/me` + `POST /auth/verify-email/resend` + `POST /auth/verify-email` | Belum ada kolom/alur verifikasi. Email juga belum bisa diubah oleh user (tidak termasuk field `PATCH /users/profile/me`). |

## Elemen desain yang belum dibuat (bukan soal API)

- Grup menu **Kegiatan → Penelitian, Pengabdian** sudah dibuat (khusus dosen).
- **Halaman laporan** (buat/isi/detail laporan, `POST/PATCH /laporan…`) belum dibuat di frontend
  walaupun API-nya sudah ada (`backend_go/new-api.md`). Tombol "Laporan Penelitian/Pengabdian"
  sementara membuka tab Laporan di Riwayat; notifikasi laporan belum punya tautan.
- Menu **Luaran** (`/luaran`, dosen) sudah ada tetapi menampilkan **501 Not Implemented**:
  fitur menunggu kelanjutan perkembangan dari Pihak Kampus (berkaitan dengan W-01).
- Menu **Panduan** dari desain belum ada halamannya.
- Halaman **Pengaturan** sudah ada di `/profil` (dibuka dari kartu nama di bawah sidebar).
