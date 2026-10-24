# Catatan Redesign UI — LPPM (tema "Navy Akademik")

Redesign ini **hanya mengubah tampilan** (JSX/Tailwind/CSS). Logika, pemanggilan API,
hak akses per peran, dan fitur tidak diubah.

## Pembaruan: dashboard seragam untuk semua peran

Dashboard admin, Ketua LPPM, dosen, mahasiswa, dan reviewer kini memakai **satu susunan halaman
yang sama**; peran hanya menentukan data yang mengisinya. Sebelumnya ada tiga halaman terpisah
(`DashboardPage`, `DashboardDosen`, `DashboardMahasiswa`) dan reviewer murni hanya melihat kartu
"Akses halaman belum tersedia".

**Susunan (sama untuk semua peran)**

1. Kepala halaman: tanggal, peran, sapaan, ringkasan satu kalimat dari data, aksi utama, Muat ulang.
2. Ledger empat angka: Total, Perlu tindakan, Dalam proses, Selesai. Tiap angka punya keterangan.
3. Kolom kiri: **Perlu perhatian** (diurutkan dari yang paling mendesak) → daftar utama →
   umpan aktivitas.
4. Kolom kanan: sebaran status (bilah bersegmen + jumlah dan persentase) → periode berjalan →
   pintasan dengan keterangan langsung.

**Isi per peran**

| Peran | Daftar utama | Umpan | Panel kanan kedua |
|---|---|---|---|
| Admin / Ketua LPPM | Proposal terbaru | Aktivitas sistem | Periode berjalan + sisa hari |
| Dosen | Proposal terbaru | Notifikasi | Periode berjalan + sisa hari |
| Mahasiswa | Proposal yang diikuti | Laporan harian terbaru | Periode proposal |
| Reviewer | Tugasan review | Notifikasi | Rekomendasi yang diberikan |

Dosen/mahasiswa/pengelola yang juga memegang tugasan review mendapat butir "tugasan review belum
selesai" di Perlu perhatian dan pintasan Penugasan review, dalam susunan yang sama.

**Berkas**

- Baru: `src/pages/dashboard/` — `DashboardHome.jsx` (pintu masuk), `DashboardScreen.jsx`
  (tampilan), `components.jsx` (blok UI), `useDashboardData.js`, `format.js`, dan `adapters/`
  (`pengelola`, `dosen`, `mahasiswa`, `reviewer`, `shared`). Menambah peran atau panel = menambah
  adapter; tampilan tidak perlu disentuh.
- Diubah: `src/pages/DashboardLayout.jsx` (tiga impor lama diganti `DashboardHome`; reviewer murni
  kini mendapat dashboard).
- Dihapus: `DashboardPage.jsx`, `DashboardDosen.jsx`, `DashboardMahasiswa.jsx`.
- Tanpa perubahan pada `src/api/*`, store, router, `package.json`. Tidak ada endpoint baru:
  semuanya memakai endpoint yang sudah dipakai halaman lain.

**Perilaku data**

- Tiap sumber data diambil terpisah. Bila satu gagal, bagiannya ditandai "Belum dapat dimuat",
  angka terkait tampil "—", dan muncul pemberitahuan dengan tombol Coba lagi; sisanya tetap tampil.
- Muat ulang mempertahankan isi lama (tanpa kerangka) dan hanya menonaktifkan tombolnya.
- Statistik admin lama mencari status berbahasa Inggris (`approved`, `submitted`, ...), sedangkan
  halaman lain memakai bahasa Indonesia (`disetujui`, `diajukan`, ...). Dashboard baru memetakan
  keduanya ke satu kunci, jadi angka benar apa pun istilah yang dikirim backend.
- Peran yang tidak terbukti boleh membaca `/periode` (mahasiswa, reviewer) tidak memanggilnya;
  periode diturunkan dari proposal mereka.

**Verifikasi**: `npm run build` berhasil; `npm run lint`: 0 error, 4 peringatan lama (tidak ada dari
berkas baru). Diuji di Chromium headless terhadap API tiruan: 5 peran + varian tugasan, keadaan
kosong, gagal sebagian, gagal total, muat ulang, navigasi, penjajaran angka pada 390/1024/1440px,
dan axe-core (WCAG 2.1 AA) tanpa pelanggaran. **Belum diuji terhadap backend asli** — bentuk
respons diasumsikan dari cara halaman lain membacanya.

**Opsional**: `recharts` tidak lagi dipakai di mana pun di `src/` (bundel utama turun ±350 kB).
`package.json` sengaja tidak diubah; hapus dengan `npm uninstall recharts` bila tidak diperlukan.

## Yang tidak diubah (identik byte-per-byte dengan versi asli)

- `src/api/*`, `src/store/*`, `src/router/*`, `src/utils/*` (termasuk export PDF/Excel)
- `src/main.jsx`, `src/App.jsx`, `src/App.css`
- `package.json`, `package-lock.json` (tidak ada dependensi baru), `vite.config.js`,
  `eslint.config.js`, `.env`, `.gitignore`, `public/template-proposal.docx`, `public/icons.svg`

## Sistem desain

- **Warna**: skala `navy-50 … navy-950` sebagai warna merek, kuningan (`brass-*`) sebagai
  aksen yang sangat hemat (lencana notifikasi/jumlah), kanvas `#f4f6fa`, sidebar `#0d1c3f`.
  Palet bawaan Tailwind (gray, slate, blue, green, red, yellow, purple, …) dipetakan ulang
  di blok `@theme` pada `src/index.css`, sehingga semua kelas lama otomatis selaras.
- **Tipografi**: Newsreader (judul & angka ringkasan) + Plus Jakarta Sans (antarmuka),
  dimuat lewat Google Fonts di `index.html`. Bila offline, otomatis memakai font sistem.
  Ukuran isi 14px.
- **Komponen** (di `src/index.css`): `.btn` (`-primary`, `-secondary`, `-ghost`, `-danger`,
  `-destructive`, `-sm`), `.icon-btn`, `.label`, `.input`, `.card`, `.badge`
  (`-neutral`, `-info`, `-review`, `-warning`, `-success`, `-danger`, `-tag`, `-plain`),
  `.table-wrap` / `.table` / `.table-tight`, `.page` / `.page-title` / `.page-desc`,
  `.overlay` / `.dialog`, `.spinner`.
- **Prinsip**: garis tipis menggantikan bayangan; status = titik kecil + kata; tanpa gradien,
  emoji, atau label HURUF BESAR; menu samping menjadi laci (drawer) di ponsel.

## Berkas yang diubah

`index.html`, `public/favicon.svg`, `src/index.css`, `src/components/{Sidebar,NotificationBell}.jsx`,
dan halaman: `DashboardLayout`, `LoginPage`, `RegisterPage` (tiga dashboard per-peran kini digantikan
`pages/dashboard/`, lihat bagian Pembaruan di atas),
`PeriodePage` (+ `pages/periode/*`), `UserManagementPage`,
`ProposalPage`, `ProposalDosenPage` (+ `pages/ProposalDosen/*`), `UndanganPage`,
`LaporanHarianPage`, `ReviewTugasanPage`, `ExportPage`, `ProfilePage`.

## Perubahan kecil yang sifatnya tampilan

- Kolom "Jenis" pada tabel proposal admin digabung ke sel judul (sebagai penanda kecil).
- Panel detail pengguna (admin) dibuka sebagai laci di layar kecil.
- Efek hover berbasis JavaScript diganti CSS; teks pengantar yang berulang dan penghitung ganda dirapikan.
- Salinan teks kecil dirapikan, mis. klaim "drag & drop" pada unggah laporan harian dihapus
  karena areanya memang hanya bisa diklik; titik berlebih di kalimat undangan dihapus.
- Atribut aksesibilitas ditambahkan (label terhubung ke input, `role="dialog"`, dsb.).

## Verifikasi yang dijalankan

- Perbandingan struktur kode (AST) tiap file terhadap aslinya: semua selisih ditinjau satu per
  satu dan hanya berupa kelas CSS, markup, atau atribut aksesibilitas.
- `npm run build` berhasil; `npm run lint`: 0 error, 4 peringatan (sama dengan versi asli).
- Tangkapan layar tiap peran (admin, ketua LPPM, dosen, dosen dengan tugasan, mahasiswa,
  reviewer) di desktop 1440px dan ponsel 390px, dengan data tiruan.

## Catatan

- `src/components/ProfileModal.jsx` tidak dipakai di mana pun, jadi tidak diubah.
- Temuan di luar lingkup UI (perilaku bawaan, tidak diubah): setelah "Simpan Profil",
  `fetchMe()` menyalakan `loading` global sehingga halaman sejenak diganti layar
  "Menyiapkan dashboard Anda" dan pesan "Profil berhasil disimpan." tidak sempat terlihat.
  Data tetap tersimpan. Perilaku ini sama persis pada versi asli.
