# Daftar API yang Ditunggu (waiting API)

Bagian UI yang sudah dibuat tetapi **belum punya endpoint backend**. Di tampilan, bagian ini
berisi placeholder `—` dengan penanda kuning bergaris putus-putus **"API belum ada"**
(komponen `ApiPending`). Setelah endpoint tersedia, sambungkan datanya lalu hapus baris
terkait dari daftar ini.

Backend acuan: `backend_go/` (satu-satunya backend; endpoint lama tetap kompatibel dengan kontrak
Node, API baru didokumentasikan di `backend_go/new-api.md`, lihat `CLAUDE.md`).

## API sudah tersedia — tinggal disambungkan di frontend

Endpoint di bawah sudah ada di backend (`backend_go/new-api.md`, bagian disebut per baris) tetapi **belum
disambungkan** di frontend. Setelah disambungkan, pindahkan barisnya ke "Sudah disambungkan".

| ID | Elemen UI | API yang tersedia | Catatan untuk frontend |
|---|---|---|---|
| W-43 | Daftar Backup: opsi filter **Dihapus** | `GET /backup?status=dihapus` (`dihapusAt` terisi); `status=berhasil` kini hanya yang filenya masih ada (`new-api.md` bagian 28) | Aktifkan opsi "Dihapus", hapus `ApiPending`. |
| W-44 | Luaran (Ketua LPPM, `/luaran-dosen`) + Cetak Dokumen › Luaran Dosen | `GET /luaran`, `/luaran/unduh-csv`, `/luaran/unduh-zip` kini `admin` + `ketua_lppm` (bagian 28) | Hapus penanda 403/`ApiPending`. |
| W-45 | Monitor Pengguna (Ketua STMIK, `/users` baca saja) | `GET /users`, `GET /users/:id` kini juga `ketua_stmik`; tulis tetap 403 (bagian 28) | Hapus `ApiPending`. |
| W-46 | Pengaturan › Zona Berbahaya (Ketua LPPM & Ketua STMIK) | `DELETE /users/profile/me` → 403 "Akun Ketua LPPM/Ketua STMIK tidak dapat dihapus sendiri. Hubungi Admin." (bagian 28) | Tampilan sudah menyembunyikan formulir; cukup tampilkan pesan 403 bila muncul. |
| W-49 | Cetak Laporan mahasiswa: jumlah laporan harian per project | Field `jumlahLaporanHarian` di tiap item `GET /mahasiswa/laporan-harian/proposals` (milik user login) (bagian 28) | Saring `> 0`, muat laporan hanya saat Cetak. |
| W-51 | Usulan › langkah Anggota (NIDN/NIM, jenis anggota) | `anggota[].user` kini memuat `nidn`, `nim`, `roles` di semua respons proposal & detail laporan (bagian 28) | Hentikan `members/search` per anggota saat membuka draf. |
| W-55 | Laporan Kegiatan › Tugaskan reviewer | `POST /laporan/:id/submit` otomatis menugaskan reviewer proposal asal (masih berperan reviewer) → status `review`; bila tidak ada tetap `diajukan` (bagian 28) | Dialog Tugaskan hanya perlu untuk laporan `diajukan`; centang otomatis boleh tetap. |
| W-47 | Pintasan dashboard & "Terakhir dibuka" (pencarian global) | `GET /users/profile/riwayat`, `POST .../riwayat/halaman` `{path}`, `POST .../riwayat/cari` `{to,title,subtitle?,badge?}`, `DELETE .../riwayat/cari`; maks 50 halaman / 4 cari per user (`new-api.md` bagian 29.1) | Respons tulis = riwayat terbaru; localStorage boleh tetap sebagai cache. |
| W-50 | Tombol Alat › Hubungi Admin (+ pengaturan admin) | `GET /kontak-admin` (semua peran login) → `{whatsapp, nama, jamLayanan, updatedAt, updatedBy}`; `PATCH /kontak-admin` (admin, nomor dinormalisasi ke 62…) (bagian 29.2) | `whatsapp: null` → cadangan `VITE_ADMIN_WA`. Halaman pengaturan admin belum ada di frontend. |
| W-52 | Manajemen Pengguna › Reset password (Admin) + paksa ganti password | `POST /users/:id/reset-password` `{password: <password admin>}` → `{passwordSementara, wajibGantiPassword, user}`; `wajibGantiPassword` di login & `/auth/me`; `PATCH /users/profile/password` mengosongkan (bagian 29.3) | Password sementara hanya sekali tampil; tanpa kedaluwarsa otomatis. |
| W-53 | Log Aktivitas: Kategori, Cari, rentang tanggal, kartu ringkasan | Field `kategori` di log; `GET /activity-logs?kategori=&search=&dari=&sampai=` (juga `/my`); `GET /activity-logs/ringkasan` → `{total, perKategori, loginHariIni, loginGagalHariIni, penggunaAktifHariIni}`; `LOGIN_GAGAL`/`LOGOUT`/`LOGOUT_ALL` dicatat (bagian 29.4) | Ganti pemetaan `utils/kategoriLog.js` dengan field `kategori`. |

### Sudah disambungkan

Grup A (`new-api.md` bagian 10), Grup B (bagian 11), Grup C (bagian 12), dan bagian 13–16:

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
| W-27 / W-28 | Isi Laporan → Informasi Laporan: **Kata Kunci** (koma → array `kataKunci`, wajib ≥1, terpisah dari proposal) & **Metode Penelitian** (`metodePenelitian`, khusus penelitian, wajib); ikut Simpan draf, Preview, index laporan, Laporan Masuk, review laporan |
| W-30 / W-31 | Manajemen User → **Penugasan Review** (`ReviewerAccess`): status (`GET /users/:id/reviewer`: tugasan belum selesai, review selesai), Jadikan/Cabut reviewer untuk Admin & Ketua (`PATCH /users/:id/reviewer`), **Cabut paksa** khusus Ketua (`POST /users/:id/reviewer/force-revoke`, pilih reviewer baru per tugasan; Admin hanya diberi tahu). Menu Penugasan Review = peran `reviewer` saja (`canReview`) |
| W-33 | Periode (`PeriodePage.jsx`): Admin hanya melihat (Tambah/Ubah disembunyikan; Hapus = "Ajukan ke Ketua LPPM" `POST /periode/:id/deletion-request`, lalu pantau/batalkan); Ketua tambah/ubah, **hapus langsung** `DELETE /periode/:id { password }` (`periodeApi.remove`) dan menyetujui/menolak permintaan admin |
| W-32 | Prioritas reviewer: dialog Tugaskan Reviewer (Proposal Kegiatan, Laporan Kegiatan, panel Periode) memakai `GET /users/kandidat-reviewer?itemId=` (urut beban, lencana `BebanReviewer`); Cabut paksa: opsi per tugasan dari kandidat (`exclude` = dosen dicabut), nilai awal `rekomendasi`, tombol **Alihkan otomatis** (`otomatis: true`) |
| W-34 | Admin **Ajukan hapus (izin Ketua)** di Dokumen Masuk (`HapusDokumen`: alasan + password, status menunggu + Batalkan); Ketua: kartu **Permintaan hapus dokumen** (`PermintaanHapusDokumen`) di Proposal Kegiatan (semua) & Laporan Kegiatan (laporan) → Setujui & Hapus (password) / Tolak (catatan); notifikasi `refType: DokumenDeletionRequest` → Dokumen Masuk |
| W-35 / W-41 | Detail Undangan (`/undangan/:id`) dari `GET /dosen/proposals/invitations/:id`: abstrak, info, mitra, target luaran, tim untuk semua status; dosen diundang (`aksesPenuh`) → unduh file proposal + tautan Detail Kegiatan. Detail Kegiatan non-pengusul: baca saja termasuk lampiran & laporan kemajuan/akhir (`readOnly`), banner "Tanggapi undangan" untuk undangan pending |
| W-36 | Tautan "Unduh template proposal" di Usulan (`TemplateProposalLink`: `GET /template-proposal/aktif?jenis=`, cadangan file statis); halaman admin **Template Proposal** (`/template-proposal`: unggah, unduh, aktifkan, hapus versi) |
| W-37 | Peran **Ketua STMIK**: label peran, opsi peran di Manajemen User, menu (Pemantauan Proposal, Rekap Proposal), dashboard (adapter `stmik`, `GET /monitoring/ringkasan` & `/proposals`), halaman **Pemantauan Proposal** (`/pemantauan`: ringkasan, per status, tab Proposal & Dosen pengusul) |
| W-38 | Jenis luaran dari `GET /luaran/jenis` (+ `poster`, label "(prioritas)") di editor Target Luaran, badge **Prioritas** di capaian luaran; halaman admin **Luaran Dosen** (`/luaran-dosen`: filter, paginasi, unduh bukti, Unduh CSV (`;`) & ZIP) |
| W-39 | Dropdown **Rumpun Ilmu** di Isi Laporan → Informasi Laporan (`PATCH /laporan/:id` `rumpunIlmu`, nilai tidak aktif tetap tampil) |
| W-40 | `ATURAN_TIM` baru: penelitian dosen 0–5 + mahasiswa ≥ 1, pengabdian dosen 1–5 + mahasiswa ≥ 1 (panel `KomposisiTim`) |

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
| Isi laporan (wizard desain UI Laporan: Informasi Umum → Informasi Laporan → Dokumen → Preview, + Simpan draf) | `/kegiatan/:jenis/laporan/:id/isi` (`LaporanIsiPage.jsx`) | `GET/PATCH /laporan/:id` (judul, kataKunci, metodePenelitian, abstrak, ringkasanHasil, luaranTercapai, realisasiAnggaran, dokumenUrl), `POST /laporan/:id/dokumen`, capaian luaran |
| Link Jurnal & Link Video / Dokumentasi (Dokumen & Preview) — W-29 | `/kegiatan/:jenis/laporan/:id/isi` | Tanpa field khusus di laporan: disimpan sebagai `buktiUrl` item luaran proposal berjenis `jurnal`/`prosiding` (Link Jurnal) dan `media_massa` (Link Video) lewat `PATCH /luaran/:id/capaian` (`null` = hapus). Satu tautan per target; menambah target hanya saat proposal draft/revisi. |
| Laporan Masuk (Ketua LPPM/Admin): tugaskan reviewer, keputusan | `/laporan-masuk[?id=]` (`LaporanMasukPage.jsx`) | `GET /laporan`, `POST/DELETE /laporan/:id/reviewers`, `PATCH /laporan/:id/status` |
| Tab Laporan di Penugasan Review (reviewer) | `/penugasan?tab=laporan` | `GET /laporan/tugasan`, `POST /laporan/:id/reviews[/finalize]` |
| Tautan notifikasi `refType: laporan` | `/notifikasi` | — |
| Capaian luaran (pengusul isi saat laporan draft/revisi; lainnya baca saja) | halaman laporan, Laporan Masuk, review laporan | `GET /luaran/proposal/:proposalId`, `PATCH /luaran/:id/capaian`, `POST/GET /luaran/:id/bukti` |

Data yang **menunggu API**: tidak ada lagi.

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

Data yang **menunggu API**:

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Manajemen User → Penugasan Review (`frontend/src/pages/UserManagementPage.jsx`)

Menu **Penugasan Review** hanya tampil untuk user berperan `reviewer` (`canReview` di
`frontend/src/utils/roles.js`; backend juga menolak tugasan/review tanpa peran ini). Admin/Ketua
mengatur dosen ↔ reviewer dari panel detail user (bagian "Penugasan Review", hanya untuk dosen).

Data yang **sudah** tersambung:

| Elemen | Sumber |
|---|---|
| Status reviewer: tugasan belum selesai, jumlah review selesai | `GET /users/:id/reviewer` |
| Jadikan / cabut peran reviewer (Admin & Ketua) | `PATCH /users/:id/reviewer` `{ isReviewer }` (409 bila masih ada tugasan belum selesai) |
| Cabut paksa + pengalihan tiap tugasan ke reviewer lain (Ketua) | `POST /users/:id/reviewer/force-revoke` `{ pengalihan: [{ tugasanId, reviewerBaruId }] }`; pilihan reviewer dari `GET /users?role=reviewer` (tanpa dosen ini & pengusul item) |

Data yang **menunggu API**: tidak ada lagi.

## Cetak Dokumen (`frontend/src/pages/cetak/`, route `/cetak-dokumen`, Admin & Ketua)

Wadah dokumen cetak (dulu Export/Print Laporan). Tiap kartu: status konfigurasi, **Cetak**, **Konfigurasi**.

Data yang **sudah** tersambung:

| Dokumen | Sumber |
|---|---|
| Export Rekapitulasi Proposal (konfigurasi = halaman export lama `/cetak-dokumen/rekap-proposal`, PDF/Excel) | `GET /export/proposals` (filter periode/jenis/status/tahun), `GET /periode` |
| Surat Tugas (`/cetak-dokumen/surat-tugas`): pilih kegiatan, isian diwarisi lalu PDF dibuat di frontend (`utils/suratTugasPDF.js`, jspdf) | `GET /proposals?status=disetujui`, `GET /laporan`, `GET /proposals/:id` / `GET /laporan/:id` (judul, jenis, pengusul, anggota, mitra/alamat), `GET /periode/:id` (tanggal mulai/selesai) |

Data yang **menunggu API** (sementara "SOP Frontend": konfigurasi disimpan di `localStorage` lewat `utils/cetakConfig.js`):

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-42 | Simpan konfigurasi dokumen di server; **nomor surat otomatis** & **arsip surat tugas** yang sudah dicetak | Konfigurasi per dokumen (bersama untuk semua Admin/Ketua), penomoran berurutan, riwayat surat | `GET/PUT /cetak/konfigurasi/:dokumen` (`rekap-proposal`, `surat-tugas`); `POST /surat-tugas` `{ kegiatanId, tipe, tugas, petugas[], tanggalMulai, tanggalSelesai, alamat, penandatangan }` → `{ id, nomor, createdAt }`; `GET /surat-tugas?kegiatanId=` | Saat ini konfigurasi hanya di peramban yang dipakai dan nomor surat diisi manual. |

## Backup Data (`frontend/src/pages/BackupPage.jsx`, route `/backup`, Admin)

Data yang **sudah** tersambung: `GET /backup` (filter `sumber`, `status` berjalan/berhasil/gagal), `GET /backup/jadwal`,
`POST /backup`, `GET /backup/:id`, `GET /backup/:id/download`, `DELETE /backup/:id`. Status **Dihapus** di tabel ditampilkan
frontend dari `dihapusAt` (backup tetap `status: berhasil` di backend).

Data yang **menunggu API**:

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Hak akses menu per peran (perubahan menu Oktober 2026)

Menu baru per peran (fitur yang tidak ada di menu = dicabut di frontend): Admin = Akademik (Dokumen Masuk, Periode lihat
saja), Dokumentasi (Manajemen Template, Cetak Dokumen), Pengguna, Backup Data; Ketua LPPM = Dokumen Masuk, Periode,
Pengguna, Dokumentasi (Cetak Dokumen, **Luaran**); Ketua STMIK = Akademik (Daftar Dokumen › Proposal/Laporan, Arsip
Periode), Statistik, Cetak Laporan, **Monitor Pengguna**;
Dosen = Kegiatan, Arsip Kegiatan, Luaran, Undangan, Penugasan Review; Mahasiswa = Project Saya, Arsip Project, Undangan,
Cetak Laporan. Dua fitur memindahkan akses ke peran yang belum diizinkan backend:

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Registrasi — satu identitas satu pendaftaran (`frontend/src/pages/RegisterPage.jsx`, `/register`)

Keputusan: pendaftaran dikunci per **identitas** (email + NIDN/NIRM), **bukan** per perangkat (MAC address tidak bisa dibaca
peramban/server; IP dipakai bersama satu kampus). Satu orang hanya bisa punya satu pendaftaran aktif; daftar ulang hanya
boleh setelah pendaftaran sebelumnya **ditolak**. Saat ini kolom `email`, `nidn`, `nim` sudah UNIQUE di DB, tetapi duplikat
hanya menghasilkan 409 umum "Resource already exists" dan akun `rejected` tidak bisa mendaftar ulang sama sekali.

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-48 | Formulir Daftar (dosen & mahasiswa) + halaman baru **"Pendaftaran sudah terkirim"** | Validasi identitas lebih ketat & jawaban yang membedakan status pendaftaran sebelumnya | **1. Validasi** `POST /auth/register/dosen` & `/register/mahasiswa` (422 `{"errors":{"field":["pesan"]}}`): `email` wajib, format valid (sudah `zStr().Email()`; tambah: di-*trim* & huruf kecil sebelum disimpan/dicek agar unik tanpa beda huruf, tanpa spasi, domain ber-TLD); `nidn` **wajib** untuk dosen, hanya angka, **minimal 10 digit** (`^\d{10,}$`); `nim` **wajib** untuk mahasiswa, kini berarti **NIRM**, tepat **10 digit** (`^\d{10}$`). Nama field JSON & kolom DB tetap `nim` (kompatibel; label UI "NIRM"). **2. Cek identitas sebelum INSERT** (cari `User` dengan email ATAU nidn/nim yang sama): status `pending` → **409** `{ success:false, code:"PENDAFTARAN_MENUNGGU", message:"Pendaftaran dengan identitas ini sudah terkirim dan menunggu persetujuan admin.", data:{ email:"bu***@kampus.ac.id", createdAt } }`; status `approved` → **409** `code:"AKUN_SUDAH_AKTIF"` ("Akun sudah aktif, silakan masuk."); status `rejected` → **boleh daftar ulang**: perbarui baris lama (password baru, profil, peran, `status='pending'`, `createdAt/updatedAt`) lalu balas **201** seperti pendaftaran baru; email milik satu user tetapi NIDN/NIRM milik user lain → **409** `code:"IDENTITAS_BENTROK"`. **3. (Opsional)** `POST /auth/register/status` `{ email }` → `{ status: "pending"\|"approved"\|"rejected"\|"tidak_ada" }` dengan `authLimiter`, untuk tombol "Cek status pendaftaran" | Field `code` dipakai frontend untuk memilih tampilan (halaman "sudah terkirim" vs "silakan masuk") tanpa mencocokkan teks pesan. Akun hapus-sendiri (`deletedAt`, status `rejected`, email dianonimkan): kosongkan juga `nidn`/`nim` saat anonimisasi agar orangnya bisa mendaftar lagi. Aturan format yang sama sebaiknya juga berlaku di `PATCH /users/profile/me` (ubah NIDN/NIRM) dan saat admin mengubah data. Data lama yang belum memenuhi format **tidak** diubah otomatis. Endpoint status (3) membuka kemungkinan menebak email terdaftar; batasi lajunya atau ganti dengan pengiriman status lewat email. |

**Frontend sudah dibuat (November 2026)** — tinggal menunggu backend: label "NIM" → **"NIRM"** (10 digit), NIDN
min. 10 digit (hanya angka, `inputMode="numeric"`), email divalidasi sebelum kirim; halaman **"Pendaftaran sudah terkirim —
menunggu persetujuan admin"** setelah daftar berhasil atau saat API menjawab `PENDAFTARAN_MENUNGGU`; `AKUN_SUDAH_AKTIF` → arahkan
ke Login dengan pesan; penanda di `localStorage` hanya untuk kenyamanan (buka `/register` di peramban yang sama → langsung ke
halaman "sudah terkirim", dengan tautan "Daftar dengan data lain"). Status di halaman `/register/terkirim` masih "Menunggu" + penanda
"API belum ada" sampai endpoint cek status (3) tersedia; kalimat "bila ditolak, dapat mendaftar ulang" baru benar setelah poin 2 W-48 ada.

## Riwayat penggunaan per user (Dashboard › Pintasan, Pencarian global)

Sekarang memakai "SOP Frontend": riwayat disimpan di `localStorage` per user (`utils/riwayat.js`: `riwayatHalaman:<id>`,
`riwayatCari:<id>`), sehingga hanya berlaku di peramban yang sama. Opsional — hanya perlu bila riwayat harus ikut di semua perangkat:

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Jumlah laporan harian per project (Mahasiswa › Cetak Laporan)

Cetak Laporan mahasiswa hanya menampilkan project yang punya ≥ 1 laporan harian. Karena daftar project tidak memuat jumlahnya,
frontend memanggil `GET /mahasiswa/laporan-harian/:proposalId` untuk **setiap** project (data dipakai ulang saat cetak). Opsional:

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Kontak admin (tombol Alat › Hubungi Admin)

Hubungi Admin (Ctrl/⌘ + M) membuka WhatsApp (`wa.me`) dengan pesan templat (jejak halaman, nama & peran pelapor). Nomor admin
sementara diambil dari env build frontend `VITE_ADMIN_WA` (`frontend/.env.example`), karena tidak ada endpoint yang bisa dibaca
semua peran (`GET /users` hanya admin/ketua). Kosong → dialog "Nomor admin belum diatur".

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Data anggota di respons proposal (Usulan › langkah Anggota)

Respons proposal (`GET /dosen/proposals/:id`, `GET /proposals/:id`) memuat `anggota[].user` hanya `id, name, fullName, email, kontak, noHp`,
tanpa `nim`, `nidn`, dan peran. Akibatnya, saat draf dibuka lagi, wizard Usulan tidak bisa membedakan dosen dan mahasiswa (dulu semua
terbaca dosen sehingga aturan komposisi tim gagal). **Sudah ditangani di frontend**: tiap anggota dilengkapi lewat
`GET /dosen/proposals/members/search?q=<email>` (mengirim `nim`, `nidn`, `roles`) lalu dicocokkan dengan `id`. Usulan perbaikan di API:

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Reset password oleh Admin (Manajemen Pengguna)

Lupa password mandiri **sudah tersambung** (`/lupa-password` → `POST /auth/forgot-password`, tautan email → `/reset-password?token=` →
`POST /auth/reset-password`). Untuk pengguna yang tidak bisa menerima email, dibutuhkan reset oleh Admin. Password asli **tidak pernah**
bisa ditampilkan/dicetak (disimpan bcrypt), jadi alurnya memakai password sementara sekali pakai:

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Log Aktivitas (Admin & Ketua LPPM, `/log`)

Halaman Log Aktivitas memakai `GET /activity-logs` (page, limit 15, `action` LIKE). **Kategori belum ada di backend**: filter Kategori di
frontend sementara dipetakan ke awalan `action` (`utils/kategoriLog.js`: LOGIN, user., proposal., review, laporan, dokumen., periode.,
template., luaran., backup.) dan kolom cari hanya menyaring halaman yang sedang tampil.

Semua kebutuhan API di bagian ini sudah tersedia (lihat "API sudah tersedia" di atas).

## Form Penilaian Reviewer & pendanaan (`/penugasan/nilai/proposal|laporan/:id`)

Halaman Form Penilaian (`pages/review/FormReviewPage.jsx`) mengikuti formulir kertas LPPM: 7 komponen substansi (skor 1–5 + catatan
singkat), total & rata-rata (≥ 4,0 layak lanjut, 3,0–3,9 layak dengan revisi, < 3,0 tidak layak), catatan reviewer, rekomendasi
(Diterima = `disetujui`, Diterima dengan perbaikan = `revisi`, Ditolak = `ditolak`), dan **dana disetujui** yang ditentukan reviewer
(≤ dana diusulkan; ditolak → Rp 0). Saat ini server hanya menyimpan `catatan` + `rekomendasi`; skor, catatan singkat & dana disetujui
disimpan sebagai draf `localStorage` (`formReview:<userId>:<tipe>:<id>`, `utils/rubrikReview.js`) — hanya di peramban reviewer itu dan
tidak terlihat Ketua. Kolom lama `nilaiRelevansi/Metodologi/Anggaran/Luaran` tidak dipakai form baru.

| ID | Elemen UI | Kebutuhan data | Usulan endpoint / perubahan | Catatan |
|---|---|---|---|---|
| W-54 | Form Penilaian: skor per komponen + catatan singkat, dana disetujui; ringkasan di Detail (reviewer) & Hasil review (Ketua/pengusul) | Skor 1–5 per komponen, catatan singkat, dana disetujui per review | Tabel `ReviewSkor` (`reviewId` FK `ProposalReview` CASCADE, `kode` VARCHAR(40), `skor` TINYINT 1–5, `catatan` VARCHAR(200), unik `reviewId+kode`); kolom `ProposalReview.danaDisetujui` DECIMAL(15,2) NULL. `POST /proposals/:id/reviews` & `/laporan/:id/reviews` menerima `skor: [{kode, skor, catatan?}]` + `danaDisetujui` (proposal saja; 400 bila > `anggaran` atau < 0); respons review (+ `myReview` di tugasan, `GET /proposals/:id/reviews`) mengirim `skor`, `totalSkor`, `rataSkor`, `danaDisetujui`. `/finalize` menolak (400) bila skor belum lengkap, `rekomendasi` kosong, atau `danaDisetujui` kosong pada proposal (`ditolak` → 0). Opsional: rubrik di master (`GET /master/rubrik-review?jenis=&tipe=` → `[{kode,label,urutan}]`) agar pengabdian & laporan punya komponen sendiri | Kode komponen frontend: `judul`, `relevansi`, `latar`, `kebaruan`, `pustaka`, `konsistensi`, `kelayakan` (rubrik sama untuk penelitian, pengabdian, dan laporan sampai ada rubrik lain). **Keputusan UAT pendanaan**: dana final = dana disetujui **reviewer**, tidak bisa dinegosiasi/diubah (Ketua pun tidak) setelah review difinalisasi → simpan juga di kegiatan, mis. kolom `danaDisetujui` di Penelitian/Pengabdian yang diisi saat finalisasi review proposal, dikirim di **semua** respons proposal & laporan (laporan = dana proposal asal; `GET /proposals`, `/proposals/:id`, `/dosen/proposals*`, `/laporan*`, `/monitoring/proposals`, `/export/proposals`). **Statistik/pelaporan hanya memakai dana disetujui; proposal yang belum disetujui tidak dihitung**: `/monitoring/ringkasan` & `/monitoring/dosen` `anggaranDisetujui` = jumlah `danaDisetujui` proposal `disetujui` (`totalAnggaran` diajukan tidak lagi ditampilkan). Frontend sudah memakai `utils/danaKegiatan.js` (`danaFinal`, `totalDana`): selama field belum ada, nilainya sementara = `anggaran` proposal disetujui + penanda ApiPending. |

## Elemen desain yang belum dibuat (bukan soal API)

- Grup menu **Kegiatan → Penelitian, Pengabdian** sudah dibuat (khusus dosen).
- Menu **Luaran** (`/luaran`, dosen) sudah ada tetapi menampilkan **501 Not Implemented**:
  fitur menunggu kelanjutan perkembangan dari Pihak Kampus (berkaitan dengan W-01).
- Menu **Panduan** dari desain belum ada halamannya; halaman **Bantuan** (`/bantuan`, tombol Alat / Ctrl+H) sudah ada tetapi masih **501** — sistematika panduan menyusul.
- Halaman **Pengaturan** sudah ada di `/profil` (dibuka dari kartu nama di bawah sidebar).
