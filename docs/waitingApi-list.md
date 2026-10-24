# Daftar API yang Ditunggu (waiting API)

Bagian UI yang sudah dibuat tetapi **belum punya endpoint backend**. Di tampilan, bagian ini
berisi placeholder `—` dengan penanda kuning bergaris putus-putus **"API belum ada"**
(komponen `ApiPending`). Setelah endpoint tersedia, sambungkan datanya lalu hapus baris
terkait dari daftar ini.

Backend acuan: `backend_go/` (harus tetap kompatibel dengan kontrak Node, lihat `CLAUDE.md`).

## Dashboard Dosen (`frontend/src/pages/dashboard/DosenScreen.jsx`)

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Dokumen Diterima / Ditolak / Diproses | `GET /dosen/proposals/stats` (`disetujui`, `ditolak`, `diajukan` + review*) |
| Usulan Terakhir (judul, status, jenis, periode) | `GET /dosen/proposals?limit=6` (baris pertama) |
| Tahapan usulan (diturunkan) | status proposal + `GET /proposals/:id/laporan` (lihat W-03) |
| Profil: Pengabdian, Penelitian | `GET /dosen/proposals?jenis=…&status=disetujui&limit=1` → `meta.total` |
| Nama & email | `GET /auth/me` |

\* `/dosen/proposals/stats` tidak mengirim jumlah `review`; frontend menghitungnya sebagai
`total − (draft + diajukan + revisi + disetujui + ditolak)`. Lebih baik backend menambahkan
key `review` (lihat W-11).

Data yang **menunggu API**:

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-01 | Kartu **Luaran Dapat Diklaim** | Jumlah luaran (output kegiatan) yang bisa diklaim dosen | `GET /dosen/luaran/stats` → `{ dapatDiklaim: number }` | Belum ada tabel/model "Luaran" sama sekali; perlu desain skema + migrasi. Menu "Luaran" di desain juga belum ada. |
| W-02 | Profil: **Jurnal** dan Statistik Dosen: **Jurnal Diterbitkan** | Jumlah jurnal/publikasi dosen | `GET /dosen/publikasi/stats` → `{ jurnal: number }` | Belum ada tabel publikasi/jurnal. |
| W-03 | **Tahapan** pada Usulan Terakhir | Tahap resmi: Seleksi/Usulan → Pelaksanaan Kegiatan → Seleksi/Lanjutan → Pasca Pelaksanaan | Field `tahapan` di `Proposal` (enum) atau `GET /dosen/proposals/:id/tahapan` | Sementara diturunkan: belum `disetujui` → Seleksi/Usulan; `disetujui` → Pelaksanaan; ada laporan `kemajuan` → Seleksi/Lanjutan; ada laporan `akhir` → Pasca. Ini perkiraan, bukan data resmi. |
| W-04 | Profil: **Nilai Sinta** | Skor SINTA dosen | Kolom `sintaScore` di `User` (+ ikut di W-08) atau `GET /dosen/sinta` | Bisa diisi manual oleh admin atau sinkron dari SINTA (sumber perlu diputuskan). |
| W-05 | Profil: **Sertifikasi** | Jumlah sertifikasi dosen | `GET /dosen/sertifikasi/stats` → `{ total: number }` | Belum ada tabel sertifikasi. |
| W-06 | Profil: **Nilai Kepercayaan** | Skor kepercayaan, mis. `4.7/5.0` | `GET /dosen/kepercayaan` → `{ nilai: number, skala: 5 }` | Definisi/rumus skor belum ada. Perlu keputusan bisnis. |
| W-07 | Statistik Dosen: **Foto profil** | URL/berkas foto dosen | `POST/GET /users/profile/photo` + field `fotoUrl` di W-08 | Sementara tampil inisial nama. |
| W-08 | Statistik Dosen: **No. HP** dan Data Dosen: **NIDN/NIDK, Institusi, Tempat Tanggal Lahir, Program Studi** | Field profil milik user yang sedang login | Tambahkan field profil ke respons `GET /auth/me` (`nidn`, `institusi`, `programStudi`, `prodi`, `tempatLahir`, `tanggalLahir`, `kontak`, `noHp`, `alamat`, `nim`) **atau** buat `GET /users/profile/me` | Kolomnya **sudah ada di DB** dan bisa diubah lewat `PATCH /users/profile/me`, tetapi tidak ada endpoint yang membacanya untuk diri sendiri (`GET /users/:id` hanya admin/ketua). Frontend sudah siap: begitu key ada di objek user, nilai otomatis tampil. Ini juga membuat form `ProfilePage` terisi. |
| W-09 | Statistik Dosen: **Jabatan fungsional** (mis. "Asisten Ahli") | Jabatan fungsional dosen | Kolom `jabatanFungsional` di `User`, ikut dikirim di W-08 | Belum ada kolom. |
| W-10 | Header aplikasi: nama + foto di kanan atas | Foto profil | Sama dengan W-07 | Di luar lingkup dashboard; sidebar saat ini sudah menampilkan nama & peran. |
| W-11 | Kartu **Dokumen Diproses** (akurasi) | Jumlah proposal berstatus `review` | Tambahkan key `review` ke `GET /dosen/proposals/stats` | Bukan blocker (frontend sudah menghitung selisih), tapi lebih tepat dari backend. |

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
| W-14 | Kolom **Skema** (penelitian) | Skema/hibah penelitian (mis. PDP, Penelitian Dasar) | Kolom `skema` di `Proposal` + ikut di list & form | Belum ada kolom; form proposal juga belum memintanya. |
| W-15 | Kolom **Mitra** (pengabdian) | Mitra sasaran pengabdian | Kolom/tabel `mitra` untuk proposal pengabdian | Belum ada kolom; form proposal juga belum memintanya. |
| W-16 | Bagian **{Penelitian/Pengabdian} sebagai anggota tim** | Proposal milik dosen lain di mana user adalah anggota `diterima` | `GET /dosen/proposals?peran=anggota` atau `GET /dosen/proposals/as-member?jenis=…` | `/dosen/proposals` dan `/proposals/my` hanya memfilter `pengusulId` (ketua). Undangan tetap di menu Undangan Tim. |
| W-17 | Ringkasan per status (efisiensi) | Jumlah per status untuk satu jenis | `GET /dosen/proposals/stats?jenis=…` (+ key `review`, lihat W-11) | Bukan blocker; mengganti 6 permintaan menjadi 1. |

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
| W-08 | Nilai awal form **Informasi Profil** & Ringkasan (NIDN/NIM, tempat/tanggal lahir, kontak, no. HP, institusi, program studi, alamat) | Field profil user yang login | Sama dengan W-08 di atas | Tanpa ini form tampil kosong saat dibuka. Karena hanya field yang diubah yang dikirim, data lama di server **tidak** tertimpa kosong. |
| W-07 | **Foto Profil** (pilih file + Perbarui Foto) | Unggah & ambil foto profil | Sama dengan W-07 di atas (`POST /users/profile/photo`, field `fotoUrl`) | Pemilih file sudah ada, tombol Perbarui Foto nonaktif. Upload saat ini hanya menerima PDF/DOCX, jadi perlu aturan gambar tersendiri. |
| W-18 | **Status verifikasi email** ("Akun email anda belum diverifikasi. Klik disini") | Status verifikasi + kirim ulang email verifikasi | Field `emailVerifiedAt` di `GET /auth/me` + `POST /auth/verify-email/resend` + `POST /auth/verify-email` | Belum ada kolom/alur verifikasi. Email juga belum bisa diubah oleh user (tidak termasuk field `PATCH /users/profile/me`). |
| W-19 | **Program Studi** sebagai pilihan (dropdown) | Daftar program studi | `GET /program-studi` (master data) | Sementara input teks bebas. |
| W-20 | Zona Berbahaya: **Unduh data akun** | Arsip data & dokumen milik user | `GET /users/profile/export` (ZIP/JSON) | Tombol nonaktif. |
| W-21 | Zona Berbahaya: **Hapus akun ini** | Hapus akun sendiri | `DELETE /users/profile/me` dengan konfirmasi password | `DELETE /users/:id` hanya untuk admin. Perlu aturan bisnis: proposal/review milik user memakai FK `RESTRICT`, jadi kemungkinan cukup nonaktifkan/anonimkan akun, bukan hapus fisik. Tombol nonaktif. |

## Elemen desain yang belum dibuat (bukan soal API)

- Grup menu **Kegiatan → Penelitian, Pengabdian** sudah dibuat (khusus dosen).
- Menu **Luaran** dan **Panduan** dari desain belum ada halamannya. "Luaran" bergantung pada W-01.
- Halaman **Pengaturan** sudah ada di `/profil` (dibuka dari kartu nama di bawah sidebar).
