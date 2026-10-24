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

## Elemen desain yang belum dibuat (bukan soal API)

- Menu sidebar **Penelitian**, **Pengabdian**, **Luaran**, **Pengaturan**, **Panduan** dari
  desain belum ada halamannya. Sidebar tetap memakai menu yang sudah ada (Dashboard,
  Proposal Saya, Undangan Tim, Penugasan Review bila ada tugasan). "Luaran" bergantung pada W-01.
