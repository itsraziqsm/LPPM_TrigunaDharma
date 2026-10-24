# Daftar API yang Ditunggu (waiting API)

Bagian UI yang sudah dibuat tetapi **belum punya endpoint backend**. Di tampilan, bagian ini
berisi placeholder `—` dengan penanda kuning bergaris putus-putus **"API belum ada"**
(komponen `ApiPending`). Setelah endpoint tersedia, sambungkan datanya lalu hapus baris
terkait dari daftar ini.

Backend acuan: `backend_go/` (satu-satunya backend; endpoint lama tetap kompatibel dengan kontrak
Node, API baru didokumentasikan di `backend_go/new-api.md`, lihat `CLAUDE.md`).

## API sudah tersedia — tinggal disambungkan di frontend

Endpoint di bawah sudah ada di backend (detail & contoh respons: `backend_go/new-api.md`
bagian 10). Setelah UI-nya disambungkan dan penanda `ApiPending` dihapus, hapus barisnya dari
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
| W-19 | Pengaturan: Program Studi sebagai dropdown | `GET /program-studi` (publik) + CRUD admin | Kirim `nama` terpilih ke `programStudi`/`prodi`; bisa juga dipakai di form registrasi. |

## Dashboard Dosen (`frontend/src/pages/dashboard/DosenScreen.jsx`)

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Dokumen Diterima / Ditolak / Diproses | `GET /dosen/proposals/stats` (`disetujui`, `ditolak`, `diajukan` + review*) |
| Usulan Terakhir (judul, status, jenis, periode) | `GET /dosen/proposals?limit=6` (baris pertama) |
| Tahapan usulan (diturunkan) | status proposal + `GET /proposals/:id/laporan` (lihat W-03) |
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
| W-03 | **Tahapan** pada Usulan Terakhir | Tahap resmi: Seleksi/Usulan → Pelaksanaan Kegiatan → Seleksi/Lanjutan → Pasca Pelaksanaan | Field `tahapan` di `Proposal` (enum) atau `GET /dosen/proposals/:id/tahapan` | Sementara diturunkan: belum `disetujui` → Seleksi/Usulan; `disetujui` → Pelaksanaan; ada laporan `kemajuan` → Seleksi/Lanjutan; ada laporan `akhir` → Pasca. Ini perkiraan, bukan data resmi. |
| W-04 | Profil: **Nilai Sinta** | Skor SINTA dosen | Kolom `sintaScore` di `User` (+ ikut di `/auth/me`) atau `GET /dosen/sinta` | Bisa diisi manual oleh admin atau sinkron dari SINTA (sumber perlu diputuskan). |
| W-05 | Profil: **Sertifikasi** | Jumlah sertifikasi dosen | `GET /dosen/sertifikasi/stats` → `{ total: number }` | Belum ada tabel sertifikasi. |
| W-06 | Profil: **Nilai Kepercayaan** | Skor kepercayaan, mis. `4.7/5.0` | `GET /dosen/kepercayaan` → `{ nilai: number, skala: 5 }` | Definisi/rumus skor belum ada. Perlu keputusan bisnis. |
| W-07 | Statistik Dosen: **Foto profil** | URL/berkas foto dosen | `POST/GET /users/profile/photo` + field `fotoUrl` di profil (`/auth/me`) | Sementara tampil inisial nama. |
| W-10 | Header aplikasi: nama + foto di kanan atas | Foto profil | Sama dengan W-07 | Di luar lingkup dashboard; sidebar saat ini sudah menampilkan nama & peran. |

## Menu Kegiatan → Penelitian / Pengabdian (`frontend/src/pages/KegiatanPage.jsx`)

Route `/kegiatan/penelitian` dan `/kegiatan/pengabdian` (dosen), dari grup menu **Kegiatan** di
sidebar.

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Ringkasan Total / Disetujui / Diproses / Ditolak, jumlah per chip status | `GET /dosen/proposals?jenis=…&status=…&limit=1` → `meta.total` (6 permintaan, satu per status) |
| Daftar (judul, periode, anggaran, status), cari, filter status, paginasi | `GET /dosen/proposals?jenis=…&status=…&search=…&page=…&limit=10` |
| Tombol Detail | `GET /dosen/proposals/:id` (modal detail yang sama dengan Proposal Saya) |

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-12 | Kartu **Luaran tercatat** dan kolom **Luaran** per kegiatan | Jumlah/daftar luaran per proposal | Bagian dari W-01, mis. `GET /proposals/:id/luaran` + total di stats | Belum ada tabel luaran. |
| W-13 | Kolom **Tahapan** per kegiatan | Tahap resmi tiap proposal | Field `tahapan` di respons `GET /dosen/proposals` (lihat W-03) | Di daftar sengaja tidak diturunkan dari laporan agar tidak 1 permintaan per baris. |

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
| W-07 | **Foto Profil** (pilih file + Perbarui Foto) | Unggah & ambil foto profil | Sama dengan W-07 di atas (`POST /users/profile/photo`, field `fotoUrl`) | Pemilih file sudah ada, tombol Perbarui Foto nonaktif. Upload saat ini hanya menerima PDF/DOCX, jadi perlu aturan gambar tersendiri. |
| W-18 | **Status verifikasi email** ("Akun email anda belum diverifikasi. Klik disini") | Status verifikasi + kirim ulang email verifikasi | Field `emailVerifiedAt` di `GET /auth/me` + `POST /auth/verify-email/resend` + `POST /auth/verify-email` | Belum ada kolom/alur verifikasi. Email juga belum bisa diubah oleh user (tidak termasuk field `PATCH /users/profile/me`). |
| W-20 | Zona Berbahaya: **Unduh data akun** | Arsip data & dokumen milik user | `GET /users/profile/export` (ZIP/JSON) | Tombol nonaktif. |
| W-21 | Zona Berbahaya: **Hapus akun ini** | Hapus akun sendiri | `DELETE /users/profile/me` dengan konfirmasi password | `DELETE /users/:id` hanya untuk admin. Perlu aturan bisnis: proposal/review milik user memakai FK `RESTRICT`, jadi kemungkinan cukup nonaktifkan/anonimkan akun, bukan hapus fisik. Tombol nonaktif. |

## Elemen desain yang belum dibuat (bukan soal API)

- Grup menu **Kegiatan → Penelitian, Pengabdian** sudah dibuat (khusus dosen).
- Menu **Luaran** dan **Panduan** dari desain belum ada halamannya. "Luaran" bergantung pada W-01.
- Halaman **Pengaturan** sudah ada di `/profil` (dibuka dari kartu nama di bawah sidebar).
