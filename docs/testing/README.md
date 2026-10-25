# Hasil Pengujian Sistem Informasi LPPM

Pengujian oleh **Gema Suaria (2023020198)** — Software Tester, tanggal **25 Oktober 2026**, terhadap kode commit `5c6d152` (branch `main`).
Dokumen lengkap (rencana uji, kasus uji, laporan bug, ringkasan, dan bukti tangkapan layar): [`Dokumen_Pengujian_Sistem.pdf`](Dokumen_Pengujian_Sistem.pdf) / [`.docx`](Dokumen_Pengujian_Sistem.docx).

## Ringkasan

| Jenis pengujian | Jumlah | Berhasil | Gagal |
|---|---|---|---|
| Unit test backend (`go test ./...`) | 19 | 19 | 0 |
| API end-to-end (`backend_go/scripts/e2e.py`) | 598 | 598 | 0 |
| Antarmuka / black box (Playwright) | 29 | 28 | 1 |
| **Total** | **646** | **645** | **1** |

> Catatan: `CLAUDE.md` menyebut 599 cek E2E; hasil eksekusi aktual adalah 598 cek.

Kesimpulan: **layak digunakan dengan catatan** — tidak ada bug kritis; BUG-01 (tinggi) punya jalan alternatif lewat menu Periode tetapi perlu diperbaiki.

## Bug yang ditemukan

| ID | Bug | Keparahan | Kasus uji | Status | Saran perbaikan |
|---|---|---|---|---|---|
| BUG-01 | Penugasan reviewer dari menu Dokumen Masuk Proposal tidak tersimpan | Tinggi | TC-20 | Terbuka (dilaporkan ke Frontend Developer) | Tambahkan tombol Tugaskan Reviewer pada detail proposal di Dokumen Masuk yang memanggil POST /proposals/:id/reviewers (seperti pada halaman Laporan Kegiatan dan panel Periode), dan hapus pilihan reviewer dari formulir Ubah Status. |
| BUG-02 | NIDN/NIM anggota tim kosong pada Surat Tugas | Sedang | TC-28 | Terbuka (dilaporkan ke Backend dan Frontend Developer) | Tambahkan field nidn dan nim pada data anggota[].user di backend, atau ambil identitas anggota dari endpoint pengguna saat menyusun surat tugas. |
| BUG-03 | Pesan galat masih berbahasa Inggris | Rendah | TC-02, TC-03, TC-26 | Terbuka | Terjemahkan pesan di sisi frontend (pemetaan pesan) tanpa mengubah kontrak API. |

Rincian (langkah reproduksi, dugaan penyebab) ada di Bab 5 dokumen pengujian.

## Kasus uji black box

| ID | Modul | Skenario | Hasil yang diharapkan | Hasil pengujian | Status | Bukti |
|---|---|---|---|---|---|---|
| TC-01 | Autentikasi | Login dengan email dan password yang benar | Masuk ke halaman Dashboard dosen | Diarahkan ke /dashboard dan salam "Halo" tampil | ✅ Berhasil | [png](bukti/TC-01.png) |
| TC-02 | Autentikasi | Login dengan password salah | Login ditolak dan muncul pesan kesalahan | Tetap di halaman login, pesan: "Invalid credentials" | ✅ Berhasil | [png](bukti/TC-02.png) |
| TC-03 | Autentikasi | Login akun yang belum disetujui admin | Login ditolak dengan pesan akun belum disetujui | Login ditolak, pesan: "Account not approved yet" | ✅ Berhasil | [png](bukti/TC-03.png) |
| TC-04 | Autentikasi | Membuka halaman privat tanpa login | Diarahkan ke halaman login | Diarahkan ke /login | ✅ Berhasil | [png](bukti/TC-04.png) |
| TC-05 | Autentikasi | Registrasi dengan isian kosong | Registrasi tidak terkirim dan kolom wajib ditandai | Tetap di /register; kolom wajib ditandai browser ("Please fill out this field.") | ✅ Berhasil | [png](bukti/TC-05.png) |
| TC-06 | Autentikasi | Keluar dari sistem | Muncul dialog konfirmasi lalu kembali ke halaman login | Dialog konfirmasi muncul, setelah dikonfirmasi kembali ke /login | ✅ Berhasil | [png](bukti/TC-06.png) |
| TC-07 | Umum | Membuka alamat yang tidak ada | Tampil halaman galat 404 | Halaman galat 404 tampil | ✅ Berhasil | [png](bukti/TC-07.png) |
| TC-08 | Usulan Proposal | Lanjut ke langkah berikutnya tanpa mengisi judul | Tidak bisa lanjut dan muncul pesan isian wajib | Tetap di langkah Identitas, pesan: "wajib diisi" | ✅ Berhasil | [png](bukti/TC-08.png) |
| TC-09 | Usulan Proposal | Menyimpan draf proposal baru tanpa abstrak | Draf tidak disimpan dan muncul pesan isian minimal untuk draf | Draf tidak disimpan, pesan: "Untuk menyimpan draf, isi dulu abstrak minimal 20 karakter (langkah Dokumen)." | ✅ Berhasil | [png](bukti/TC-09.png) |
| TC-10 | Usulan Proposal | Mengubah draf proposal yang sudah ada | Draf tersimpan dan muncul pesan "Draf tersimpan pukul …" | Muncul pesan "Draf tersimpan pukul …" dan judul baru tersimpan | ✅ Berhasil | [png](bukti/TC-10.png) |
| TC-11 | Usulan Proposal | Komposisi tim penelitian kurang dari aturan | Sistem menampilkan aturan komposisi tim dan menahan langkah | Langkah tertahan di Anggota; panel "Ketentuan tim penelitian" menampilkan anggota dosen 0 (ketentuan 2–3) | ✅ Berhasil | [png](bukti/TC-11.png) |
| TC-12 | Usulan Proposal | Mengajukan proposal saat undangan anggota belum diterima | Tombol Ajukan proposal tidak aktif dan muncul keterangan anggota belum menerima undangan | Tombol Ajukan proposal nonaktif; keterangan: "3 anggota belum menerima undangan." | ✅ Berhasil | [png](bukti/TC-12.png) |
| TC-13 | Kegiatan | Melihat detail kegiatan yang disetujui | Tampil Detail Kegiatan berisi abstrak, tim, dokumen utama, dan tahapan | Detail Kegiatan tampil lengkap (Abstrak, Tim, Dokumen utama) di /kegiatan/penelitian/detail/1 | ✅ Berhasil | [png](bukti/TC-13.png) |
| TC-14 | Kegiatan | Menyaring riwayat berdasarkan status | Hanya proposal berstatus disetujui yang tampil pada tabel Riwayat | 1 baris tampil pada Riwayat, semuanya berstatus Disetujui | ✅ Berhasil | [png](bukti/TC-14.png) |
| TC-15 | Luaran | Membuka menu Luaran (pencairan dana) | Tampil keterangan 501 fitur belum tersedia | Halaman 501 (fitur menunggu keputusan kampus) tampil | ✅ Berhasil | [png](bukti/TC-15.png) |
| TC-16 | Mahasiswa | Menerima undangan ikut serta | Status undangan berubah menjadi Diterima | Undangan berhasil diterima, status menjadi Diterima | ✅ Berhasil | [png](bukti/TC-16.png) |
| TC-17 | Mahasiswa | Mengakses halaman usulan proposal | Akses ditolak (mahasiswa tidak mengusulkan proposal) | Form usulan tidak tersedia; mahasiswa dialihkan ke Dashboard | ✅ Berhasil | [png](bukti/TC-17.png) |
| TC-18 | Mahasiswa | Mengisi laporan harian | Laporan harian baru tampil di riwayat | Laporan harian tersimpan dan tampil di Riwayat Laporan Harian | ✅ Berhasil | [png](bukti/TC-18.png) |
| TC-19 | Review | Menyelesaikan penilaian proposal | Review final tersimpan dan tugasan berstatus Selesai | Review proposal "Analisis Sentimen…" tersimpan final (isDone = true), tugasan menjadi Selesai | ✅ Berhasil | [png](bukti/TC-19.png) |
| TC-20 | Dokumen Masuk | Menugaskan reviewer dari menu Dokumen Masuk Proposal | Ketua dapat memilih reviewer dan reviewer tercatat pada proposal | Pilihan reviewer hanya muncul saat status "Revisi"; reviewer yang dicentang tidak tersimpan (0 reviewer) dan status langsung menjadi Revisi | ❌ Gagal | [png](bukti/TC-20.png) |
| TC-21 | Periode | Menugaskan reviewer dari panel Periode | Reviewer tercatat dan status proposal menjadi Review | Reviewer tercatat (1) dan status proposal menjadi "review" | ✅ Berhasil | [png](bukti/TC-21.png) |
| TC-22 | Periode | Admin tidak dapat menambah periode | Tombol Tambah Periode tidak tersedia | Tombol Tambah Periode tidak tampil untuk Admin | ✅ Berhasil | [png](bukti/TC-22.png) |
| TC-23 | Periode | Ketua menambah periode baru | Periode baru muncul di Daftar Periode | Periode "Penelitian Semester Genap 2027 Uji" muncul di Daftar Periode | ✅ Berhasil | [png](bukti/TC-23.png) |
| TC-24 | Backup | Admin melakukan backup manual | Backup baru berstatus Berhasil di Daftar Backup | Baris backup bertambah (1 → 2) dengan status Berhasil | ✅ Berhasil | [png](bukti/TC-24.png) |
| TC-25 | Pencarian | Pencarian global dengan Ctrl+F | Popup pencarian menampilkan proposal yang cocok | Popup menampilkan proposal "Sistem Pendukung Keputusan Pemilihan Mitra…" (proposal dan laporan) | ✅ Berhasil | [png](bukti/TC-25.png) |
| TC-26 | Profil | Mengganti password dengan password lama salah | Penggantian password ditolak dengan pesan kesalahan | Ditolak, pesan: "Old password is incorrect" | ✅ Berhasil | [png](bukti/TC-26.png) |
| TC-27 | Cetak Dokumen | Mencetak Export Rekapitulasi Proposal | Berkas PDF rekapitulasi terunduh | Berkas "Laporan-Proposal-LPPM-2026-10-25.pdf" terunduh (45413 byte) | ✅ Berhasil | [png](bukti/TC-27.png) |
| TC-28 | Cetak Dokumen | Membuat Surat Tugas untuk kegiatan disetujui | Berkas PDF Surat Tugas terunduh | Berkas "Surat_Tugas_Pelatihan_Literasi_Digital_dan_Pemasaran.pdf" terunduh (10884 byte) | ✅ Berhasil | [png](bukti/TC-28.png) |
| TC-29 | Manajemen User | Admin menyetujui akun yang mendaftar | Status akun berubah menjadi Approved | Status akun pending.dosen@lppm.dev berubah menjadi approved | ✅ Berhasil | [png](bukti/TC-29.png) |

## Pengujian API end-to-end per modul

| Modul | Jumlah cek | Hasil |
|---|---|---|
| Autentikasi (login, token, registrasi, lupa password) | 24 | 24/24 berhasil |
| Manajemen pengguna | 25 | 25/25 berhasil |
| Periode dan hak akses periode | 36 | 36/36 berhasil |
| Proposal, undangan anggota, modul dosen | 47 | 47/47 berhasil |
| Aturan komposisi tim | 21 | 21/21 berhasil |
| Penugasan reviewer, review, dan status proposal | 27 | 27/27 berhasil |
| Dokumen utama dan dokumen lampiran | 24 | 24/24 berhasil |
| Laporan kemajuan/akhir | 17 | 17/17 berhasil |
| Laporan harian mahasiswa | 14 | 14/14 berhasil |
| Laporan kegiatan, kata kunci, metode penelitian | 92 | 92/92 berhasil |
| Profil, foto, ekspor dan hapus akun | 61 | 61/61 berhasil |
| Luaran kegiatan dan nilai kepercayaan | 43 | 43/43 berhasil |
| Verifikasi email | 9 | 9/9 berhasil |
| Master data dan detail mitra | 31 | 31/31 berhasil |
| Hak akses reviewer (beri, cabut, cabut paksa) | 62 | 62/62 berhasil |
| Pembatasan mahasiswa mengusulkan proposal | 16 | 16/16 berhasil |
| Notifikasi, log aktivitas, dasbor, ekspor, lain-lain | 32 | 32/32 berhasil |
| Backup database | 17 | 17/17 berhasil |

Daftar 598 cek beserta statusnya: [`hasil-otomatis/e2e-daftar-cek.tsv`](hasil-otomatis/e2e-daftar-cek.tsv).

## Isi folder

| Path | Isi |
|---|---|
| `Dokumen_Pengujian_Sistem.pdf/.docx` | Dokumen pengujian lengkap (output tester) |
| `bukti/TC-*.png` | Tangkapan layar akhir setiap kasus uji black box |
| `bukti/*.pdf` | Berkas hasil cetak yang diunduh saat TC-27 (rekapitulasi) dan TC-28 (surat tugas) |
| `hasil-otomatis/` | Keluaran `go test`, `go vet`, ringkasan & daftar cek E2E, hasil black box (JSON) |
| `skrip/data-contoh.py` | Membuat 9 proposal contoh (komposisi tim sah, berbagai status) lewat API |
| `skrip/uji-blackbox.js` | Skrip Playwright 29 kasus uji black box |

## Menjalankan ulang pengujian

Gunakan database **pengembangan** (skrip membuat dan mengubah data). Backend dijalankan dengan `TRUST_PROXY=true`.

```bash
# 1. Unit test
cd backend_go && go vet ./... && go test ./...

# 2. API end-to-end (database baru yang sudah di-seed, server terpisah)
go run ./cmd/migrate && go run ./cmd/seed && go run ./cmd/server   # terminal lain
python3 scripts/e2e.py http://localhost:3000

# 3. Black box UI (database baru: migrate + seed), backend :3000, frontend :5173
python3 ../docs/testing/skrip/data-contoh.py      # proposal contoh
go run ./cmd/seed-tahap-1                          # laporan contoh
cd ../docs/testing/skrip && npm i playwright && npx playwright install chromium
node uji-blackbox.js ./keluaran                    # hasil: keluaran/hasil_bb.json + keluaran/bukti/
```

Login dibatasi 10 kali per 15 menit per IP; skrip memakai ulang sesi login, tetapi jalankan ulang server backend sebelum mengulang skrip agar batas tersebut ter-reset.
