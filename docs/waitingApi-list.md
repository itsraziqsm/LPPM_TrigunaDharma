# Daftar API yang Ditunggu (waiting API)

Bagian UI yang sudah dibuat tetapi **belum punya endpoint backend**. Di tampilan, bagian ini
berisi placeholder `—` dengan penanda kuning bergaris putus-putus **"API belum ada"**
(komponen `ApiPending`). Setelah endpoint tersedia, sambungkan datanya lalu hapus baris
terkait dari daftar ini.

Backend acuan: `backend_go/` (satu-satunya backend; endpoint lama tetap kompatibel dengan kontrak
Node, API baru didokumentasikan di `backend_go/new-api.md`, lihat `CLAUDE.md`).

## API sudah tersedia — tinggal disambungkan di frontend

Endpoint di bawah sudah ada di backend (`backend_go/new-api.md` bagian 15–16) tetapi **belum
disambungkan** di frontend. Setelah disambungkan, pindahkan barisnya ke "Sudah disambungkan".

| ID | Elemen UI | API yang tersedia | Catatan untuk frontend |
|---|---|---|---|
| W-27 | Isi Laporan: Kata Kunci (Informasi Laporan & Preview) | `kataKunci` (array) di `PATCH /laporan/:id` (dan `POST /laporan`) | Disalin dari proposal saat laporan dibuat; mengubahnya tidak mengubah proposal. |
| W-28 | Isi Laporan: Metode Penelitian (khusus penelitian) | `metodePenelitian` (string/null) di `PATCH /laporan/:id` & respons laporan | Untuk laporan pengabdian selalu `null`; nilai bukan null ditolak 400. |
| W-30 | Manajemen User: tombol Jadikan/Cabut reviewer untuk Ketua LPPM | `PATCH /users/:id/roles` kini juga untuk `ketua_lppm` (hanya tambah/cabut `reviewer` pada dosen) | Cukup aktifkan `canEdit` untuk ketua; pemanggilan `onRoleChange` yang ada sudah sesuai. |
| W-31 | Manajemen User: Penugasan Review (beri/cabut reviewer, cabut paksa oleh Ketua dengan pengalihan tugasan) | `GET/PATCH /users/:id/reviewer` (admin, ketua), `POST /users/:id/reviewer/force-revoke` (ketua) | Cabut biasa → 409 bila masih ada tugasan belum selesai; Ketua lalu memilih reviewer baru per tugasan (`tugasanBelumSelesai`). Hanya peran reviewer yang bisa ditugaskan & mereview (bagian 16.3). |

### Sudah disambungkan

Grup A (`new-api.md` bagian 10), Grup B (bagian 11), Grup C (bagian 12), bagian 13, dan bagian 14:

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
| W-01 / W-02 / W-12 | `GET /luaran/stats` → kartu Luaran Dapat Diklaim (+ "X tercapai dari Y target"), Jurnal, Jurnal Diterbitkan (dashboard). Item luaran: editor **Target Luaran** di langkah Dokumen wizard Usulan (`POST/PATCH/DELETE /luaran`, disinkronkan setelah proposal tersimpan), **Capaian luaran** di halaman laporan (`PATCH /luaran/:id/capaian`, `POST /luaran/:id/bukti`), baca saja di Laporan Masuk & review laporan (`pages/laporan/LuaranCapaian.jsx`) |
| W-06 | `GET /dosen/kepercayaan` → Nilai Kepercayaan (`4.4/5.0`, "Belum ada data" bila `null`) |
| W-18 | `emailVerifiedAt` → badge Terverifikasi / Belum diverifikasi + "Kirim ulang email verifikasi" di Pengaturan; halaman publik `/verify-email?token=` (`VerifyEmailPage.jsx`) |
| W-22 | Rumpun Ilmu & Bidang → dropdown di Identitas (`GET /master/rumpun-ilmu`, `GET /master/bidang?jenis=`), field `rumpunIlmu`/`bidang`, Preview & modal detail |
| W-23 | Kolom Kontak tabel Anggota (`noHp`, bila kosong `kontak`); kolom Alamat dihapus (privasi) |
| W-24 | Kata Kunci (dipisah koma → array `kataKunci`, maks 10 × 50) di Dokumen, Preview & modal detail |
| W-25 | `GET /master/luaran?jenis=` → pilihan "Tambah dari daftar luaran" di editor Target Luaran (item `/luaran` dengan `jenis` = `jenisLuaran`) |
| W-26 | Langkah Mitra (pengabdian): Jenis Mitra (dropdown `GET /master/jenis-mitra?jenis=pengabdian`), Alamat, Kontak, Pernyataan Kebutuhan → `mitraJenis/Alamat/Kontak/Kebutuhan` (kosong dikirim `null`); tampil di Preview & modal detail |

## Dashboard Dosen (`frontend/src/pages/dashboard/DosenScreen.jsx`)

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Dokumen Diterima / Ditolak / Diproses | `GET /dosen/proposals/stats` (`disetujui`, `ditolak`, `diajukan` + `review`) |
| Usulan Terakhir (judul, status, jenis, periode) | `GET /dosen/proposals?limit=6` (baris pertama) |
| Tahapan usulan | field `tahapan` {label, urutan} di proposal |
| Profil: Pengabdian, Penelitian | `GET /dosen/proposals?jenis=…&status=disetujui&limit=1` → `meta.total` |
| Luaran Dapat Diklaim, Jurnal, Jurnal Diterbitkan | `GET /luaran/stats` |
| Nilai Kepercayaan | `GET /dosen/kepercayaan` |
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

Data yang **menunggu API**: tidak ada lagi.

## Usulan Penelitian / Pengabdian (`frontend/src/pages/UsulanPage.jsx`)

Route `/kegiatan/:jenis/usulan` (buat) dan `/kegiatan/:jenis/usulan/:id` (ubah, hanya draft/revisi).
Menggantikan modal Buat/Edit Proposal. Penelitian: Identitas → Anggota → Dokumen → Preview.
Pengabdian (desain terpisah): Identitas → Anggota (dosen & mahasiswa dipisah) → **Mitra** → Dokumen → Preview.

Data yang **sudah** tersambung ke API yang ada:

| Elemen | Sumber |
|---|---|
| Judul, jenis, periode (+ Tahun Pelaksanaan dari `periode.tahun`), anggaran, abstrak, anggota + peran | `POST /dosen/proposals` / `PATCH /dosen/proposals/:id` (`anggotaIds`), `GET /periode?isAktif=true` |
| Target Luaran (banyak item: jenis, target, tanggal target) | `GET /luaran/proposal/:id`, `POST/PATCH/DELETE /luaran`; field teks `luaran` diisi ringkasan item |
| Skema Penelitian (Identitas, penelitian) · Nama Mitra (wajib) + Jenis, Alamat, Kontak, Pernyataan Kebutuhan Mitra (langkah Mitra, pengabdian) | field `skema` / `mitra`, `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan` |
| Upload Proposal (wajib di wizard) | `POST /proposals/:id/dokumen-utama` setelah proposal tersimpan |
| Cari anggota (+ kontak) | `GET /users/search` |
| Rumpun Ilmu, Bidang, Kata Kunci | field `rumpunIlmu`, `bidang`, `kataKunci`; pilihan dari `GET /master/(rumpun-ilmu\|bidang)` |
| Ketua Pengusul | user yang login (`GET /auth/me`) |

Data yang **menunggu API**: tidak ada lagi.

## Laporan kegiatan (API `/laporan`, `backend_go/new-api.md` bagian 3–5)

Data yang **sudah** tersambung:

| Halaman | Route | API |
|---|---|---|
| Buat laporan (pilih proposal disetujui) | `/kegiatan/:jenis/laporan/baru` (`LaporanPage.jsx`) | `GET /laporan/eligible`, `POST /laporan` |
| Index laporan: ringkasan, ajukan, hapus, status & hasil review (pengusul; anggota baca saja) | `/kegiatan/:jenis/laporan/:id` (`LaporanPage.jsx`) | `GET/DELETE /laporan/:id`, `POST /laporan/:id/submit`, `GET /laporan/:id/dokumen` |
| Isi laporan (wizard desain UI Laporan: Informasi Umum → Informasi Laporan → Dokumen → Preview, + Simpan draf) | `/kegiatan/:jenis/laporan/:id/isi` (`LaporanIsiPage.jsx`) | `GET/PATCH /laporan/:id` (judul, abstrak, ringkasanHasil, luaranTercapai, realisasiAnggaran, dokumenUrl), `POST /laporan/:id/dokumen`, capaian luaran |
| Link Jurnal & Link Video / Dokumentasi (Dokumen & Preview) — W-29 | `/kegiatan/:jenis/laporan/:id/isi` | Tanpa field khusus di laporan: disimpan sebagai `buktiUrl` item luaran proposal berjenis `jurnal`/`prosiding` (Link Jurnal) dan `media_massa` (Link Video) lewat `PATCH /luaran/:id/capaian` (`null` = hapus). Satu tautan per target; menambah target hanya saat proposal draft/revisi. |
| Laporan Masuk (Ketua LPPM/Admin): tugaskan reviewer, keputusan | `/laporan-masuk[?id=]` (`LaporanMasukPage.jsx`) | `GET /laporan`, `POST/DELETE /laporan/:id/reviewers`, `PATCH /laporan/:id/status` |
| Tab Laporan di Penugasan Review (reviewer) | `/penugasan?tab=laporan` | `GET /laporan/tugasan`, `POST /laporan/:id/reviews[/finalize]` |
| Tautan notifikasi `refType: laporan` | `/notifikasi` | — |
| Capaian luaran (pengusul isi saat laporan draft/revisi; lainnya baca saja) | halaman laporan, Laporan Masuk, review laporan | `GET /luaran/proposal/:proposalId`, `PATCH /luaran/:id/capaian`, `POST/GET /luaran/:id/bukti` |

Data yang **menunggu API**: tidak ada lagi (W-27, W-28 sudah tersedia, lihat bagian atas).

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

| Status verifikasi email + kirim ulang | `emailVerifiedAt` (`/auth/me`), `POST /auth/verify-email/resend`; link email → `/verify-email` (`POST /auth/verify-email`) |

Data yang **menunggu API**: tidak ada lagi.

## Manajemen User → Penugasan Review (`frontend/src/pages/UserManagementPage.jsx`)

Menu **Penugasan Review** untuk dosen hanya tampil bila dosen punya peran `reviewer`
(`canReview` di `frontend/src/utils/roles.js`). Admin/Ketua mengaturnya dari panel detail user
(bagian "Penugasan Review", hanya untuk user berperan dosen).

Data yang **sudah** tersambung:

| Elemen | Sumber |
|---|---|
| Jadikan / cabut peran reviewer (Admin) | `PATCH /users/:id/roles` (peran lain dipertahankan, `reviewer` ditambah/dihapus) |

Data yang **menunggu API**: tidak ada lagi (W-30 sudah tersedia, lihat bagian atas).

## Elemen desain yang belum dibuat (bukan soal API)

- Grup menu **Kegiatan → Penelitian, Pengabdian** sudah dibuat (khusus dosen).
- Menu **Luaran** (`/luaran`, dosen) sudah ada tetapi menampilkan **501 Not Implemented**:
  fitur menunggu kelanjutan perkembangan dari Pihak Kampus (berkaitan dengan W-01).
- Menu **Panduan** dari desain belum ada halamannya.
- Halaman **Pengaturan** sudah ada di `/profil` (dibuka dari kartu nama di bawah sidebar).
