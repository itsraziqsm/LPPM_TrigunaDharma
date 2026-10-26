# API Baru (backend Go)

Dokumen ini untuk **developer frontend**. Isinya perubahan backend yang terlihat dari sisi
API, dikelompokkan per rilis:

- **Bagian 1–9** — pemecahan tabel Proposal + fitur **laporan** (`/api/v1/laporan`).
- **Bagian 10** — Grup A dari `docs/waitingApi-list.md`: profil sendiri (W-08), jabatan
  fungsional (W-09), statistik dosen (W-11, W-17), proposal sebagai anggota (W-16), skema
  penelitian (W-14), mitra pengabdian (W-15), master program studi (W-19).
- **Bagian 11** — Grup B: tahapan kegiatan (W-03/W-13), nilai SINTA (W-04), foto profil
  (W-07/W-10), unduh data akun (W-20), hapus akun sendiri (W-21).
- **Bagian 12** — Grup C: luaran kegiatan terstruktur (W-01, W-02, W-12), nilai kepercayaan
  (W-06), verifikasi email (W-18). Sertifikasi (W-05) ditunda.
- **Bagian 13** — W-22 sampai W-25: rumpun ilmu & bidang, kontak anggota di pencarian, kata
  kunci, master jenis luaran.
- **Bagian 14** — W-26: detail mitra pengabdian (jenis, alamat, kontak, pernyataan kebutuhan) +
  master jenis mitra.
- **Bagian 15** — W-27 kata kunci laporan, W-28 metode penelitian laporan, W-30 Ketua LPPM
  mengatur peran reviewer.
- **Bagian 16** — Hak akses reviewer dosen: default bukan reviewer, diberi Admin/Ketua, cabut
  biasa hanya tanpa tugasan terbuka, cabut paksa oleh Ketua dengan pengalihan tugasan; prioritas
  reviewer yang belum punya tugasan (kandidat, rekomendasi, pengalihan otomatis).
- **Bagian 17** — Mahasiswa tidak lagi bisa mengusulkan proposal (hanya undangan tim & laporan harian).
- **Bagian 18** — Aturan komposisi tim saat proposal diajukan (penelitian / pengabdian).
- **Bagian 19** — Backup database: otomatis bulanan oleh sistem, manual oleh admin, log + unduh + hapus.
- **Bagian 20** — Hak akses periode: admin hanya melihat, Ketua tambah/ubah/hapus langsung, admin hapus lewat verifikasi Ketua.
- **Bagian 21** — Template proposal yang bisa diganti admin (unggah versi baru per tahun, riwayat, unduh publik).
- **Bagian 22** — Detail undangan untuk calon anggota yang belum menerima (W-35).
- **Bagian 23** — Admin menghapus proposal/laporan yang sudah diajukan dengan izin Ketua (W-34).
- **Bagian 24** — Peran baru **Ketua STMIK** (`ketua_stmik`) + endpoint pemantauan `/monitoring`.
- **Bagian 25** — Luaran prioritas **jurnal & poster** (jenis baru `poster`) + admin mengunduh luaran dosen (daftar, CSV, ZIP).
- **Bagian 26** — Rumpun ilmu difokuskan ke **bidang komputer** (validasi di proposal & laporan, rumpun ilmu laporan bisa diubah).

- Base URL: `VITE_API_URL` (default `http://localhost:3000/api/v1`)
- Semua endpoint butuh header `Authorization: Bearer <accessToken>`
- Format respons sama seperti endpoint lain: `{ success, message, data[, meta] }`
- Migrasi DB: `migrations/20261024000000_split_proposal_penelitian_pengabdian`,
  `migrations/20261025000000_profil_skema_mitra_program_studi`,
  `migrations/20261026000000_sinta_foto_hapus_akun`,
  `migrations/20261027000000_luaran_verifikasi_email`,
  `migrations/20261028000000_rumpun_bidang_kata_kunci_master`,
  `migrations/20261029000000_detail_mitra_pengabdian`,
  `migrations/20261030000000_metode_penelitian_laporan`

---

## 1. Ringkasan untuk frontend

| Perubahan | Dampak ke FE |
|---|---|
| Tabel `Proposal` dipecah menjadi `Penelitian` dan `Pengabdian` | **Tidak ada.** URL & id proposal tetap sama. |
| Field baru `tipe` di respons proposal | Selalu `"proposal"` di endpoint proposal lama. Boleh diabaikan. |
| Field baru `luaran` di proposal | Target luaran (teks). **Opsional**, bisa dikirim saat create/update proposal. |
| Endpoint baru `/api/v1/laporan` | Fitur laporan: dibuat pengusul setelah proposal **disetujui**, lalu direview seperti proposal. |
| Jenis notifikasi baru | `laporan_diajukan`, `laporan_disetujui`, `laporan_ditolak`, `laporan_revisi` (+ `reviewer_ditugaskan` & `review_selesai` dengan `refType: "laporan"`). |

> **Jangan tertukar** dengan fitur lama `LaporanProposal` (`/proposals/:id/laporan`,
> laporan kemajuan/akhir) dan `/mahasiswa/laporan-harian`. Keduanya **tetap ada dan tidak
> berubah**. API di dokumen ini adalah fitur **laporan** baru yang punya alur review.

---

## 2. Perubahan pada endpoint proposal lama

### 2.1 Field baru di respons

Berlaku untuk semua respons proposal (`/proposals`, `/proposals/my`, `/proposals/:id`,
`/dosen/proposals`, `/dosen/proposals/:id`, dan respons create/update/submit/status):

```jsonc
{
  "id": 5,
  "tipe": "proposal",                 // BARU — selalu "proposal" di endpoint ini
  "judul": "Sistem Uji Coba",
  "abstrak": "...",
  "jenis": "penelitian",
  "status": "disetujui",
  "anggaran": "15000000.5",
  "luaran": "1 artikel jurnal SINTA 3", // BARU — target luaran, boleh null
  "skema": "Penelitian Dosen Pemula",   // BARU (bagian 10) — hanya penelitian, pengabdian selalu null
  "mitra": null,                        // BARU (bagian 10) — hanya pengabdian, penelitian selalu null
  "catatanRevisi": null,
  // ... field lain tetap sama ...
  "updatedAt": "2026-10-24T14:44:04.764Z",
  "tahapan": { "kode": "pelaksanaan", "label": "Pelaksanaan Kegiatan", "urutan": 2 } // BARU (bagian 11)
}
```

### 2.2 Field baru di request

`POST /proposals`, `PATCH /proposals/:id`, `POST /dosen/proposals`, `PATCH /dosen/proposals/:id`
menerima field opsional:

| Field | Tipe | Keterangan |
|---|---|---|
| `luaran` | string | Target luaran proposal (mis. "1 artikel jurnal SINTA 3, 1 HKI"). Akan disalin ke laporan. |

Mengubah `jenis` lewat PATCH tetap boleh (selama status `draft`/`revisi`). Id proposal tidak
berubah. Satu-satunya pengecualian: proposal yang sudah punya laporan tidak bisa diubah
jenisnya.

### 2.3 Yang tidak berubah

URL, role, pesan, status code, dan field lama semua endpoint proposal tidak berubah. Laporan
**tidak muncul** di endpoint proposal lama:

- `GET /proposals/:id` dengan id laporan → `500 "Proposal tidak ditemukan"` (sama seperti id
  yang tidak ada).
- `GET /reviewer/my-tugasan` hanya berisi tugasan **proposal**. Tugasan laporan ada di
  `GET /laporan/tugasan`.
- `GET /auth/me` → `hasTugasan: true` juga untuk user yang hanya punya tugasan laporan.

---

## 3. Alur laporan

```
Proposal "disetujui" (oleh ketua)
        │
        ▼
[Pengusul] POST /laporan {proposalId}        → laporan status "draft" (data proposal disalin)
[Pengusul] PATCH /laporan/:id                → isi luaranTercapai, ringkasanHasil, realisasiAnggaran
[Pengusul] POST /laporan/:id/dokumen (file)  → atau isi dokumenUrl lewat PATCH
[Pengusul] POST /laporan/:id/submit          → "diajukan"   (notifikasi ke semua ketua_lppm)
        │
        ▼
[Ketua/Admin] POST /laporan/:id/reviewers    → "review"     (notifikasi ke reviewer)
[Reviewer]    POST /laporan/:id/reviews      → simpan nilai/catatan/rekomendasi
[Reviewer]    POST /laporan/:id/reviews/finalize → isDone=true (notifikasi ke pengusul)
        │
        ▼
[Ketua/Admin] PATCH /laporan/:id/status      → "revisi" | "disetujui" | "ditolak"
                                               (notifikasi ke pengusul)
        │
   "revisi" → pengusul bisa PATCH/upload lagi lalu submit ulang
```

- Status laporan sama dengan proposal: `draft → diajukan → review → revisi | disetujui | ditolak`.
- **Maksimal 1 laporan per proposal.**
- Yang bisa membuat & mengubah laporan hanya **pengusul** proposal (dosen/mahasiswa).
  Anggota proposal (undangan `diterima`) hanya bisa **melihat**.
- Reviewer bisa user mana pun yang `approved` (role reviewer, atau dosen/mahasiswa yang
  ditugaskan), **kecuali pengusul** laporan itu sendiri.

### Status code endpoint laporan

Berbeda dengan endpoint lama hasil port Node (yang sering mengembalikan 500 untuk error
bisnis), endpoint laporan memakai status yang sesuai:

| Status | Arti | Contoh `message` |
|---|---|---|
| 400 | Aturan bisnis / parameter salah | `"Laporan hanya bisa diubah saat status draft atau revisi"` |
| 401 | Token tidak ada/invalid | `"Unauthorized"` |
| 403 | Role atau kepemilikan tidak cocok | `"Anda tidak memiliki akses ke laporan ini"`, `"Forbidden: insufficient permissions"` |
| 404 | Data tidak ada | `"Laporan tidak ditemukan"` |
| 409 | Duplikat | `"Proposal ini sudah memiliki laporan"` |
| 422 | Validasi body/query | `{"success":false,"message":"Validation error","errors":{"field":["pesan"]}}` |

---

## 4. Objek `Laporan`

Dikembalikan oleh list, create, update, submit, status, dan assign reviewer:

```json
{
  "id": 25,
  "tipe": "laporan",
  "proposalId": 23,
  "judul": "Sistem Uji Coba Golang",
  "abstrak": "Abstrak penelitian yang cukup panjang untuk validasi.",
  "jenis": "penelitian",
  "status": "disetujui",
  "anggaran": "15000000.5",
  "luaran": null,
  "skema": null,
  "mitra": null,
  "luaranTercapai": "1 artikel jurnal SINTA 3",
  "ringkasanHasil": "Ringkas",
  "realisasiAnggaran": "14000000",
  "catatanRevisi": null,
  "dokumenUrl": null,
  "dokumenNama": "laporan akhir.pdf",
  "dokumenMime": "application/pdf",
  "dokumenUkuran": 125,
  "submittedAt": "2026-10-24T14:44:04.645Z",
  "approvedAt": "2026-10-24T14:44:04.764Z",
  "createdAt": "2026-10-24T14:44:04.564Z",
  "updatedAt": "2026-10-24T14:44:04.764Z",
  "pengusul": { "id": 9, "name": "Dr. Dosen 1, M.T", "fullName": "Dr. Dosen 1, M.T", "email": "dosen1@lppm.dev", "nidn": "0100000001", "programStudi": "Teknik Informatika" },
  "periode": { "id": 5, "nama": "Penelitian Semester Ganjil 2025", "tahun": 2025, "jenis": "penelitian" },
  "proposal": { "id": 23, "judul": "Sistem Uji Coba Golang", "status": "disetujui", "luaran": null, "approvedAt": "2026-10-24T14:44:04.347Z" },
  "reviewerTugasan": [
    {
      "id": 16,
      "reviewerId": 4,
      "reviewer": { "id": 4, "name": "Dr. Reviewer 1, M.T", "fullName": "Dr. Reviewer 1, M.T", "email": "reviewer1@lppm.dev" },
      "createdAt": "2026-10-24T14:44:04.680Z"
    }
  ]
}
```

| Field | Keterangan |
|---|---|
| `id` | Id laporan. **Unik bersama id proposal**, jadi id laporan tidak pernah sama dengan id proposal mana pun. |
| `proposalId` | Id proposal asal. |
| `judul`, `abstrak`, `anggaran`, `luaran`, `skema`/`mitra`, `periode`, `jenis` | Disalin dari proposal saat laporan dibuat. `judul`/`abstrak` bisa diubah. |
| `luaranTercapai` | Luaran yang benar-benar dicapai. **Wajib diisi sebelum submit.** |
| `ringkasanHasil` | Ringkasan hasil kegiatan (opsional). |
| `realisasiAnggaran` | Realisasi anggaran. String desimal seperti `anggaran` (contoh `"14000000"`), boleh null. |
| `dokumenNama/Mime/Ukuran` | Info file laporan yang diunggah. Unduh lewat `GET /laporan/:id/dokumen`. File (blob) tidak pernah ikut di JSON. |
| `dokumenUrl` | Alternatif file: link (mis. Google Drive). Upload file akan mengosongkan `dokumenUrl`. |
| `catatanRevisi` | Catatan dari ketua/admin saat mengubah status. |
| `submittedAt` / `approvedAt` | Waktu submit terakhir / waktu disetujui. |
| `proposal` | Ringkasan proposal asal. |

**Detail** (`GET /laporan/:id`) menambahkan dua array:

```jsonc
"anggota": [   // anggota proposal asal
  { "id": 31, "peran": "anggota", "statusUndangan": "diterima",
    "user": { "id": 21, "name": "Mahasiswa 1", "fullName": "Mahasiswa 1", "email": "mahasiswa1@lppm.dev" } }
],
"reviews": [
  { "id": 10, "nilaiRelevansi": null, "nilaiMetodologi": null, "nilaiAnggaran": null, "nilaiLuaran": "85",
    "catatan": "Luaran sesuai", "rekomendasi": "disetujui", "isDone": true,
    "reviewer": { "id": 4, "name": "Dr. Reviewer 1, M.T", "fullName": "Dr. Reviewer 1, M.T" },
    "createdAt": "2026-10-24T14:44:04.716Z", "updatedAt": "2026-10-24T14:44:04.730Z" }
]
```

Urutan key di detail: `..., pengusul, periode, proposal, anggota, reviewerTugasan, reviews`.

---

## 5. Daftar endpoint

| Method | Path | Role | Keterangan |
|---|---|---|---|
| GET | `/laporan` | admin, ketua_lppm | Semua laporan (paginasi + filter) |
| GET | `/laporan/my` | dosen, mahasiswa | Laporan milik saya (sebagai pengusul) |
| GET | `/laporan/eligible` | dosen, mahasiswa | Proposal saya yang disetujui dan **belum** punya laporan |
| GET | `/laporan/tugasan` | reviewer, dosen, mahasiswa | Laporan yang ditugaskan ke saya untuk direview |
| POST | `/laporan` | dosen, mahasiswa | Buat laporan dari proposal disetujui |
| GET | `/laporan/:id` | login + akses* | Detail laporan |
| PATCH | `/laporan/:id` | dosen, mahasiswa (pengusul) | Ubah isi laporan (draft/revisi) |
| POST | `/laporan/:id/submit` | dosen, mahasiswa (pengusul) | Ajukan laporan ke ketua |
| DELETE | `/laporan/:id` | pengusul, admin | Hapus laporan (hanya draft) |
| POST | `/laporan/:id/dokumen` | dosen, mahasiswa (pengusul) | Upload file laporan (multipart) |
| GET | `/laporan/:id/dokumen` | login + akses* | Download file laporan |
| PATCH | `/laporan/:id/status` | ketua_lppm, admin | Keputusan: review/revisi/disetujui/ditolak |
| POST | `/laporan/:id/reviewers` | ketua_lppm, admin | Tugaskan reviewer |
| DELETE | `/laporan/:id/reviewers/:reviewerId` | ketua_lppm, admin | Hapus tugasan reviewer |
| GET | `/laporan/:id/reviews` | login + akses* | Daftar review laporan |
| POST | `/laporan/:id/reviews` | reviewer/dosen/mahasiswa yang **ditugaskan** | Simpan review |
| POST | `/laporan/:id/reviews/finalize` | reviewer/dosen/mahasiswa yang **ditugaskan** | Finalisasi review |

\* **Akses baca**: pengusul, admin, ketua_lppm, anggota proposal asal (undangan `diterima`),
dan reviewer yang ditugaskan ke laporan itu. Selain itu `403 "Anda tidak memiliki akses ke laporan ini"`.

`:id` yang bukan angka positif → `400 "Parameter id tidak valid."`.

---

### 5.1 `GET /laporan` dan `GET /laporan/my`

Query (semua opsional):

| Param | Tipe | Default | Keterangan |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | |
| `limit` | int 1–100 | 10 | |
| `jenis` | `penelitian` \| `pengabdian` | | |
| `status` | `draft` \| `diajukan` \| `review` \| `revisi` \| `disetujui` \| `ditolak` | | |
| `periodeId` | int | | |
| `search` | string | | Cari di judul/abstrak |

Nilai query yang tidak valid → 422. Urutan: terbaru dulu.

```json
{ "success": true, "message": "Laporan fetched", "data": [ /* Laporan */ ], "meta": { "page": 1, "limit": 10, "total": 4 } }
```

`/laporan/my` memakai message `"Laporan saya fetched"`.

### 5.2 `GET /laporan/eligible`

Proposal milik user yang `disetujui` dan belum punya laporan. Bisa dipakai untuk dropdown
"Buat laporan".

```json
{
  "success": true,
  "message": "Proposal siap dilaporkan fetched",
  "data": [
    { "id": 5, "judul": "Sistem Uji Coba Golang", "jenis": "penelitian", "status": "disetujui",
      "anggaran": "15000000.5", "luaran": null, "approvedAt": "2026-10-24T14:38:18.577Z",
      "periode": { "id": 5, "nama": "Penelitian Semester Ganjil 2025", "tahun": 2025, "jenis": "penelitian" } }
  ]
}
```

### 5.3 `GET /laporan/tugasan`

Query: `page` (default 1), `limit` (default 10).

```json
{
  "success": true,
  "message": "Tugasan review laporan fetched",
  "data": [
    {
      "id": 16,
      "laporanId": 25,
      "reviewerId": 4,
      "createdAt": "2026-10-24T14:44:04.680Z",
      "laporan": { "id": 25, "proposalId": 23, "judul": "Sistem Uji Coba Golang", "status": "review", "jenis": "penelitian",
                   "pengusul": { "id": 9, "name": "Dr. Dosen 1, M.T" } },
      "myReview": null
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1 }
}
```

`myReview` berisi review milik user (`id, laporanId, nilaiRelevansi, nilaiMetodologi,
nilaiAnggaran, nilaiLuaran, catatan, rekomendasi, isDone`), atau `null` jika belum ada.

### 5.4 `POST /laporan`

Body JSON:

| Field | Tipe | Wajib | Aturan |
|---|---|---|---|
| `proposalId` | int | ya | Proposal milik user, status `disetujui`, belum punya laporan |
| `judul` | string | | min 5 karakter (default: judul proposal) |
| `abstrak` | string | | min 20 karakter (default: abstrak proposal) |
| `luaranTercapai` | string | | |
| `ringkasanHasil` | string | | |
| `realisasiAnggaran` | number | | ≥ 0 |
| `dokumenUrl` | string (URL) | | `"URL dokumen tidak valid"` jika bukan URL |

```json
// request
{ "proposalId": 23, "ringkasanHasil": "Ringkas" }
```

Respons `201 "Laporan berhasil dibuat"`, `data` = objek Laporan (status `draft`).

Error: `404 "Proposal tidak ditemukan"` · `403 "Hanya pengusul proposal yang dapat membuat laporan"` ·
`400 "Laporan hanya bisa dibuat untuk proposal yang sudah disetujui"` ·
`409 "Proposal ini sudah memiliki laporan"` · 422 validasi.

### 5.5 `GET /laporan/:id`

`200 "Laporan fetched"`, `data` = objek Laporan + `anggota` + `reviews` (lihat bagian 4).
Error: 403, `404 "Laporan tidak ditemukan"`.

### 5.6 `PATCH /laporan/:id`

Body JSON berisi field yang mau diubah (semua opsional): `judul`, `abstrak`,
`luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `dokumenUrl` (aturan sama dengan
create). Hanya saat status `draft` atau `revisi`.

`200 "Laporan berhasil diperbarui"`, `data` = objek Laporan.
Error: `403` (bukan pengusul) · `400 "Laporan hanya bisa diubah saat status draft atau revisi"` · 422.

### 5.7 `POST /laporan/:id/dokumen`

`multipart/form-data` dengan field **`file`** (PDF/DOCX, maks 10 MB). Aturannya sama dengan
upload dokumen utama proposal. Hanya saat `draft`/`revisi`. Upload baru menggantikan file
lama dan mengosongkan `dokumenUrl`.

```json
{ "success": true, "message": "Dokumen laporan berhasil diunggah",
  "data": { "id": 25, "dokumenNama": "laporan akhir.pdf", "dokumenMime": "application/pdf", "dokumenUkuran": 125 } }
```

Error: `400 "File tidak ditemukan dalam request."` · `400 "Tidak dapat mendeteksi tipe file..."` ·
`500 "Hanya file PDF atau DOCX yang diizinkan."` (filter multipart, sama seperti endpoint lain) ·
400 status bukan draft/revisi · 403.

### 5.8 `GET /laporan/:id/dokumen`

Mengirim file asli (`Content-Type` sesuai file, `Content-Disposition: inline; filename="..."`).
Pakai `responseType: 'blob'` di axios. Error: `404 "Dokumen tidak ditemukan."`, 403.

### 5.9 `POST /laporan/:id/submit`

Tanpa body. Syarat:

- status `draft` atau `revisi`, kalau tidak → `400 "Hanya laporan berstatus draft atau revisi yang bisa diajukan"`
- `luaranTercapai` terisi, kalau tidak → `400 "Luaran tercapai wajib diisi sebelum laporan diajukan"`
- ada file atau `dokumenUrl`, kalau tidak → `400 "Dokumen laporan (file atau URL) wajib diunggah sebelum laporan diajukan"`

`200 "Laporan berhasil diajukan"`, status menjadi `diajukan`. Semua user `ketua_lppm`
mendapat notifikasi `laporan_diajukan`.

### 5.10 `DELETE /laporan/:id`

Pengusul (atau admin), hanya status `draft`. `200 "Laporan berhasil dihapus"` (tanpa `data`).
Error: `400 "Hanya laporan berstatus draft yang bisa dihapus"`.

### 5.11 `PATCH /laporan/:id/status` (ketua_lppm, admin)

```json
{ "status": "revisi", "catatanRevisi": "Lengkapi bukti luaran" }
```

| Field | Wajib | Nilai |
|---|---|---|
| `status` | ya | `review` \| `revisi` \| `disetujui` \| `ditolak` |
| `catatanRevisi` | | string |

- Laporan berstatus `draft` (belum diajukan) → `400 "Laporan belum diajukan"`.
- `catatanRevisi` **diganti** nilai yang dikirim. Kalau tidak dikirim atau status `review`,
  nilainya menjadi `null`.
- `disetujui` mengisi `approvedAt`.
- Pengusul mendapat notifikasi `laporan_revisi` / `laporan_disetujui` / `laporan_ditolak`
  (status `review` tidak mengirim notifikasi).

`200 "Status laporan diperbarui"`, `data` = objek Laporan.

### 5.12 `POST /laporan/:id/reviewers` (ketua_lppm, admin)

```json
{ "reviewerIds": [4, 7] }
```

- Laporan harus `diajukan` atau `review` → kalau tidak `400 "Laporan harus berstatus diajukan atau review untuk ditugaskan reviewer"`
- Semua id harus user `approved` → kalau tidak `400 "Reviewer tidak ditemukan atau belum disetujui"`
- Pengusul tidak boleh ditugaskan → `400 "Pengusul tidak dapat menjadi reviewer laporannya sendiri"`
- Reviewer yang sudah ditugaskan diabaikan (tidak error).
- Status laporan otomatis menjadi `review`. Reviewer mendapat notifikasi
  `reviewer_ditugaskan` (`refType: "laporan"`).

`200 "Reviewer laporan ditugaskan"`, `data` = objek Laporan (lihat `reviewerTugasan`).

### 5.13 `DELETE /laporan/:id/reviewers/:reviewerId` (ketua_lppm, admin)

`200 "Tugasan reviewer laporan dihapus"`. Error: `404 "Tugasan reviewer tidak ditemukan"`.

### 5.14 `GET /laporan/:id/reviews`

```json
{ "success": true, "message": "Review laporan fetched",
  "data": [ { "id": 10, "nilaiRelevansi": null, "nilaiMetodologi": null, "nilaiAnggaran": null, "nilaiLuaran": "85",
              "catatan": "Luaran sesuai", "rekomendasi": "disetujui", "isDone": true,
              "reviewer": { "id": 4, "name": "Dr. Reviewer 1, M.T", "fullName": "Dr. Reviewer 1, M.T" },
              "createdAt": "...", "updatedAt": "..." } ] }
```

### 5.15 `POST /laporan/:id/reviews` (reviewer yang ditugaskan)

Body sama dengan review proposal (semua opsional):

| Field | Tipe |
|---|---|
| `nilaiRelevansi`, `nilaiMetodologi`, `nilaiAnggaran`, `nilaiLuaran` | string (teks bebas, mis. `"85"`) |
| `catatan` | string |
| `rekomendasi` | `disetujui` \| `revisi` \| `ditolak` |

- Hanya saat laporan berstatus `review` → kalau tidak `400 "Laporan tidak sedang dalam tahap review"`
- Bukan reviewer yang ditugaskan → `403 "Anda tidak ditugaskan untuk mereview laporan ini"`
- Menyimpan ulang mereset `isDone` menjadi `false`.

```json
{ "success": true, "message": "Review laporan disimpan",
  "data": { "id": 10, "proposalId": 25, "reviewerId": 4, "nilaiRelevansi": null, "nilaiMetodologi": null,
            "nilaiAnggaran": null, "nilaiLuaran": "85", "catatan": "Luaran sesuai", "rekomendasi": "disetujui",
            "isDone": false, "createdAt": "...", "updatedAt": "..." } }
```

> Di objek review ini `proposalId` berisi **id laporan** (tabel review dipakai bersama).

### 5.16 `POST /laporan/:id/reviews/finalize` (reviewer yang ditugaskan)

Tanpa body. Review harus sudah disimpan → kalau belum `400 "Simpan review terlebih dahulu sebelum finalisasi"`.
`200 "Review laporan diselesaikan"`, `isDone: true`. Pengusul mendapat notifikasi
`review_selesai` (`refType: "laporan"`).

---

## 6. Notifikasi

Notifikasi laporan muncul di `GET /notifications` seperti biasa:

| `type` | Penerima | `refType` | `refId` |
|---|---|---|---|
| `laporan_diajukan` | semua ketua_lppm | `laporan` | id laporan |
| `reviewer_ditugaskan` | reviewer | `laporan` | id laporan |
| `review_selesai` | pengusul | `laporan` | id laporan |
| `laporan_revisi` / `laporan_disetujui` / `laporan_ditolak` | pengusul | `laporan` | id laporan |

Untuk navigasi dari notifikasi: `refType === "laporan"` → buka detail `GET /laporan/:refId`.
`refType === "proposal"` tetap ke detail proposal seperti sebelumnya.

## 7. Log aktivitas

Aksi laporan dicatat dengan `action` berawalan `laporan_kegiatan.` (`create`, `update`,
`submit`, `delete`, `dokumen.upload`, `status.<status>`, `reviewer.tugaskan`,
`reviewer.hapus`, `review.submit`, `review.finalize`), `entityType: "laporan"`,
`entityId` = id laporan, dan `proposalId` = id proposal asal. Jadi field `proposal` di
activity log berisi proposal asalnya.

## 8. Contoh pemanggilan (axios)

```js
// src/api/laporan.js (contoh)
import api from './axios';

export const laporanApi = {
  list:        (params) => api.get('/laporan', { params }),
  my:          (params) => api.get('/laporan/my', { params }),
  eligible:    () => api.get('/laporan/eligible'),
  tugasan:     (params) => api.get('/laporan/tugasan', { params }),
  create:      (data) => api.post('/laporan', data),
  detail:      (id) => api.get(`/laporan/${id}`),
  update:      (id, data) => api.patch(`/laporan/${id}`, data),
  submit:      (id) => api.post(`/laporan/${id}/submit`),
  remove:      (id) => api.delete(`/laporan/${id}`),
  uploadDokumen: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/laporan/${id}/dokumen`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  downloadDokumen: (id) => api.get(`/laporan/${id}/dokumen`, { responseType: 'blob' }),
  updateStatus: (id, data) => api.patch(`/laporan/${id}/status`, data),
  assignReviewers: (id, reviewerIds) => api.post(`/laporan/${id}/reviewers`, { reviewerIds }),
  removeReviewer: (id, reviewerId) => api.delete(`/laporan/${id}/reviewers/${reviewerId}`),
  reviews:      (id) => api.get(`/laporan/${id}/reviews`),
  saveReview:   (id, data) => api.post(`/laporan/${id}/reviews`, data),
  finalizeReview: (id) => api.post(`/laporan/${id}/reviews/finalize`),
};
```

---

## 9. Catatan database (untuk referensi)

- `Kegiatan` (`id`, `jenis`, `tipe`, `createdAt`): registri id global untuk proposal & laporan.
- `Penelitian` / `Pengabdian`: kolom identik. Kolom proposal lama (tanpa `jenis`) ditambah
  `tipe ENUM('proposal','laporan')`, `proposalId` (laporan → proposal asal, unik),
  `luaran`, `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran DECIMAL(15,2)`.
- VIEW `Proposal` (baris tipe proposal dari kedua tabel) dan VIEW `Laporan` (baris tipe
  laporan), hanya untuk baca.
- Tabel relasi (`ProposalAnggota`, `ReviewerTugasan`, `ProposalReview`, `LaporanProposal`,
  `DokumenLampiran`, `LaporanHarian`, `ActivityLog`) tetap memakai `proposalId`, kini ber-FK ke
  `Kegiatan.id`.
- Data proposal lama dipindah apa adanya (id sama) dengan `tipe = 'proposal'`.

---

## 10. Grup A waiting API

Semua endpoint di bagian ini butuh Bearer token, **kecuali** `GET /program-studi` (publik).
Validasi query/body yang salah → 422 `{"success":false,"message":"Validation error","errors":{...}}`.

| ID | Elemen UI | API |
|---|---|---|
| W-08 | Field profil (NIDN, NIM, prodi, institusi, kontak, no. HP, alamat, TTL) | **`GET /auth/me`** kini ikut mengirim field profil. Ada juga `GET /users/profile/me` |
| W-09 | Jabatan fungsional | Field `jabatanFungsional` di `/auth/me` & profil; diubah lewat `PATCH /users/profile/me` |
| W-11 | Jumlah status `review` | Key `review` di `GET /dosen/proposals/stats` |
| W-17 | Statistik per jenis | `GET /dosen/proposals/stats?jenis=penelitian\|pengabdian` |
| W-16 | Kegiatan sebagai anggota tim | `GET /dosen/proposals/as-member` |
| W-14 | Skema penelitian | Field `skema` di proposal (khusus penelitian) |
| W-15 | Mitra pengabdian | Field `mitra` di proposal (khusus pengabdian) |
| W-19 | Dropdown program studi | `GET /program-studi` (+ CRUD admin) |

### 10.1 Profil milik sendiri (W-08, W-09)

**`GET /auth/me`**: field lama tetap di tempatnya. Field profil ditambahkan **setelah**
`hasTugasan`, jadi `authStore.user` langsung berisi data profil tanpa perlu memanggil
endpoint lain.

```json
{
  "success": true,
  "message": "Current user",
  "data": {
    "id": 9, "name": "Dr. Dosen 1, M.T", "fullName": "Dr. Dosen 1, M.T", "email": "dosen1@lppm.dev",
    "status": "approved", "roles": ["dosen", "reviewer"], "hasTugasan": false,
    "nidn": "0100000001", "nim": null, "prodi": null, "programStudi": "Teknik Informatika",
    "institusi": "Universitas LPPM", "kontak": "081200000001", "noHp": null,
    "alamat": "Jl. Akademik No. 3, Medan", "tempatLahir": null, "tanggalLahir": null,
    "jabatanFungsional": "Lektor"
  }
}
```

> Respons **login** (`POST /auth/login` → `data.user`) tidak berubah. Field profil baru ada
> setelah `fetchMe()`.

**`GET /users/profile/me`** (login, semua role): bentuknya sama dengan respons
`PATCH /users/profile/me`. Pakai ini kalau butuh `createdAt`/`roles` gaya Prisma.

```json
{
  "success": true,
  "message": "Profile fetched",
  "data": {
    "id": 9, "email": "dosen1@lppm.dev", "name": "Dr. Dosen 1, M.T", "fullName": "Dr. Dosen 1, M.T",
    "status": "approved", "nidn": "0100000001", "nim": null, "prodi": null, "programStudi": "Teknik Informatika",
    "institusi": "Universitas LPPM", "kontak": "081200000001", "noHp": null, "alamat": "Jl. Akademik No. 3, Medan",
    "tempatLahir": null, "tanggalLahir": null, "jabatanFungsional": "Lektor",
    "createdAt": "2026-10-24T14:33:43.234Z",
    "roles": [{ "role": { "name": "dosen" } }, { "role": { "name": "reviewer" } }]
  }
}
```

**`PATCH /users/profile/me`** sekarang juga menerima `jabatanFungsional` (string, mis.
`"Asisten Ahli"`, `"Lektor"`, `"Lektor Kepala"`, `"Guru Besar"`; teks bebas). Responsnya
mendapat key `jabatanFungsional` (sebelum `createdAt`).

`tanggalLahir` dikirim sebagai string ISO (`"1990-05-17T00:00:00.000Z"`) atau `null`.

### 10.2 Statistik proposal dosen (W-11, W-17)

**`GET /dosen/proposals/stats[?jenis=penelitian|pengabdian]`** (dosen, mahasiswa)

```json
{ "success": true, "message": "Stats fetched",
  "data": { "total": 11, "draft": 0, "diajukan": 0, "disetujui": 11, "revisi": 0, "ditolak": 0, "review": 0 } }
```

- Key **`review`** baru, ditaruh di akhir. Sekarang `total` = jumlah semua key status, jadi
  frontend tidak perlu lagi menghitung selisih.
- `jenis` opsional. Tanpa `jenis`, semua proposal dihitung. Nilai lain → 422.
- Yang dihitung hanya proposal milik user (sebagai pengusul), bukan laporan.
- Satu panggilan ini bisa menggantikan 6 panggilan `GET /dosen/proposals?jenis=…&status=…&limit=1`
  di halaman Kegiatan.

### 10.3 Proposal sebagai anggota tim (W-16)

**`GET /dosen/proposals/as-member`** (dosen, mahasiswa)

Daftar proposal milik **user lain** di mana user ini anggota dengan undangan `diterima`.
Query dan bentuk item **sama persis** dengan `GET /dosen/proposals`:

| Param | Default | Keterangan |
|---|---|---|
| `page` | 1 | int > 0 |
| `limit` | 10 | int > 0 |
| `jenis` | | `penelitian` \| `pengabdian` |
| `status` | | status proposal |
| `search` | | cari di judul/abstrak |

```json
{
  "success": true,
  "message": "Proposals as member fetched",
  "data": [
    {
      "id": 48, "tipe": "proposal", "judul": "Sistem Uji Coba Golang", "abstrak": "...", "jenis": "penelitian",
      "status": "disetujui", "anggaran": "15000000.5", "luaran": null, "skema": null, "mitra": null,
      "catatanRevisi": null, "dokumenUrl": null, "submittedAt": "...", "approvedAt": "...", "createdAt": "...", "updatedAt": "...",
      "pengusul": { "id": 9, "name": "Dr. Dosen 1, M.T", "fullName": "Dr. Dosen 1, M.T", "email": "dosen1@lppm.dev", "nidn": "0100000001", "programStudi": "Teknik Informatika" },
      "periode": { "id": 5, "nama": "Penelitian Semester Ganjil 2025", "tahun": 2025, "jenis": "penelitian" },
      "anggota": [ { "id": 56, "peran": "anggota", "statusUndangan": "diterima", "user": { "id": 21, "name": "Mahasiswa 1", "fullName": "Mahasiswa 1", "email": "mahasiswa1@lppm.dev" } } ],
      "reviewerTugasan": [ { "id": 29, "reviewer": { "id": 4, "name": "Dr. Reviewer 1, M.T", "fullName": "Dr. Reviewer 1, M.T" }, "createdAt": "..." } ]
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1 }
}
```

> **Detail untuk anggota:** `GET /dosen/proposals/:id` hanya untuk pengusul (anggota akan
> mendapat `500 "Anda tidak memiliki akses ke proposal ini"`). Untuk tombol Detail di daftar
> "sebagai anggota", pakai **`GET /proposals/:id`**, yang mengizinkan anggota berundangan
> `diterima`.

### 10.4 Skema penelitian (W-14) & mitra pengabdian (W-15)

Field opsional baru (string) di `POST/PATCH /proposals` dan `POST/PATCH /dosen/proposals`:

| Field | Untuk jenis | Contoh |
|---|---|---|
| `skema` | **penelitian** saja | `"Penelitian Dosen Pemula"`, `"Penelitian Dasar"` |
| `mitra` | **pengabdian** saja | `"Kelompok Tani Desa Sukamaju"` |

- Mengirim field ke jenis yang salah → `400 "Skema hanya untuk proposal penelitian"` /
  `400 "Mitra hanya untuk proposal pengabdian"`. Saat PATCH mengubah `jenis`, yang dicek
  adalah jenis **baru**.
- Respons proposal selalu punya kedua key. Key yang bukan milik jenisnya bernilai `null`.
- Jika `jenis` proposal diubah, nilai `skema`/`mitra` milik jenis lama **dihapus**.
- Laporan menyalin `skema`/`mitra` dari proposal asal.

### 10.5 Master program studi (W-19)

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/program-studi` | **publik** (tanpa token) | Program studi aktif, urut nama. `?semua=true` → termasuk nonaktif |
| POST | `/program-studi` | admin | Tambah |
| PATCH | `/program-studi/:id` | admin | Ubah (semua field opsional) |
| DELETE | `/program-studi/:id` | admin | Hapus |

```json
{ "success": true, "message": "Program studi fetched",
  "data": [ { "id": 5, "nama": "Teknik Informatika", "jenjang": null, "isAktif": true,
              "createdAt": "2026-10-24T15:14:25.096Z", "updatedAt": "2026-10-24T15:14:25.096Z" } ] }
```

Body POST/PATCH:

| Field | Tipe | Aturan |
|---|---|---|
| `nama` | string | wajib saat POST, di-trim, min 2 karakter, **unik** |
| `jenjang` | string | opsional, mis. `"S1"`, `"D3"`. `""` → `null` |
| `isAktif` | boolean | opsional, default `true` |

Respons: POST `201 "Program studi berhasil dibuat"`, PATCH `200 "Program studi berhasil diperbarui"`,
DELETE `200 "Program studi berhasil dihapus"`. Error: nama duplikat `409 "Resource already exists"`,
id tidak ada `404 "Program studi tidak ditemukan"`, id bukan angka `400 "Parameter id tidak valid."`,
bukan admin `403`.

Catatan:
- `programStudi` (dosen) dan `prodi` (mahasiswa) di profil **tetap teks bebas**. Backend tidak
  memaksa nilainya ada di master. Frontend cukup mengisi dropdown dengan `nama`, lalu
  mengirim `nama` itu ke `PATCH /users/profile/me` atau ke form registrasi.
- Isi awal tabel diambil dari nilai program studi user yang sudah ada (dan dari `cmd/seed`).

### 10.6 Contoh pemanggilan (axios)

```js
// tambahan di src/api/users.js
getProfile: () => api.get('/users/profile/me'),

// src/api/Proposaldosen.js: getStats yang sudah ada cukup diberi params
getStats: (params = {}) => api.get('/dosen/proposals/stats', { params }),      // { jenis }
getAsMember: (params = {}) => api.get('/dosen/proposals/as-member', { params }),

// src/api/programStudi.js (baru)
export const programStudiApi = {
  list:   (params = {}) => api.get('/program-studi', { params }),   // { semua: true } untuk admin
  create: (data) => api.post('/program-studi', data),
  update: (id, data) => api.patch(`/program-studi/${id}`, data),
  remove: (id) => api.delete(`/program-studi/${id}`),
};
```

---

## 11. Grup B waiting API

| ID | Elemen UI | API |
|---|---|---|
| W-03 / W-13 | Tahapan pada Usulan Terakhir & kolom Tahapan di Kegiatan | Field `tahapan` di **semua** respons proposal |
| W-04 | Nilai SINTA | Field `sintaId`, `sintaScore` di `/auth/me` & profil; diisi dosen lewat `PATCH /users/profile/me` |
| W-07 / W-10 | Foto profil (dashboard, Pengaturan, header) | `POST/DELETE /users/profile/foto`, gambar di `GET /users/:id/foto`, field `fotoUrl` |
| W-20 | Zona Berbahaya: Unduh data akun | `GET /users/profile/export` (file JSON) |
| W-21 | Zona Berbahaya: Hapus akun ini | `DELETE /users/profile/me` (konfirmasi password) |

### 11.1 Tahapan kegiatan (W-03, W-13)

Setiap objek proposal (list, detail, create/update/submit/status, `/dosen/proposals`,
`/dosen/proposals/as-member`, `/proposals`, `/proposals/my`) kini punya field `tahapan`
setelah `updatedAt`:

```json
"tahapan": { "kode": "seleksi_lanjutan", "label": "Seleksi/Lanjutan", "urutan": 3 }
```

Tahapan **dihitung otomatis** dari status proposal dan status laporannya (fitur `/laporan`):

| urutan | kode | label | Kondisi |
|---|---|---|---|
| 1 | `seleksi_usulan` | Seleksi/Usulan | proposal belum `disetujui` (draft, diajukan, review, revisi, ditolak) |
| 2 | `pelaksanaan` | Pelaksanaan Kegiatan | proposal `disetujui`; laporan belum dibuat atau masih `draft` |
| 3 | `seleksi_lanjutan` | Seleksi/Lanjutan | laporan `diajukan`, `review`, `revisi`, atau `ditolak` |
| 4 | `pasca_pelaksanaan` | Pasca Pelaksanaan | laporan `disetujui` |

- Untuk progress bar, pakai `urutan` (1–4). Untuk teks, pakai `label`.
- Proposal `ditolak` tetap di tahap 1. Bedakan lewat field `status`.
- Perkiraan lama di frontend (dari laporan kemajuan/akhir) bisa dihapus.
- Field ini tidak bisa diubah langsung, karena hanya hasil perhitungan.

### 11.2 Nilai SINTA (W-04)

Field baru di `GET /auth/me`, `GET/PATCH /users/profile/me`:

| Field | Tipe | Keterangan |
|---|---|---|
| `sintaId` | string \| null | ID author SINTA |
| `sintaScore` | integer \| null | Skor SINTA, ≥ 0 |

Diisi oleh dosen sendiri lewat `PATCH /users/profile/me`:

```json
{ "sintaId": "6012345", "sintaScore": 245 }
```

- `sintaScore` boleh angka (`245`), string angka (`"245"`), atau `null`/`""` untuk mengosongkan.
- Nilai negatif, desimal, atau bukan angka → `400 "sintaScore harus bilangan bulat 0 atau lebih"`.

### 11.3 Foto profil (W-07, W-10)

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/users/profile/foto` | login | Unggah/ganti foto sendiri (multipart, field **`file`**) |
| DELETE | `/users/profile/foto` | login | Hapus foto sendiri |
| GET | `/users/:id/foto` | **publik** | Mengirim gambar (bisa langsung dipakai di `<img>`) |

Aturan unggah: **JPG, PNG, atau WebP**, maks **2 MB**, isi file dicek (magic bytes).

```json
// POST /users/profile/foto → 200
{ "success": true, "message": "Foto profil berhasil diperbarui",
  "data": { "fotoUrl": "/users/9/foto?v=1793027045123", "fotoMime": "image/png", "fotoUkuran": 48213 } }
```

Error:

| Status | message |
|---|---|
| 400 | `"File foto tidak ditemukan dalam request."` |
| 400 | `"Foto harus berformat JPG, PNG, atau WebP."` (berdasarkan Content-Type file) |
| 400 | `"Isi file bukan gambar JPG, PNG, atau WebP yang valid."` (berdasarkan isi file) |
| 400 | `"Ukuran foto maksimal 2 MB."` |
| 404 | `"Foto profil belum ada"` (DELETE tanpa foto) · `"Foto tidak ditemukan"` (GET) |

**`fotoUrl`** ada di `GET /auth/me` (di akhir) dan di `GET/PATCH /users/profile/me` (sebelum
`createdAt`). Nilainya `null` kalau belum ada foto. URL ini **relatif terhadap base URL API**:

```jsx
import { API_BASE_URL } from '../api/axios';
// user.fotoUrl = "/users/9/foto?v=1793027045123"
{user.fotoUrl
  ? <img src={`${API_BASE_URL}${user.fotoUrl}`} alt="" className="h-10 w-10 rounded-full object-cover" />
  : <Inisial nama={user.name} />}
```

- Parameter `v` berubah setiap foto diganti, jadi browser boleh menyimpan cache gambar. Setelah
  upload atau hapus, panggil `fetchMe()` agar `fotoUrl` ikut diperbarui.
- `GET /users/:id/foto` **tidak butuh token**, supaya bisa dipakai langsung di `<img>`. Siapa pun
  yang tahu id user bisa melihat fotonya.

### 11.4 Unduh data akun (W-20)

**`GET /users/profile/export`** (login) mengirim **file JSON**
(`Content-Disposition: attachment; filename="data-akun-<id>.json"`). Respons ini **tanpa**
envelope `{success, message, data}`:

```jsonc
{
  "exportedAt": "2026-10-24T15:40:00.000Z",
  "profil": { /* sama dengan GET /users/profile/me */ },
  "proposal": [ /* proposal sebagai pengusul */ ],
  "laporan": [ /* laporan sebagai pengusul */ ],
  "keanggotaan": [ /* undangan/keanggotaan tim + judul proposal */ ],
  "laporanHarian": [ /* laporan harian (mahasiswa) */ ],
  "review": [ /* review yang ditulis user sebagai reviewer */ ],
  "notifikasi": [ /* semua notifikasi */ ],
  "aktivitas": [ /* log aktivitas user */ ]
}
```

Isi file dokumen (PDF/DOCX/foto) **tidak** ikut, hanya metadatanya (nama, mime, ukuran).

```js
const res = await api.get('/users/profile/export', { responseType: 'blob' });
const url = URL.createObjectURL(res.data);
const a = Object.assign(document.createElement('a'), { href: url, download: `data-akun-${user.id}.json` });
a.click(); URL.revokeObjectURL(url);
```

### 11.5 Hapus akun sendiri (W-21)

**`DELETE /users/profile/me`** (login), body JSON:

```json
{ "password": "password-saat-ini" }
```

| Status | message |
|---|---|
| 200 | `"Akun berhasil dihapus"` (tanpa `data`) |
| 422 | password kosong/tidak dikirim (`errors.password`) |
| 400 | `"Password salah"` |
| 400 | `"Akun admin terakhir tidak dapat dihapus"` |

Yang terjadi saat akun dihapus. Akun **dinonaktifkan dan dianonimkan**, bukan dihapus fisik, supaya
arsip LPPM tetap utuh:

- status menjadi `rejected` sehingga tidak bisa login lagi (login → `500 "Invalid credentials"`);
- semua refresh token dicabut;
- nama menjadi `"Pengguna Dihapus"`, email menjadi `deleted-<id>@deleted.invalid`, semua field profil
  (NIDN/NIM, kontak, alamat, TTL, prodi, jabatan, SINTA) dikosongkan, dan foto dihapus;
- undangan tim yang belum dijawab otomatis menjadi `ditolak`;
- proposal, laporan, review, dan riwayat **tetap ada** (pengusulnya tampil sebagai "Pengguna Dihapus").

Access token yang sedang dipakai masih berlaku sampai kedaluwarsa (maks 15 menit). Jadi setelah
respons 200, **frontend wajib langsung logout** (hapus token dan arahkan ke `/login`).

### 11.6 Contoh pemanggilan (axios)

```js
// tambahan di src/api/users.js
uploadFoto: (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post('/users/profile/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
},
deleteFoto: () => api.delete('/users/profile/foto'),
exportAccount: () => api.get('/users/profile/export', { responseType: 'blob' }),
deleteAccount: (password) => api.delete('/users/profile/me', { data: { password } }),
```

---

## 12. Grup C waiting API

| ID | Elemen UI | API |
|---|---|---|
| W-01 | Kartu Luaran Dapat Diklaim | `GET /luaran/stats` → `dapatDiklaim` |
| W-02 | Jurnal / Jurnal Diterbitkan | `GET /luaran/stats` → `jurnal` |
| W-12 | Luaran tercatat & daftar luaran per kegiatan | `GET /luaran/stats` → `total`; `GET /luaran/proposal/:proposalId` |
| W-06 | Nilai Kepercayaan | `GET /dosen/kepercayaan` |
| W-18 | Status & kirim ulang verifikasi email | `emailVerifiedAt` di `/auth/me`; `POST /auth/verify-email/resend`; `POST /auth/verify-email` |

> **Bukan** halaman menu `/luaran` (pencairan dana). Halaman itu tetap 501 sampai ada keputusan
> kampus. "Luaran" di sini = **output kegiatan yang dijanjikan di proposal**.

### 12.1 Luaran kegiatan (W-01, W-02, W-12)

Satu proposal punya **banyak item luaran**. Siklus hidupnya:

1. **Target**: pengusul menambah, mengubah, atau menghapus item saat proposal `draft`/`revisi`
   (bisa dimasukkan ke wizard Usulan setelah proposal tersimpan sebagai draft).
2. **Capaian**: setelah proposal `disetujui`, pengusul mengisi capaian tiap item (tercapai/belum,
   judul, keterangan, link/file bukti). Ini dilakukan **selama laporan belum diajukan** (laporan
   belum ada, `draft`, atau `revisi`), cocok diletakkan di halaman penyusunan laporan.
3. **Klaim**: item `tercapai` yang laporannya sudah `disetujui` ketua dihitung sebagai
   **dapat diklaim**.

Item luaran selalu dikaitkan ke **id proposal**, bukan id laporan. Field teks lama `luaran` dan
`luaranTercapai` tetap ada sebagai catatan bebas.

**Objek Luaran**

```json
{
  "id": 7, "proposalId": 52, "jenis": "jurnal", "target": "Jurnal SINTA 3",
  "targetTanggal": "2099-12-31T00:00:00.000Z",
  "status": "tercapai", "judulCapaian": "Artikel di Jurnal X", "keterangan": null,
  "tercapaiAt": "2026-10-24T15:47:20.120Z",
  "buktiUrl": "https://jurnal.example/artikel/1", "buktiNama": "bukti.pdf", "buktiMime": "application/pdf", "buktiUkuran": 125,
  "createdAt": "...", "updatedAt": "...",
  "tepatWaktu": true
}
```

| Field | Keterangan |
|---|---|
| `jenis` | `jurnal` \| `prosiding` \| `hki` \| `buku` \| `produk` \| `media_massa` \| `lainnya` |
| `target` | Deskripsi target, min 3 karakter (mis. "Jurnal SINTA 3", "HKI hak cipta") |
| `targetTanggal` | Tanggal target (opsional). Dipakai untuk ketepatan waktu |
| `status` | `belum` (default) \| `tercapai` |
| `tercapaiAt` | Tanggal tercapai. Otomatis diisi hari ini saat ditandai `tercapai` kalau tidak dikirim, dan dikosongkan saat kembali ke `belum` |
| `tepatWaktu` | `true`/`false` jika tercapai dan punya `targetTanggal` (tercapai ≤ akhir hari target); `null` jika belum bisa dinilai |
| `bukti*` | File bukti (unduh lewat `GET /luaran/:id/bukti`) dan/atau `buktiUrl` |

**Endpoint**

| Method | Path | Akses | Kapan boleh |
|---|---|---|---|
| GET | `/luaran/proposal/:proposalId` | yang boleh membaca proposal (pengusul, anggota diterima, reviewer, admin, ketua) | kapan saja |
| POST | `/luaran` | pengusul (dosen/mahasiswa) | proposal `draft`/`revisi` |
| PATCH | `/luaran/:id` | pengusul | proposal `draft`/`revisi` |
| DELETE | `/luaran/:id` | pengusul | proposal `draft`/`revisi` |
| PATCH | `/luaran/:id/capaian` | pengusul | proposal `disetujui` dan laporan belum diajukan |
| POST | `/luaran/:id/bukti` | pengusul | sama dengan capaian |
| GET | `/luaran/:id/bukti` | yang boleh membaca proposal | kapan saja |
| GET | `/luaran/stats` | dosen, mahasiswa | ringkasan luaran milik sendiri |

Body:

```jsonc
// POST /luaran → 201 "Luaran berhasil ditambahkan"
{ "proposalId": 52, "jenis": "jurnal", "target": "Jurnal SINTA 3", "targetTanggal": "2027-06-30" }

// PATCH /luaran/:id → 200 "Luaran berhasil diperbarui" (semua opsional; targetTanggal: null = kosongkan)
{ "target": "Jurnal SINTA 2", "targetTanggal": null }

// PATCH /luaran/:id/capaian → 200 "Capaian luaran berhasil disimpan" (semua opsional, null = kosongkan)
{ "status": "tercapai", "judulCapaian": "Artikel di Jurnal X", "keterangan": "Vol 3 No 2",
  "tercapaiAt": "2027-05-10", "buktiUrl": "https://jurnal.example/artikel/1" }
```

Tanggal boleh `"YYYY-MM-DD"` atau ISO lengkap. `POST /luaran/:id/bukti` memakai multipart field
**`file`**: PDF, DOCX, JPG, PNG, atau WebP, maks 10 MB. Responsnya objek Luaran.

Error umum: `403 "Hanya pengusul proposal yang dapat mengubah luaran"` ·
`404 "Luaran tidak ditemukan"` / `"Proposal tidak ditemukan"` ·
`400 "Target luaran hanya bisa diubah saat proposal berstatus draft atau revisi"` ·
`400 "Capaian luaran hanya bisa diisi setelah proposal disetujui"` ·
`400 "Capaian luaran tidak bisa diubah karena laporan sudah diajukan"` ·
`400 "Bukti harus berupa PDF, DOCX, JPG, PNG, atau WebP."` / `"Isi file bukti bukan ..."` ·
422 validasi (mis. `jenis` tidak dikenal, `buktiUrl` bukan URL).

**`GET /luaran/stats`**: hanya proposal di mana user menjadi pengusul.

```json
{ "success": true, "message": "Statistik luaran fetched",
  "data": { "total": 3, "tercapai": 3, "dapatDiklaim": 3, "jurnal": 3,
            "perJenis": { "jurnal": 3, "prosiding": 0, "hki": 0, "buku": 0, "produk": 0, "media_massa": 0, "lainnya": 0 } } }
```

| Key | Arti |
|---|---|
| `total` | semua item luaran (W-12 "Luaran tercatat") |
| `tercapai` | item berstatus tercapai |
| `dapatDiklaim` | tercapai **dan** laporan proposalnya sudah disetujui (W-01) |
| `jurnal` | `dapatDiklaim` yang jenisnya jurnal (W-02 "Jurnal Diterbitkan") |
| `perJenis` | jumlah semua item per jenis |

### 12.2 Nilai kepercayaan (W-06)

**`GET /dosen/kepercayaan`**: dosen/mahasiswa melihat nilainya sendiri. Admin/ketua boleh
`?userId=<id>` untuk melihat user lain (selain itu `403`). User yang hanya berperan reviewer
mendapat `403`.

```json
{
  "success": true, "message": "Nilai kepercayaan fetched",
  "data": {
    "userId": 13, "nilai": 4.4, "skala": 5,
    "komponen": [
      { "kode": "persetujuan_proposal", "label": "Persetujuan proposal", "bobot": 0.25, "nilai": 1, "pembilang": 3, "penyebut": 3, "keterangan": "..." },
      { "kode": "persetujuan_laporan", "label": "Persetujuan laporan", "bobot": 0.25, "nilai": 1, "pembilang": 3, "penyebut": 3, "keterangan": "..." },
      { "kode": "rekomendasi_reviewer", "label": "Rekomendasi reviewer", "bobot": 0.25, "nilai": 0.5, "pembilang": 1.5, "penyebut": 3, "keterangan": "..." },
      { "kode": "ketepatan_waktu", "label": "Ketepatan waktu luaran", "bobot": 0.25, "nilai": 1, "pembilang": 3, "penyebut": 3, "keterangan": "..." }
    ],
    "dihitungPada": "2026-10-24T15:48:24.680Z"
  }
}
```

Rumus (semua komponen bernilai 0–1, bobot sama):

| Komponen | Rumus |
|---|---|
| Persetujuan proposal | proposal `disetujui` ÷ proposal yang sudah diputuskan (`disetujui` + `ditolak`) |
| Persetujuan laporan | laporan `disetujui` ÷ proposal `disetujui` yang **periodenya sudah selesai** atau laporannya sudah diputuskan (proposal yang masih berjalan tidak menurunkan nilai) |
| Rekomendasi reviewer | rata-rata review final atas proposal & laporan milik user: `disetujui` = 1, `revisi` = 0,5, `ditolak` = 0 |
| Ketepatan waktu luaran | luaran tercapai ≤ tanggal target ÷ luaran bertanggal target yang sudah tercapai **atau** targetnya sudah lewat |

**`nilai` = 5 × rata-rata komponen yang punya data**, dibulatkan 1 desimal. Komponen dengan
`penyebut = 0` bernilai `null` dan tidak ikut dihitung. Kalau semua komponen `null` (dosen baru),
`nilai` juga `null`, dan frontend sebaiknya menampilkan "—" atau "Belum ada data". Tampilan
yang disarankan: `${nilai.toFixed(1)}/${skala}.0`.

### 12.3 Verifikasi email (W-18)

Verifikasi email ini **opsional**: login tetap bisa walau email belum terverifikasi.

- `emailVerifiedAt` (tanggal atau `null`) ada di **`GET /auth/me`** (key terakhir) dan
  `GET/PATCH /users/profile/me` (sebelum `createdAt`). Banner "Akun email anda belum
  diverifikasi" ditampilkan jika nilainya `null`.
- User lama dan akun seed dianggap sudah terverifikasi. User yang mendaftar setelah migrasi
  mulai dengan `null`.

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/auth/verify-email/resend` | login | Kirim (ulang) email berisi link verifikasi |
| POST | `/auth/verify-email` | **publik** | Konfirmasi token dari link |

```jsonc
// POST /auth/verify-email/resend (tanpa body)
// 200 { "success": true, "message": "Email verifikasi telah dikirim ke user@contoh.ac.id" }
// 400 "Email sudah terverifikasi" · 502 "Gagal mengirim email verifikasi. Coba lagi nanti." · 429 rate limit (10/15 menit)

// POST /auth/verify-email
{ "token": "<token dari link>" }
// 200 "Email berhasil diverifikasi" · 400 "Token verifikasi tidak valid atau kedaluwarsa" · 422 token kosong
```

- Link di email berbentuk **`${FRONTEND_URL}/verify-email?token=...`** dan berlaku **24 jam**.
  Meminta ulang membatalkan link sebelumnya. Frontend perlu halaman `/verify-email` yang
  membaca `token` dari query lalu memanggil `POST /auth/verify-email`. Halaman ini sebaiknya
  bisa dibuka tanpa login, lalu memanggil `fetchMe()` kalau user sedang login.
- Pengembangan lokal: kalau `SMTP_HOST` kosong dan `NODE_ENV` bukan production, email tidak
  dikirim. Link-nya dicetak di log server (`[dev] SMTP_HOST kosong ...`).

### 12.4 Contoh pemanggilan (axios)

```js
// src/api/luaran.js (baru)
export const luaranApi = {
  byProposal: (proposalId) => api.get(`/luaran/proposal/${proposalId}`),
  create: (data) => api.post('/luaran', data),
  update: (id, data) => api.patch(`/luaran/${id}`, data),
  remove: (id) => api.delete(`/luaran/${id}`),
  saveCapaian: (id, data) => api.patch(`/luaran/${id}/capaian`, data),
  uploadBukti: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/luaran/${id}/bukti`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  downloadBukti: (id) => api.get(`/luaran/${id}/bukti`, { responseType: 'blob' }),
  stats: () => api.get('/luaran/stats'),
};

// tambahan di modul dosen/user
getKepercayaan: (params = {}) => api.get('/dosen/kepercayaan', { params }),   // { userId } untuk admin/ketua

// tambahan di src/api/auth.js
resendVerification: () => api.post('/auth/verify-email/resend'),
verifyEmail: (token) => api.post('/auth/verify-email', { token }),
```

---

## 13. W-22 sampai W-25

| ID | Elemen UI | API |
|---|---|---|
| W-22 | Rumpun Ilmu & Bidang (wizard Usulan: Identitas & Preview) | Field `rumpunIlmu`, `bidang` di proposal + `GET /master/rumpun-ilmu`, `GET /master/bidang?jenis=` |
| W-23 | Kolom Kontak di tabel Anggota | `kontak`, `noHp` di `GET /users/search`, `GET /dosen/proposals/members/search`, dan `anggota[].user` |
| W-24 | Kata Kunci (wizard: Dokumen & Preview) | Field `kataKunci` (array string) di proposal |
| W-25 | Daftar pilihan Luaran Tambahan | `GET /master/luaran?jenis=` |

### 13.1 Field baru di proposal (W-22, W-24)

Berlaku untuk `POST/PATCH /proposals` dan `POST/PATCH /dosen/proposals` (semua opsional). Field
ini juga muncul di semua respons proposal (setelah `mitra`) dan di objek laporan (disalin dari
proposal saat laporan dibuat).

| Field | Tipe | Aturan |
|---|---|---|
| `rumpunIlmu` | string | Teks bebas. Disarankan `nama` dari `GET /master/rumpun-ilmu` |
| `bidang` | string | Teks bebas. Disarankan `nama` dari `GET /master/bidang?jenis=<jenis proposal>` |
| `kataKunci` | string[] | Maks **10**, tiap kata kunci maks **50** karakter. Spasi di awal/akhir dipangkas, item kosong dibuang, duplikat (huruf besar/kecil diabaikan) digabung. `[]` mengosongkan |

```jsonc
// request
{ "rumpunIlmu": "Ilmu Teknik", "bidang": "Teknologi Informasi dan Komunikasi",
  "kataKunci": [" sistem informasi ", "IoT", "iot", ""] }
// respons proposal
"rumpunIlmu": "Ilmu Teknik",
"bidang": "Teknologi Informasi dan Komunikasi",
"kataKunci": ["sistem informasi", "IoT"]
```

- Di respons, `kataKunci` **selalu array** (`[]` jika kosong).
- `kataKunci` yang bukan array, lebih dari 10, atau item lebih dari 50 karakter →
  422 (`errors.kataKunci`).
- Backend tidak mewajibkan nilai `rumpunIlmu`/`bidang` ada di master, sama seperti `programStudi`.
  Jadi data lama tetap valid walau master berubah.

### 13.2 Kontak anggota (W-23)

Hanya **kontak** yang ditambahkan. Alamat **tidak** ditampilkan ke sesama pengguna (keputusan
privasi).

- `GET /users/search` dan `GET /dosen/proposals/members/search`: tiap item mendapat `kontak` dan
  `noHp` (sebelum `roles`).
- `anggota[].user` di respons proposal (list & detail, `/proposals` maupun `/dosen/proposals`) dan
  di detail laporan: `{ id, name, fullName, email, kontak, noHp }`.

Tampilkan `noHp || kontak || '—'`. Kolom **Alamat** di tabel Anggota sebaiknya dihapus dari UI.

### 13.3 Master data (W-22, W-25)

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/master/:kategori` | login | Item aktif, urut `urutan` lalu `nama`. `?jenis=penelitian\|pengabdian` → item untuk jenis itu + item umum. `?semua=true` → termasuk nonaktif |
| POST | `/master/:kategori` | admin | Tambah item |
| PATCH | `/master/:kategori/:id` | admin | Ubah item (semua field opsional) |
| DELETE | `/master/:kategori/:id` | admin | Hapus item |

`:kategori` = **`rumpun-ilmu`** \| **`bidang`** \| **`luaran`**. Kategori lain →
`404 "Master data tidak dikenal. Pilihan: rumpun-ilmu, bidang, luaran"`.

```json
{ "success": true, "message": "Master data fetched",
  "data": [ { "id": 32, "nama": "Artikel jurnal nasional terakreditasi (SINTA)", "jenisKegiatan": null, "jenisLuaran": "jurnal",
              "urutan": 1, "isAktif": true, "createdAt": "...", "updatedAt": "..." } ] }
```

| Field | Keterangan |
|---|---|
| `jenisKegiatan` | `penelitian` \| `pengabdian` \| `null` (berlaku untuk keduanya) |
| `jenisLuaran` | Hanya untuk master `luaran`: jenis item luaran (`jurnal`, `prosiding`, `hki`, `buku`, `produk`, `media_massa`, `lainnya`), cocok dengan field `jenis` di `POST /luaran` (bagian 12.1) |
| `urutan` | Urutan tampil (kecil dulu) |

Body POST/PATCH: `nama` (wajib saat POST, di-trim, min 2, unik per kategori), `jenisKegiatan`
(atau `null`), `jenisLuaran` (atau `null`, hanya untuk `luaran`, kalau tidak →
`400 "jenisLuaran hanya untuk master luaran"`), `urutan` (int ≥ 0), `isAktif` (boolean).
Respons: `201 "Master data berhasil dibuat"`, `200 "Master data berhasil diperbarui"`,
`200 "Master data berhasil dihapus"`. Nama duplikat → `409 "Resource already exists"`; id tidak
ada di kategori itu → `404 "Master data tidak ditemukan"`. `?jenis=` selain dua nilai di atas → `400`.

**Isi awal** (bisa diubah admin):
- **Rumpun ilmu**: 12 rumpun ilmu tingkat 1 DIKTI (MIPA, Ilmu Tanaman, Ilmu Hewani, Ilmu Kedokteran,
  Ilmu Kesehatan, Ilmu Teknik, Ilmu Bahasa, Ilmu Ekonomi, Ilmu Sosial Humaniora, Agama dan
  Filsafat, Seni Desain dan Media, Ilmu Pendidikan).
- **Bidang**: 11 bidang fokus penelitian (Pangan, Energi, Kesehatan dan Obat, TIK, dst.) dan 8
  bidang pengabdian (Pendidikan dan Literasi, Kesehatan Masyarakat, Pemberdayaan Ekonomi dan
  UMKM, Teknologi Tepat Guna, dst.).
- **Luaran**: 7 pilihan pertama **sama persis** dengan `LUARAN_OPTIONS` di `UsulanPage.jsx`
  (urutannya juga sama), ditambah 3 pilihan khusus jenis kegiatan. Nilai yang dipilih tetap
  dikirim sebagai teks ke field `luaran`. `jenisLuaran`-nya bisa dipakai saat membuat item luaran
  terstruktur (`POST /luaran`).

### 13.4 Contoh pemanggilan (axios)

```js
// src/api/master.js (baru)
export const masterApi = {
  list:   (kategori, params = {}) => api.get(`/master/${kategori}`, { params }), // kategori: 'rumpun-ilmu' | 'bidang' | 'luaran'
  create: (kategori, data) => api.post(`/master/${kategori}`, data),
  update: (kategori, id, data) => api.patch(`/master/${kategori}/${id}`, data),
  remove: (kategori, id) => api.delete(`/master/${kategori}/${id}`),
};

// wizard Usulan
const [rumpun, bidang, luaran] = await Promise.all([
  masterApi.list('rumpun-ilmu'),
  masterApi.list('bidang', { jenis }),
  masterApi.list('luaran', { jenis }),
]);
```

---

## 14. W-26 Detail mitra pengabdian

Satu mitra per proposal pengabdian. Field `mitra` (nama, bagian 10.4) kini dilengkapi empat
field berikut (semua opsional), di `POST/PATCH /proposals` dan `POST/PATCH /dosen/proposals`:

| Field | Tipe | Isi form (langkah Mitra) |
|---|---|---|
| `mitraJenis` | string \| null | Jenis Mitra. Disarankan `nama` dari `GET /master/jenis-mitra?jenis=pengabdian` |
| `mitraAlamat` | string \| null | Alamat Mitra |
| `mitraKontak` | string \| null | Kontak Mitra (telepon/email) |
| `mitraKebutuhan` | string \| null | Pernyataan Kebutuhan Mitra (teks panjang) |

```json
{ "mitra": "Kelompok Tani Sukamaju", "mitraJenis": "Kelompok masyarakat",
  "mitraAlamat": "Desa Sukamaju, Deli Serdang", "mitraKontak": "0812-0000-1111",
  "mitraKebutuhan": "Pendampingan pemasaran hasil panen secara daring" }
```

- **Respons proposal** (semua endpoint, setelah `mitra`) dan **objek laporan** selalu memuat
  keempat key. Untuk penelitian nilainya `null`. Laporan menyalin nilai ini dari proposal saat
  dibuat.
- `null` mengosongkan field.
- Mengirim nilai **bukan null** untuk proposal penelitian →
  `400 "Detail mitra hanya untuk proposal pengabdian"`. Nilai `null` untuk penelitian diabaikan,
  jadi form boleh mengirim objek yang sama untuk kedua jenis.
- Jika `jenis` proposal diubah dari pengabdian ke penelitian, nama dan detail mitra **dihapus**
  (sama seperti `mitra`/`skema` di bagian 10.4).
- Seperti field master lain, `mitraJenis` adalah teks bebas. Backend tidak mewajibkan nilainya
  ada di master.

**Master jenis mitra**: kategori baru **`jenis-mitra`** di endpoint master (bagian 13.3),
dengan aturan dan CRUD admin yang sama:

```js
masterApi.list('jenis-mitra', { jenis: 'pengabdian' })
```

Isi awal (bisa diubah admin): Kelompok masyarakat, UMKM, Koperasi, Sekolah / lembaga
pendidikan, Pemerintah desa / kelurahan, Instansi pemerintah, Organisasi kemasyarakatan / LSM,
Dunia usaha / industri, Lainnya.

---

## 15. W-27, W-28, W-30

### 15.1 Kata kunci laporan (W-27)

`POST /laporan` dan `PATCH /laporan/:id` sekarang menerima **`kataKunci`** (array string, aturan
sama dengan proposal di bagian 13.1: maks 10 × 50 karakter, dipangkas, duplikat digabung,
`[]` mengosongkan).

- Saat laporan dibuat, kata kunci **disalin dari proposal**, kecuali `kataKunci` dikirim di body
  `POST /laporan`.
- Mengubah kata kunci laporan **tidak** mengubah kata kunci proposalnya.
- Respons laporan selalu berisi `kataKunci` sebagai array.

### 15.2 Metode penelitian laporan (W-28)

Field baru **`metodePenelitian`** (string \| null, teks panjang) khusus **laporan penelitian**:

- Diterima di `POST /laporan` dan `PATCH /laporan/:id`. `null` mengosongkan.
- Objek laporan selalu memuat key ini (setelah `realisasiAnggaran`). Untuk laporan pengabdian
  nilainya `null`.
- Nilai bukan null untuk laporan pengabdian → `400 "Metode penelitian hanya untuk laporan
  penelitian"`. Nilai `null` diabaikan.
- Hanya bisa diubah saat laporan `draft`/`revisi`, sama seperti field laporan lain.

```json
// PATCH /laporan/:id
{ "kataKunci": ["hasil", "IoT"], "metodePenelitian": "Eksperimen dengan kelompok kontrol" }
```

### 15.3 Ketua LPPM mengatur peran reviewer (W-30)

`PATCH /users/:id/roles` kini juga bisa dipanggil **`ketua_lppm`**, dengan batasan:

- target harus user yang **berperan dosen**;
- daftar peran baru harus **sama dengan peran sekarang**, hanya boleh berbeda pada `reviewer`
  (ditambah atau dihapus).

Pelanggaran → `403 "Ketua LPPM hanya dapat menambah atau mencabut peran reviewer pada dosen"`.
Admin tetap bebas mengubah semua peran seperti sebelumnya. Body dan respons sama persis untuk
keduanya:

```js
// Jadikan reviewer: kirim peran sekarang + 'reviewer'
api.patch(`/users/${id}/roles`, { roles: [...roleNames.filter((r) => r !== 'reviewer'), 'reviewer'] })
// Cabut reviewer: kirim peran sekarang tanpa 'reviewer'
api.patch(`/users/${id}/roles`, { roles: roleNames.filter((r) => r !== 'reviewer') })
```

Komponen `ReviewerAccess` di `UserManagementPage.jsx` cukup mengaktifkan tombolnya untuk Ketua
(`canEdit`), karena pemanggilannya sudah memakai pola di atas.

---

## 16. Hak akses reviewer dosen

### 16.1 Aturan

| Aturan | Keterangan |
|---|---|
| Default | Dosen **tidak** berperan reviewer. Registrasi dosen hanya memberi peran `dosen` |
| Memberi | **Admin** dan **Ketua LPPM** bisa menjadikan dosen reviewer |
| Mencabut biasa | Admin/Ketua, **hanya bila tidak ada tugasan yang belum selesai**. Kalau masih ada → `409` |
| Cabut paksa | **Hanya Ketua LPPM**. Setiap tugasan yang belum selesai **wajib dialihkan** ke reviewer baru dulu; pengalihan + pencabutan terjadi dalam satu transaksi |
| Siapa yang bisa mereview | Hanya user berperan **`reviewer`** (dosen yang dijadikan reviewer atau reviewer murni). Berlaku untuk semua user, termasuk mahasiswa |

**Tugasan belum selesai** = tugasan yang reviewnya belum difinalisasi, pada proposal atau
laporan yang masih berstatus `diajukan`/`review`. Tugasan pada item yang sudah diputuskan tidak
menghalangi pencabutan. Review yang sudah final tetap tersimpan sebagai arsip.

Peran reviewer dibaca dari **database**, bukan dari token. Jadi dosen yang baru dijadikan
reviewer langsung bisa mengakses tugasan tanpa login ulang. Untuk menampilkan menu, frontend
tetap memakai `roles` dari `GET /auth/me` (`canReview`), jadi panggil `fetchMe()` setelah peran
berubah kalau perubahan itu terjadi pada user yang sedang login.

### 16.2 Endpoint

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/users/:id/reviewer` | admin, ketua_lppm | Status reviewer + daftar tugasan belum selesai |
| PATCH | `/users/:id/reviewer` | admin, ketua_lppm | `{ "isReviewer": true \| false }`: beri atau cabut biasa |
| POST | `/users/:id/reviewer/force-revoke` | **ketua_lppm** | Cabut paksa + pengalihan tugasan |

**Objek status reviewer** (respons ketiga endpoint):

```json
{
  "userId": 13,
  "roles": ["dosen", "reviewer"],
  "isReviewer": true,
  "bisaDijadikanReviewer": true,
  "tugasanBelumSelesai": [
    { "id": 42, "itemId": 118, "tipe": "proposal", "createdAt": "2026-10-25T03:10:00.000Z",
      "judul": "Proposal untuk uji akses reviewer", "status": "review", "jenis": "penelitian", "pengusulId": 10 }
  ],
  "jumlahReviewSelesai": 3
}
```

| Field | Keterangan |
|---|---|
| `bisaDijadikanReviewer` | `true` jika user berperan dosen (hanya dosen yang perannya bisa diatur lewat endpoint ini) |
| `tugasanBelumSelesai[].id` | **id tugasan**, dipakai sebagai `tugasanId` saat cabut paksa |
| `tugasanBelumSelesai[].itemId` / `tipe` | id proposal atau laporan, dan jenisnya (`proposal` \| `laporan`) |
| `tugasanBelumSelesai[].pengusulId` | Pengusul item. Reviewer baru tidak boleh pengusul ini |
| `tugasanBelumSelesai[].rekomendasi` | Reviewer pengganti yang disarankan (bagian 16.5), atau `null` jika tidak ada kandidat |

**`PATCH /users/:id/reviewer`**

| Hasil | Status · message |
|---|---|
| Diberi | `200 "Dosen dijadikan reviewer"` |
| Dicabut | `200 "Peran reviewer dicabut"` |
| Sudah sesuai | `200 "Peran reviewer tidak berubah"` |
| Masih ada tugasan belum selesai | `409 "Dosen masih memiliki N tugasan review yang belum selesai. Ketua LPPM dapat mencabut paksa ..."` |
| User bukan dosen | `400 "Peran reviewer hanya dapat diatur untuk user berperan dosen"` |
| `isReviewer` bukan boolean | `422` |

**`POST /users/:id/reviewer/force-revoke`** (Ketua LPPM)

```json
{ "pengalihan": [ { "tugasanId": 42, "reviewerBaruId": 5 } ] }
```

atau biarkan backend memilih (bagian 16.5):

```json
{ "otomatis": true }
```

`otomatis: true` mengisi tugasan yang **tidak** ada di `pengalihan` dengan reviewer rekomendasi.
Entri `pengalihan` yang dikirim tetap diutamakan, jadi keduanya bisa digabung.

- `pengalihan` wajib mencakup **semua** `tugasanBelumSelesai`, masing-masing sekali. Kalau tidak
  ada tugasan terbuka, kirim `[]` (sama dengan cabut biasa).
- `reviewerBaruId` harus user `approved` yang berperan `reviewer`, bukan dosen yang dicabut, dan
  bukan pengusul item itu. Kalau reviewer baru sudah ditugaskan di item yang sama, tugasan lama
  cukup dihapus.
- Efek: tugasan dipindah ke reviewer baru (dapat notifikasi `reviewer_ditugaskan`,
  `refType` `proposal`/`laporan`), draf review dosen lama yang belum final dihapus, lalu peran
  `reviewer` dicabut.
- Respons `200 "Peran reviewer dicabut paksa"`: objek status + `jumlahDialihkan`.

Error:

| Status | message |
|---|---|
| 400 | `"Semua tugasan belum selesai wajib dialihkan terlebih dahulu. Belum dialihkan: #42, ..."` |
| 400 | `"Tugasan #N bukan tugasan belum selesai milik dosen ini"` · `"Tugasan #N dialihkan lebih dari sekali"` |
| 400 | `"Reviewer baru tidak boleh dosen yang sama"` · `"Reviewer baru untuk tugasan #N adalah pengusulnya sendiri"` |
| 400 | `"Reviewer tidak ditemukan, belum disetujui, atau tidak berperan reviewer"` |
| 400 | `"User ini tidak berperan reviewer"` · `"Peran reviewer hanya dapat diatur untuk user berperan dosen"` |
| 403 | bukan Ketua LPPM (admin juga ditolak) |

### 16.3 Perubahan pada endpoint lain

| Endpoint | Perubahan |
|---|---|
| `POST /proposals/:id/reviewers`, `POST /laporan/:id/reviewers` | Semua `reviewerIds` wajib user `approved` berperan `reviewer` → kalau tidak, `400 "Reviewer tidak ditemukan, belum disetujui, atau tidak berperan reviewer"`. Untuk daftar pilihan reviewer, tetap pakai `GET /users?role=reviewer` (sudah termasuk dosen yang dijadikan reviewer) |
| `GET /reviewer/my-tugasan`, `GET /laporan/tugasan` | Hanya user berperan reviewer. Selain itu `403 "Anda tidak memiliki peran reviewer"` (sebelumnya dosen/mahasiswa juga boleh) |
| `POST /proposals/:id/reviews[/finalize]`, `POST /laporan/:id/reviews[/finalize]` | Wajib berperan reviewer (dicek di DB) → `403 "Anda tidak memiliki peran reviewer"` |
| `PATCH /users/:id/roles` | Menghapus `reviewer` saat masih ada tugasan belum selesai → `409` (berlaku juga untuk admin). Aturan Ketua (bagian 15.3) tetap berlaku |

### 16.5 Prioritas reviewer yang belum punya tugasan

Saat mengalihkan tugasan (cabut paksa) atau menugaskan reviewer biasa, reviewer yang **belum punya
tugasan aktif** didahulukan.

**`GET /users/kandidat-reviewer`** (admin, ketua_lppm): semua user `approved` berperan
`reviewer`, diurutkan dari yang paling longgar.

| Query | Keterangan |
|---|---|
| `itemId` | (opsional) id proposal **atau** laporan. Pengusulnya dikeluarkan dari daftar, dan reviewer yang sudah ditugaskan di item itu ditandai `sudahDitugaskan: true` lalu ditaruh paling bawah. Item tidak ada → `404` |
| `exclude` | (opsional) id user yang dikeluarkan, pisahkan dengan koma, mis. dosen yang sedang dicabut: `?exclude=13` |

```json
{ "success": true, "message": "Kandidat reviewer fetched",
  "data": [
    { "id": 5, "name": "Dr. Reviewer 2, M.Kom", "fullName": "Dr. Reviewer 2, M.Kom", "email": "reviewer2@lppm.dev",
      "programStudi": "Sistem Informasi", "tugasanBelumSelesai": 0, "totalTugasan": 2, "prioritas": true, "sudahDitugaskan": false },
    { "id": 4, "name": "Dr. Reviewer 1, M.T", "fullName": "Dr. Reviewer 1, M.T", "email": "reviewer1@lppm.dev",
      "programStudi": "Teknik Informatika", "tugasanBelumSelesai": 3, "totalTugasan": 9, "prioritas": false, "sudahDitugaskan": false }
  ] }
```

| Field | Keterangan |
|---|---|
| `tugasanBelumSelesai` | Jumlah tugasan aktif (definisi sama dengan bagian 16.1) |
| `totalTugasan` | Semua tugasan sepanjang waktu (dipakai sebagai urutan kedua) |
| `prioritas` | `true` jika `tugasanBelumSelesai = 0`. Tampilkan sebagai badge "Belum ada tugasan" / "Diprioritaskan" |
| `sudahDitugaskan` | Hanya bermakna jika `itemId` dikirim |

Urutan: `tugasanBelumSelesai` naik → `totalTugasan` naik → nama. Daftar ini bisa langsung
menggantikan `GET /users?role=reviewer` di dialog **Tugaskan Reviewer** (proposal & laporan)
dengan `?itemId=<id>`.

**Rekomendasi di status reviewer.** Setiap item `tugasanBelumSelesai` di
`GET /users/:id/reviewer` punya `rekomendasi`:

```json
"rekomendasi": { "id": 5, "name": "Dr. Reviewer 2, M.Kom", "fullName": "Dr. Reviewer 2, M.Kom", "tugasanBelumSelesai": 0, "prioritas": true }
```

Rekomendasi **disebar**: tiap pilihan menambah hitungan beban reviewer itu, sehingga jika dosen punya
beberapa tugasan, tidak semuanya diarahkan ke satu orang. Kandidat yang dilewati: dosen yang dicabut,
pengusul item, dan reviewer yang sudah ditugaskan di item tersebut. Frontend bisa memakai
rekomendasi sebagai nilai awal dropdown per tugasan, lalu Ketua tetap bisa menggantinya.

### 16.4 Contoh pemanggilan (axios)

```js
// src/api/users.js
getReviewerStatus: (id) => api.get(`/users/${id}/reviewer`),
setReviewer: (id, isReviewer) => api.patch(`/users/${id}/reviewer`, { isReviewer }),
forceRevokeReviewer: (id, pengalihan, otomatis = false) => api.post(`/users/${id}/reviewer/force-revoke`, { pengalihan, otomatis }),
getKandidatReviewer: (params = {}) => api.get('/users/kandidat-reviewer', { params }), // { itemId, exclude }

// Alur cabut di panel Manajemen User:
// 1. setReviewer(id, false)
// 2. jika 409 dan user = Ketua: getReviewerStatus(id) → tampilkan tugasanBelumSelesai dengan
//    dropdown per tugasan berisi getKandidatReviewer({ itemId: t.itemId, exclude: id }),
//    nilai awal = t.rekomendasi.id; lalu forceRevokeReviewer(id, [{ tugasanId, reviewerBaruId }, ...])
//    (atau tombol "Alihkan otomatis" → forceRevokeReviewer(id, [], true))
// 3. jika 409 dan user = Admin: tampilkan pesan bahwa hanya Ketua yang bisa mencabut paksa
```

---

## 17. Mahasiswa tidak lagi mengusulkan proposal

Tugas mahasiswa hanya **laporan harian**. Mulai versi ini, semua penulisan proposal, laporan, dan
luaran hanya untuk **dosen** (+ admin untuk hapus/ubah tertentu). Mahasiswa mendapat
`403 "Forbidden: insufficient permissions"`.

| Endpoint | Sebelumnya | Sekarang |
|---|---|---|
| `POST/PATCH /proposals`, `POST /proposals/:id/submit`, `POST /proposals/:id/dokumen-utama` | dosen, mahasiswa | **dosen** |
| `DELETE /proposals/:id` | dosen, mahasiswa, admin | dosen, admin |
| `GET/POST /dosen/proposals`, `GET/PATCH/DELETE /dosen/proposals/:id`, `POST .../submit`, `GET .../stats`, `GET .../members/search` | dosen, mahasiswa | **dosen** |
| `POST /proposals/:id/laporan`, `POST /proposals/:id/dokumen` (laporan kemajuan/akhir & lampiran) | dosen, mahasiswa | **dosen** |
| `PATCH/DELETE /proposals/laporan/:id`, `DELETE /proposals/dokumen/:id` | dosen, mahasiswa, admin | dosen, admin |
| `/laporan`: `my`, `eligible`, create, update, submit, upload dokumen | dosen, mahasiswa | **dosen** (hapus: dosen, admin) |
| `/luaran`: `stats`, create, update, capaian, bukti, delete | dosen, mahasiswa | **dosen** |

**Tetap bisa untuk mahasiswa:**

| Fitur | Endpoint |
|---|---|
| Undangan tim (lihat, terima/tolak) | `GET /dosen/proposals/invitations`, `PATCH /dosen/proposals/invitations/:id` |
| Proposal tempat ia menjadi anggota | `GET /dosen/proposals/as-member`, detail `GET /proposals/:id` (anggota diterima) |
| Laporan harian | semua `/mahasiswa/laporan-harian/...` |
| Baca luaran & laporan proposal tempat ia anggota | `GET /luaran/proposal/:id`, `GET /laporan/:id`, unduhan dokumen |

Frontend saat ini tidak menampilkan fitur usulan untuk mahasiswa (menu mahasiswa = Undangan Tim
& Laporan Harian), jadi tidak ada halaman yang perlu diubah.

**Data lama**: proposal yang sudah terlanjur dibuat mahasiswa dihapus dengan command backend
`go run ./cmd/hapus-proposal-mahasiswa` (lihat `backend_go/README.md`).

---

## 18. Aturan komposisi tim proposal

> **Diperbarui** (ketentuan anggota terbaru): batas minimal **dan maksimal** per jenis.

Dicek saat proposal **diajukan** (`POST /dosen/proposals/:id/submit` dan `POST /proposals/:id/submit`).
Menyimpan draft (POST/PATCH) tetap boleh dengan tim belum lengkap.

| Jenis | Anggota dosen | Anggota mahasiswa |
|---|---|---|
| `penelitian` | min. 0, maks. 5 | min. 1, tanpa batas maksimal |
| `pengabdian` | min. 1, maks. 5 | min. 1, tanpa batas maksimal |

- Hitungan **tidak termasuk ketua pengusul** (sama dengan keterangan "selain ketua pengusul" di wizard).
- Dosen = user berperan `dosen`; mahasiswa = user berperan `mahasiswa` tanpa peran `dosen`.
- Anggota yang **menolak** undangan tidak dihitung (yang masih `pending` dihitung). Di
  `/dosen/proposals/:id/submit` cek undangan (semua harus `diterima`, respons 500 lama) berjalan lebih
  dulu, baru cek komposisi.

Gagal → **400**, pesan menyebut semua yang tidak sesuai:

```json
{ "success": false, "message": "Proposal pengabdian belum dapat diajukan: tim wajib memiliki minimal 1 anggota dosen (sekarang 0) dan minimal 1 anggota mahasiswa (sekarang 0), selain ketua pengusul." }
```

Contoh lain:

- `"Proposal penelitian belum dapat diajukan: tim wajib memiliki minimal 1 anggota mahasiswa (sekarang 0), selain ketua pengusul."`
- `"Proposal penelitian belum dapat diajukan: tim wajib memiliki maksimal 5 anggota dosen (sekarang 6), selain ketua pengusul."`

Catatan FE: samakan `src/utils/aturanTim.js` dengan tabel di atas:

```js
export const ATURAN_TIM = {
  penelitian: { dosen: { min: 0, max: 5 }, mahasiswa: { min: 1 } },
  pengabdian: { dosen: { min: 1, max: 5 }, mahasiswa: { min: 1 } },
}
```

---

## 19. Backup database (admin)

Sistem mem-backup **seluruh database** (struktur + data + file blob) **otomatis sebulan sekali**
(default tanggal 1 pukul 02:00 WIB). Admin juga bisa backup **kapan saja**. Setiap backup tercatat
di log beserta siapa yang melakukannya: **sistem** atau **admin** (nama admin). File `.sql.gz`
disimpan di server dan bisa diunduh/dihapus dari halaman log.

Semua endpoint: `Authorization: Bearer <token admin>`; selain admin → `403 Forbidden: insufficient permissions`.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/backup` | Daftar log (`?page=1&limit=10`, maks 100; filter `?sumber=sistem\|admin`, `?status=berjalan\|berhasil\|gagal`), terbaru dulu, + `meta` |
| GET | `/api/v1/backup/jadwal` | Info jadwal otomatis + backup otomatis terakhir |
| POST | `/api/v1/backup` | Backup manual sekarang (tanpa body) → **202**, berjalan di latar |
| GET | `/api/v1/backup/:id` | Detail satu log (dipakai untuk memantau status setelah POST) |
| GET | `/api/v1/backup/:id/download` | Unduh file `.sql.gz` (`Content-Disposition: attachment`) |
| DELETE | `/api/v1/backup/:id` | Hapus **file** backup; baris log tetap ada (ditandai `dihapusAt`/`dihapusOleh`) |

### Bentuk satu log

```json
{
  "id": 3,
  "sumber": "admin",
  "keterangan": "Manual oleh admin Admin LPPM",
  "status": "berhasil",
  "periode": null,
  "namaFile": "lppm-backup-20261025-102334-admin-3.sql.gz",
  "ukuran": 146202,
  "jumlahTabel": 25,
  "jumlahBaris": 6061,
  "pesanError": null,
  "mulaiAt": "2026-10-25T03:23:34.120Z",
  "selesaiAt": "2026-10-25T03:23:34.231Z",
  "durasiMs": 111,
  "fileTersedia": true,
  "dihapusAt": null,
  "dibuatOleh": { "id": 1, "name": "Admin LPPM", "fullName": null, "email": "admin@lppm.dev" },
  "dihapusOleh": null
}
```

| Field | Arti |
|---|---|
| `sumber` | `sistem` (otomatis terjadwal) atau `admin` (manual). Tampilkan kolom "Dilakukan oleh". |
| `keterangan` | Teks siap tampil: `"Otomatis oleh sistem (jadwal bulanan)"` / `"Manual oleh admin <nama>"` |
| `dibuatOleh` | Admin yang menekan tombol; `null` untuk sistem |
| `status` | `berjalan` → `berhasil` / `gagal` (`pesanError` berisi alasan) |
| `periode` | `"YYYY-MM"` bulan jadwal untuk backup otomatis; `null` untuk manual |
| `ukuran` | byte file terkompresi; `jumlahTabel`, `jumlahBaris` = isi dump |
| `fileTersedia` | `true` bila tombol **Unduh**/**Hapus** boleh aktif (berhasil & belum dihapus) |
| `dihapusAt`, `dihapusOleh` | diisi setelah file dihapus admin |

### Backup manual

`POST /api/v1/backup` → **202** `"Backup dimulai. Pantau statusnya lewat GET /backup/:id"`, `data` = log
berstatus `berjalan`. Polling `GET /backup/:id` tiap 1–2 detik sampai status bukan `berjalan`
(biasanya beberapa detik). Hanya satu backup boleh berjalan: bila ada yang sedang berjalan (manual
atau otomatis) → **409** `"Backup lain sedang berjalan. Tunggu hingga selesai."`

### Jadwal

`GET /api/v1/backup/jadwal`:

```json
{
  "otomatisAktif": true,
  "tanggal": 1,
  "jam": 2,
  "zonaWaktu": "Asia/Jakarta",
  "keterangan": "Setiap tanggal 1 pukul 02:00 (Asia/Jakarta)",
  "berikutnyaAt": "2026-10-31T19:00:00.000Z",
  "sedangBerjalan": false,
  "terakhirOtomatis": { "...": "bentuk log di atas, atau null" }
}
```

`berikutnyaAt` `null` bila otomatis dimatikan. Bila server mati saat jadwal, backup bulan itu
dijalankan begitu server hidup lagi (dicek tiap 10 menit); gagal dicoba ulang 6 jam kemudian.

### Unduh & hapus — status error

| Kondisi | Unduh | Hapus |
|---|---|---|
| log tidak ada | 404 `Log backup tidak ditemukan` | 404 |
| masih berjalan | 409 `Backup masih berjalan` | 409 |
| gagal | 409 `Backup gagal, tidak ada file` | 409 |
| file sudah dihapus | **410** `File backup sudah dihapus` | 409 `File backup sudah dihapus` |
| file hilang dari disk | 404 `File backup tidak ditemukan di server` | (log tetap ditandai dihapus) |

Unduh lewat axios: `responseType: 'blob'`, lalu simpan dengan nama dari `namaFile`.
Backup manual, unduh, dan hapus juga dicatat di log aktivitas (`backup.manual|download|delete`).

### Memulihkan (dilakukan di server, bukan lewat API)

```bash
gunzip < lppm-backup-....sql.gz | mysql -u <user> -p <database>
```

---

## 20. Hak akses periode (admin hanya melihat)

Perubahan hak akses `/api/v1/periode` (endpoint lama, pesan & bentuk respons tetap):

| Endpoint | Sebelumnya | Sekarang |
|---|---|---|
| `GET /periode`, `GET /periode/:id` | semua user login | tetap |
| `POST /periode` (tambah) | admin, ketua | **ketua_lppm saja** |
| `PATCH /periode/:id` (ubah) | admin, ketua | **ketua_lppm saja** |
| `DELETE /periode/:id` (**baru**, hapus langsung) | — | **ketua_lppm** |
| `POST /periode/:id/deletion-request` (minta hapus) | admin, ketua | **admin saja** |
| `POST /periode/deletion-request/:requestId/approve` | pihak lain (admin ↔ ketua) | **ketua_lppm saja** |
| `GET /periode/:id/deletion-request`, `POST .../cancel` | admin, ketua | tetap |

Selain yang diizinkan → `403 "Forbidden: insufficient permissions"`.

### Ketua: hapus langsung

`DELETE /api/v1/periode/:id` dengan body `{ "password": "<password ketua sendiri>" }` (konfirmasi,
bukan persetujuan pihak lain).

| Kondisi | Respons |
|---|---|
| berhasil | `200 { "success": true, "message": "Periode berhasil dihapus" }` |
| tanpa password | `400 "Password wajib diisi"` |
| password salah | `500 "Password salah"` (sama dengan endpoint hapus lama) |
| periode tidak ada | `500 "Periode tidak ditemukan"` |

Bila ada permintaan hapus dari admin yang masih menunggu untuk periode itu, permintaannya ikut
ditandai disetujui dan admin peminta mendapat notifikasi `deletion_approved`.

### Admin: hapus lewat verifikasi Ketua

Alur lama tetap: admin `POST /periode/:id/deletion-request` `{ password }` → semua Ketua LPPM
mendapat notifikasi `deletion_request` → Ketua `POST /periode/deletion-request/:requestId/approve`
`{ password }` (periode terhapus, admin mendapat `deletion_approved`) atau `.../cancel`
(admin mendapat `deletion_cancelled`). Permintaan berlaku 1 hari.

### Untuk frontend (`PeriodePage.jsx`)

- Admin: sembunyikan tombol Tambah & Ubah periode; tombol Hapus tetap, membuka alur
  "Ajukan penghapusan ke Ketua" (`requestDelete`).
- Ketua: tombol Hapus → dialog password → `DELETE /periode/:id` (perlu fungsi baru di
  `src/api/periode.js`, mis. `remove: (id, password) => api.delete(`/periode/${id}`, { data: { password } })`);
  daftar permintaan dari admin tetap bisa disetujui/dibatalkan.

---

## 21. Template proposal (diganti admin)

Template yang diunduh dosen di wizard Usulan ("Unduh template proposal") kini disimpan di
server dan bisa diganti admin tiap tahun tanpa deploy ulang frontend. Setiap unggahan menjadi
**versi baru yang langsung aktif**; versi lama tetap tersimpan sebagai riwayat dan bisa diaktifkan
lagi.

- **Jenis**: `penelitian`, `pengabdian`, atau `umum`. Saat dosen meminta template jenis tertentu,
  backend memberi template aktif jenis itu; bila tidak ada, template aktif `umum`.
- **File**: DOCX atau PDF, maks 10 MB (dicek juga isi file-nya), disimpan di database.
- Satu template aktif per jenis.

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| GET | `/api/v1/template-proposal/aktif?jenis=penelitian` | **publik** (tanpa token) | Info template aktif; `data: null` bila belum ada |
| GET | `/api/v1/template-proposal/aktif/unduh?jenis=penelitian` | **publik** | Unduh file template aktif (`attachment`); 404 bila belum ada |
| GET | `/api/v1/template-proposal` (`?jenis=`) | admin | Semua versi (aktif di atas per jenis) |
| POST | `/api/v1/template-proposal` | admin | Unggah versi baru (multipart) → langsung aktif |
| GET | `/api/v1/template-proposal/:id/unduh` | admin | Unduh versi mana pun |
| PATCH | `/api/v1/template-proposal/:id/aktifkan` | admin | Jadikan versi ini aktif untuk jenisnya |
| DELETE | `/api/v1/template-proposal/:id` | admin | Hapus versi riwayat (yang aktif tidak bisa → 409) |

`jenis` di endpoint publik opsional (default `umum`); nilai lain → 422.

### Unggah (admin)

`POST /api/v1/template-proposal`, `multipart/form-data`:

| Field | Wajib | Isi |
|---|---|---|
| `file` | ya | DOCX/PDF, maks 10 MB |
| `jenis` | tidak | `umum` (default) / `penelitian` / `pengabdian` |
| `tahun` | tidak | 2000–2100, mis. `2027` (hanya label) |
| `keterangan` | tidak | maks 191 karakter, mis. "Template penelitian 2027" |

→ **201** `"Template proposal berhasil diunggah dan diaktifkan"`:

```json
{
  "id": 5,
  "jenis": "penelitian",
  "tahun": 2027,
  "keterangan": "Template penelitian 2027",
  "namaFile": "Template Penelitian 2027.docx",
  "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "ukuran": 48213,
  "isAktif": true,
  "unduhUrl": "/template-proposal/5/unduh",
  "diunggahOleh": { "id": 1, "name": "Admin LPPM", "fullName": null },
  "createdAt": "2026-10-26T04:10:12.345Z",
  "updatedAt": "2026-10-26T04:10:12.345Z"
}
```

| Error | Status | Pesan |
|---|---|---|
| tanpa file | 400 | `File template tidak ditemukan dalam request (field \`file\`).` |
| bukan DOCX/PDF | 400 | `Template harus berupa file DOCX atau PDF.` |
| isi file palsu | 400 | `Isi file bukan DOCX atau PDF yang valid.` |
| > 10 MB | 400 | `Ukuran template maksimal 10 MB.` |
| `jenis`/`tahun`/`keterangan` salah | 422 | `{ "errors": { "jenis": ["..."], "tahun": ["..."] } }` |

`unduhUrl` relatif ke base URL API (seperti `fotoUrl`): `API_BASE_URL + unduhUrl`.
Pada endpoint publik `/aktif`, `unduhUrl` = `/template-proposal/aktif/unduh?jenis=<jenis>&v=<id>`
(`v` berganti saat template diganti, jadi tidak tertahan cache peramban).

### Untuk frontend

- **Wizard Usulan** (`UsulanPage.jsx`): ganti tautan statis `/templates/template-proposal.docx` menjadi
  `API_BASE_URL + '/template-proposal/aktif/unduh?jenis=' + jenis` (bisa langsung `<a href>` karena
  publik). Agar aman bila admin belum mengunggah apa pun: panggil `GET /template-proposal/aktif?jenis=`
  dulu; bila `data` `null`, pakai file statis lama sebagai cadangan. Nama & tahun template bisa
  ditampilkan dari `namaFile`/`tahun`/`keterangan`.
- **Admin** (halaman baru, mis. menu "Template Proposal"): tabel `GET /template-proposal` per jenis
  (badge Aktif, tahun, keterangan, ukuran, pengunggah, tanggal), tombol **Unggah template baru**
  (form multipart di atas), **Unduh** (`GET /:id/unduh` sebagai blob, perlu token), **Aktifkan**
  (`PATCH /:id/aktifkan`, untuk versi lama), **Hapus** (`DELETE /:id`, nonaktif untuk yang aktif).
- Unggah, aktifkan, dan hapus dicatat di log aktivitas (`template.upload|aktifkan|delete`).

---

## 22. Detail undangan (W-35)

Calon anggota bisa melihat isi kegiatan **sebelum** menerima undangan.

`GET /api/v1/dosen/proposals/invitations/:id` — `:id` = id undangan (dari `GET /dosen/proposals/invitations`).
Hanya penerima undangan itu (dosen/mahasiswa); undangan milik orang lain atau tidak ada → **404**
`"Undangan tidak ditemukan"`. Bisa dipakai untuk status `pending`, `diterima`, maupun `ditolak`.

```json
{
  "id": 403,
  "peran": "anggota",
  "statusUndangan": "pending",
  "createdAt": "2026-10-26T04:18:58.086Z",
  "proposal": {
    "id": 621, "tipe": "proposal", "judul": "...", "abstrak": "...", "jenis": "penelitian", "status": "draft",
    "anggaran": null, "luaran": null, "skema": null, "mitra": null, "mitraJenis": null, "mitraAlamat": null,
    "mitraKontak": null, "mitraKebutuhan": null, "rumpunIlmu": "Ilmu Teknik", "bidang": null, "kataKunci": ["undangan"],
    "submittedAt": null, "approvedAt": null, "createdAt": "...", "updatedAt": "...",
    "tahapan": { "kode": "seleksi_usulan", "label": "Seleksi Usulan", "urutan": 1 },
    "pengusul": { "id": 9, "name": "...", "fullName": "...", "email": "...", "nidn": "...", "programStudi": "..." },
    "periode": { "id": 1, "nama": "...", "tahun": 2026, "jenis": "penelitian" },
    "anggota": [ { "id": 403, "peran": "anggota", "statusUndangan": "pending", "user": { "id": 11, "name": "...", "fullName": "..." } } ],
    "targetLuaran": [ { "id": 7, "jenis": "jurnal", "target": "Jurnal SINTA 4", "targetTanggal": null } ]
  }
}
```

Sengaja **tidak** dikirim: `dokumenUrl` (dokumen utama/lampiran), `catatanRevisi`, `reviewerTugasan`, dan
email/kontak/No. HP anggota lain. Email pengusul tetap ada (untuk menghubungi pengundang). Menerima/
menolak tetap lewat `PATCH /dosen/proposals/invitations/:id`.

---

## 23. Hapus proposal/laporan yang sudah diajukan dengan izin Ketua (W-34)

Admin tidak bisa langsung menghapus dokumen yang sudah diajukan. Admin mengirim **permintaan**,
Ketua LPPM menyetujui dengan password → dokumen terhapus. Draft tetap dihapus langsung lewat
`DELETE /proposals/:id` / `DELETE /laporan/:id` (sudah ada).

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| POST | `/api/v1/proposals/:id/deletion-request` | admin | Minta hapus proposal `{ password, alasan }` |
| POST | `/api/v1/laporan/:id/deletion-request` | admin | Minta hapus laporan `{ password, alasan }` |
| GET | `/api/v1/proposals/:id/deletion-request`, `/api/v1/laporan/:id/deletion-request` | admin, ketua | Permintaan yang **menunggu** untuk dokumen itu (`data: null` bila tidak ada) |
| GET | `/api/v1/dokumen/deletion-request` (`?status=pending\|approved\|rejected\|cancelled&tipe=proposal\|laporan`) | admin, ketua | Daftar permintaan (yang menunggu di atas, maks 200) |
| POST | `/api/v1/dokumen/deletion-request/:requestId/approve` | ketua | Setujui `{ password }` → dokumen dihapus |
| POST | `/api/v1/dokumen/deletion-request/:requestId/cancel` | admin peminta / ketua | Admin = **batal** (`cancelled`), Ketua = **tolak** (`rejected`); body opsional `{ catatan }` |

`alasan` wajib 5–1000 karakter. Satu dokumen hanya boleh punya satu permintaan yang menunggu.

### Bentuk permintaan

```json
{
  "id": 12,
  "tipe": "proposal",
  "kegiatanId": 640,
  "jenis": "penelitian",
  "judul": "Proposal untuk uji hapus dengan izin",
  "status": "pending",
  "alasan": "Proposal duplikat",
  "catatan": null,
  "requester": { "id": 1, "name": "Admin LPPM", "fullName": null },
  "approver": null,
  "pengusul": { "id": 9, "name": "Dosen 5", "fullName": "Dr. Dosen 5, M.T" },
  "decidedAt": null,
  "createdAt": "2026-10-26T04:19:01.000Z",
  "updatedAt": "2026-10-26T04:19:01.000Z"
}
```

`judul`, `jenis`, dan `pengusul` disalin saat permintaan dibuat, jadi riwayat tetap terbaca setelah
dokumen terhapus (`kegiatanId` menjadi `null`). `approver` = Ketua yang menyetujui/menolak, atau admin
yang membatalkan.

### Yang terjadi saat disetujui

- Proposal dihapus beserta **laporannya** dan semua relasi (anggota, tugasan, review, laporan
  kemajuan/akhir, dokumen, laporan harian, luaran). Menghapus laporan hanya menghapus laporan itu.
- Notifikasi lama yang merujuk dokumen itu dibersihkan; permintaan lain yang menunggu untuk dokumen
  yang sama/laporannya ikut ditandai `approved`.
- Pengusul & admin peminta mendapat notifikasi `deletion_approved` (dengan alasan), dicatat di log aktivitas.

### Notifikasi (`refType: "DokumenDeletionRequest"`, `refId` = id permintaan)

| Kejadian | Penerima | `type` |
|---|---|---|
| admin membuat permintaan | semua Ketua LPPM | `deletion_request` |
| Ketua menyetujui | pengusul + admin peminta | `deletion_approved` |
| Ketua menolak | admin peminta (+ catatan) | `deletion_cancelled` |

### Error

| Kondisi | Status | Pesan |
|---|---|---|
| bukan admin (minta) / bukan ketua (setujui) | 403 | `Forbidden: insufficient permissions` |
| dokumen tidak ada / salah route (id laporan di `/proposals`) | 404 | `Proposal tidak ditemukan` / `Laporan tidak ditemukan` |
| alasan kosong/terlalu pendek | 422 | `{ "errors": { "alasan": ["Alasan wajib diisi (5–1000 karakter)"] } }` |
| tanpa password / password salah | 400 | `Password wajib diisi` / `Password salah` |
| sudah ada permintaan menunggu | 409 | `Sudah ada permintaan penghapusan yang menunggu persetujuan Ketua LPPM` |
| permintaan sudah diproses | 409 | `Permintaan penghapusan sudah diproses` |
| batal oleh admin lain | 403 | `Hanya admin peminta atau Ketua LPPM yang dapat membatalkan permintaan ini` |

### Untuk frontend

- `components/HapusDokumen.jsx`: aktifkan "Ajukan hapus (izin Ketua)" → dialog password + alasan →
  `POST /proposals/:id/deletion-request` atau `/laporan/:id/deletion-request`; tampilkan status dari
  `GET .../deletion-request` (menunggu → tombol "Batalkan").
- Ketua: daftar `GET /dokumen/deletion-request?status=pending` (mis. di Dokumen Masuk atau halaman
  notifikasi) dengan Setujui (dialog password) & Tolak (catatan opsional).

---

## 24. Peran Ketua STMIK & pemantauan proposal

Peran baru **`ketua_stmik`** untuk memantau seluruh proposal: dosen yang sudah memasukkan proposal,
progres/status tiap proposal, dan besaran anggaran. **Hanya baca** — tidak bisa mengubah status,
menugaskan reviewer, mengelola periode/user, atau mengedit/menghapus dokumen.

- Muncul di `roles` login & `/auth/me` sebagai `"ketua_stmik"`. Admin memberi peran lewat
  `PATCH /users/:id/roles` (`roles: ["ketua_stmik"]`); filter `GET /users?role=ketua_stmik` juga bisa.
- Akun contoh: `ketuastmik@email.com` / `ketuastmik123` (dibuat `go run ./cmd/seed-email`, lihat di bawah).

### Endpoint lama yang kini bisa dibaca Ketua STMIK

| Endpoint | Keterangan |
|---|---|
| `GET /proposals` (filter `periodeId`, `jenis`, `status`, `tahun`, `programStudi`, `search`) | semua proposal |
| `GET /proposals/:id`, `GET /proposals/:id/reviews`, `GET /proposals/:id/dokumen-utama` | detail, review, unduh dokumen |
| `GET /laporan`, `GET /laporan/:id`, `GET /laporan/:id/reviews`, `GET /laporan/:id/dokumen` | laporan kegiatan |
| `GET /dashboard/stats` | statistik yang sama dengan admin/ketua |
| `GET /export/proposals` | data rekap untuk PDF/Excel |
| `GET /periode` | (sudah untuk semua user) |

Semua endpoint tulis tetap 403 `"Forbidden: insufficient permissions"`.

### Endpoint pemantauan baru (`/api/v1/monitoring`)

Akses: `ketua_stmik`, `ketua_lppm`, `admin`. Bawaan **hanya proposal yang sudah diajukan** (bukan draft).

Filter bersama (query, semua opsional): `periodeId`, `tahun` (tahun periode), `jenis`
(`penelitian|pengabdian`), `search` (judul, nama/NIDN pengusul), `termasukDraft=true`. Nilai salah → 422.

#### `GET /monitoring/ringkasan`

```json
{
  "jumlahProposal": 42,
  "jumlahDosenPengusul": 17,
  "totalAnggaran": "615000000",
  "anggaranDisetujui": "240000000",
  "perStatus": { "diajukan": 8, "review": 6, "revisi": 4, "disetujui": 20, "ditolak": 4 },
  "perJenis": {
    "penelitian": { "jumlah": 30, "totalAnggaran": "480000000", "anggaranDisetujui": "200000000" },
    "pengabdian": { "jumlah": 12, "totalAnggaran": "135000000", "anggaranDisetujui": "40000000" }
  }
}
```

Anggaran berupa **string desimal** (sama seperti `anggaran` proposal). `perStatus` memuat `draft` bila
`termasukDraft=true`.

#### `GET /monitoring/proposals`

Tambahan query: `status`, `urut` (`terbaru` (bawaan) | `anggaran` | `judul` | `pengusul`), `page`, `limit`
(bawaan 20, maks 100). Respons + `meta {page, limit, total}`:

```json
{
  "id": 451,
  "judul": "Sistem Uji Coba Golang",
  "jenis": "penelitian",
  "status": "disetujui",
  "tahapan": { "kode": "pelaksanaan", "label": "Pelaksanaan Kegiatan", "urutan": 2 },
  "anggaran": "15000000.5",
  "submittedAt": "2026-10-25T03:00:00.000Z",
  "approvedAt": "2026-10-25T03:10:00.000Z",
  "createdAt": "...",
  "updatedAt": "...",
  "pengusul": { "id": 9, "name": "Dosen 1", "fullName": "Dr. Dosen 1, M.T", "nidn": "0100000001", "programStudi": "Teknik Informatika" },
  "periode": { "id": 5, "nama": "Penelitian Semester Ganjil 2025", "tahun": 2025 },
  "jumlahAnggota": 3,
  "laporan": { "id": 470, "status": "draft", "realisasiAnggaran": null }
}
```

`tahapan` = progres kegiatan (seleksi usulan → pelaksanaan → seleksi lanjutan → pasca pelaksanaan),
`laporan` `null` bila belum ada, `jumlahAnggota` = anggota yang sudah menerima undangan.

#### `GET /monitoring/dosen`

Dosen yang sudah memasukkan proposal (sesuai filter), urut jumlah proposal terbanyak. `page`/`limit` +
`meta` (total = jumlah dosen):

```json
{
  "dosen": { "id": 9, "name": "Dosen 1", "fullName": "Dr. Dosen 1, M.T", "email": "dosen1@lppm.dev", "nidn": "0100000001", "programStudi": "Teknik Informatika", "jabatanFungsional": "Lektor" },
  "jumlahProposal": 3,
  "perJenis": { "penelitian": 2, "pengabdian": 1 },
  "perStatus": { "diajukan": 0, "review": 1, "revisi": 0, "disetujui": 2, "ditolak": 0 },
  "totalAnggaran": "45000000",
  "anggaranDisetujui": "30000000",
  "terakhirDiajukanAt": "2026-10-25T03:00:00.000Z"
}
```

Untuk melihat proposal satu dosen: `GET /monitoring/proposals?search=<NIDN>` atau `GET /proposals?search=`.

### Akun contoh `@email.com`

`go run ./cmd/seed-email` (setelah `go run ./cmd/migrate`; aman diulang, akun yang sudah ada dilewati):

| Email | Peran | Password |
|---|---|---|
| `admin@email.com` | admin | `admin123456` |
| `ketua@email.com` | ketua_lppm | `ketua123456` |
| `ketuastmik@email.com` | ketua_stmik | `ketuastmik123` |
| `dosen@email.com` | dosen | `dosen123456` |
| `reviewer@email.com` | reviewer | `reviewer123` |
| `mahasiswa@email.com` | mahasiswa | `mhs1234567` |

### Untuk frontend

`DashboardLayout`/`Sidebar` memilih halaman dari peran pertama: perlu menu & dashboard untuk
`ketua_stmik` (mis. Dashboard dengan `GET /monitoring/ringkasan`, halaman **Pemantauan Proposal**
dengan tab Proposal (`/monitoring/proposals`) & Dosen (`/monitoring/dosen`), detail via
`GET /proposals/:id`, Cetak rekap via `GET /export/proposals`), tanpa tombol aksi tulis. Tambahkan juga
label peran "Ketua STMIK" di tempat yang menampilkan nama peran.

---

## 25. Luaran prioritas (jurnal & poster) + admin mengunduh luaran

### 25.1 Jenis luaran baru `poster` & prioritas

- Jenis luaran (`LuaranKegiatan.jenis`, `POST/PATCH /luaran`) kini juga menerima **`poster`**.
- **Jurnal dan poster adalah luaran prioritas**: selalu ditampilkan paling atas. Bukan wajib — dosen
  tetap boleh memilih jenis lain.

**`GET /api/v1/luaran/jenis`** (semua user login) — pakai ini untuk dropdown jenis di editor Target
Luaran (menggantikan daftar statis `LUARAN_JENIS` di frontend):

```json
[
  { "kode": "jurnal", "label": "Artikel jurnal", "prioritas": true },
  { "kode": "poster", "label": "Poster", "prioritas": true },
  { "kode": "prosiding", "label": "Prosiding seminar", "prioritas": false },
  { "kode": "hki", "label": "Hak Kekayaan Intelektual (HKI)", "prioritas": false },
  { "kode": "buku", "label": "Buku", "prioritas": false },
  { "kode": "produk", "label": "Produk / teknologi tepat guna", "prioritas": false },
  { "kode": "media_massa", "label": "Video / publikasi media massa", "prioritas": false },
  { "kode": "lainnya", "label": "Lainnya", "prioritas": false }
]
```

**`GET /api/v1/master/luaran`** (pilihan cepat "Tambah dari daftar luaran"): item berjenis jurnal/poster
kini **di urutan teratas** dan setiap item luaran punya field baru **`prioritas`** (`true`/`false`).
Ditambahkan 2 pilihan: "Poster ilmiah (seminar / pameran)" dan "Poster hasil kegiatan pengabdian"
(khusus pengabdian), `jenisLuaran: "poster"`.

**`GET /api/v1/luaran/stats`**: key baru `poster` (jumlah poster yang dapat diklaim, seperti `jurnal`),
dan `perJenis` memuat `poster` (urutan: jurnal, poster, prosiding, …).

Saran tampilan: beri badge "Prioritas" pada jurnal & poster, letakkan di atas, atau sarankan dosen
menambah minimal satu luaran prioritas.

### 25.2 Admin mengunduh luaran dosen

Semua endpoint di bawah **khusus admin** (selain admin → 403 `Forbidden: insufficient permissions`).

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/luaran` | Daftar semua item luaran + proposal + dosen (paginasi) |
| GET | `/api/v1/luaran/unduh-csv` | Rekap luaran sesuai filter → file **CSV** (buka di Excel) |
| GET | `/api/v1/luaran/unduh-zip` | Semua **file bukti** sesuai filter + `daftar-luaran.csv` → file **ZIP** |
| GET | `/api/v1/luaran/:id/bukti` | Satu file bukti (endpoint lama; admin sudah boleh) |

**Filter** (query, semua opsional, berlaku untuk ketiga endpoint):

| Query | Nilai | Arti |
|---|---|---|
| `jenis` | `jurnal`, `poster`, `prosiding`, `hki`, `buku`, `produk`, `media_massa`, `lainnya` | jenis luaran |
| `prioritas` | `true` / `false` | hanya jurnal+poster / selain itu |
| `status` | `belum` / `tercapai` | status capaian |
| `dapatDiklaim` | `true` / `false` | tercapai **dan** laporan disetujui |
| `adaBukti` | `true` / `false` | punya file atau link bukti |
| `jenisKegiatan` | `penelitian` / `pengabdian` | jenis proposal |
| `proposalId`, `periodeId`, `tahun` | angka | proposal / periode / tahun periode |
| `search` | teks | target, judul capaian, judul proposal, nama/NIDN dosen |

Khusus `GET /luaran`: `page` (bawaan 1), `limit` (bawaan 20, maks 100) → `meta {page, limit, total}`.
Khusus CSV/ZIP: `pemisah=titikkoma` (CSV memakai `;`, cocok untuk Excel berbahasa Indonesia; bawaan koma).
Urutan selalu: luaran prioritas dulu, lalu yang terakhir diubah. Nilai filter salah → 422.

**Bentuk item `GET /luaran`:**

```json
{
  "id": 88,
  "jenis": "jurnal",
  "jenisLabel": "Artikel jurnal",
  "prioritas": true,
  "target": "Jurnal SINTA 3",
  "targetTanggal": "2099-12-31T00:00:00.000Z",
  "status": "tercapai",
  "judulCapaian": "Artikel di Jurnal X",
  "keterangan": null,
  "tercapaiAt": "2026-10-26T00:00:00.000Z",
  "buktiUrl": "https://jurnal.example/artikel/1",
  "buktiFile": { "nama": "bukti.pdf", "mime": "application/pdf", "ukuran": 120, "unduhUrl": "/luaran/88/bukti" },
  "dapatDiklaim": true,
  "proposal": {
    "id": 640, "judul": "Proposal dengan luaran", "jenis": "penelitian", "status": "disetujui",
    "laporanStatus": "disetujui",
    "periode": { "id": 5, "nama": "Penelitian Semester Ganjil 2025", "tahun": 2025 }
  },
  "pengusul": { "id": 13, "name": "Dosen 5", "fullName": "Dr. Dosen 5, M.T", "nidn": "0100000005", "programStudi": "Teknik Informatika" },
  "createdAt": "...",
  "updatedAt": "...",
  "tepatWaktu": true
}
```

- `buktiFile` `null` bila tidak ada file (bisa saja hanya `buktiUrl`). `unduhUrl` relatif ke base URL API
  dan **perlu token** → unduh lewat axios `responseType: 'blob'`.
- `tepatWaktu`: `true/false` bila tercapai & punya target tanggal, selain itu `null`.

**CSV** (`rekap-luaran-YYYYMMDD.csv`, UTF-8 ber-BOM): kolom ID Luaran, Jenis, Prioritas, Target, Tanggal
Target, Status, Judul Capaian, Keterangan, Tanggal Tercapai, Tepat Waktu, Link Bukti, File Bukti, Dapat
Diklaim, ID Proposal, Judul Proposal, Jenis Kegiatan, Status Proposal, Status Laporan, Dosen Pengusul,
NIDN, Program Studi, Periode, Tahun.

**ZIP** (`luaran-YYYYMMDD.zip`):

```
daftar-luaran.csv                         ← kolom CSV di atas + "File di ZIP"
bukti/jurnal/88_Dr_Dosen_5_M.T_bukti.pdf  ← bukti/<jenis>/<id luaran>_<nama dosen>_<nama file asli>
bukti/poster/91_..._poster.png
```

Item yang hanya punya link (tanpa file) tetap tercantum di CSV (kolom Link Bukti). Maksimal **1000 item**
per unduhan CSV/ZIP; lebih dari itu → 400 `"Terlalu banyak luaran (N). Persempit filter, maksimal 1000 per unduhan."`.
Unduhan CSV/ZIP dicatat di log aktivitas (`luaran.unduh_csv`, `luaran.unduh_zip`).

**Contoh unduh di frontend:**

```js
const res = await api.get('/luaran/unduh-zip', { params: { prioritas: true, periodeId }, responseType: 'blob' })
const url = URL.createObjectURL(res.data)
const a = Object.assign(document.createElement('a'), { href: url, download: 'luaran.zip' })
a.click(); URL.revokeObjectURL(url)
```

Saran halaman admin "Luaran Dosen": tabel `GET /luaran` (badge Prioritas, jenis, target, status, dosen,
proposal/periode, bukti: tombol unduh file / buka link), filter di atas, tombol **Unduh CSV** & **Unduh
semua bukti (ZIP)** yang memakai filter yang sama.

---

## 26. Rumpun ilmu bidang komputer

Pilihan **rumpun ilmu** kini hanya bidang komputer (sesuai STMIK). 12 rumpun ilmu umum DIKTI
(MIPA, Kedokteran, Ekonomi, dll.) **dinonaktifkan** — tidak dihapus, jadi proposal lama yang sudah
memakainya tetap tampil apa adanya.

### Daftar pilihan

`GET /api/v1/master/rumpun-ilmu` (login; endpoint sama seperti sebelumnya) sekarang mengembalikan:

| urutan | nama |
|---|---|
| 1 | Ilmu Komputer |
| 2 | Teknik Informatika |
| 3 | Sistem Informasi |
| 4 | Sistem Komputer |
| 5 | Teknik Komputer |
| 6 | Manajemen Informatika |
| 7 | Teknologi Informasi |
| 8 | Rekayasa Perangkat Lunak |
| 9 | Jaringan Komputer dan Keamanan Siber |
| 10 | Kecerdasan Buatan dan Sains Data |
| 11 | Sistem Tertanam dan Internet of Things (IoT) |
| 12 | Multimedia dan Teknologi Game |

Bentuk item tidak berubah: `{ id, nama, jenisKegiatan, jenisLuaran, urutan, isAktif, createdAt, updatedAt }`.
Admin tetap bisa menambah/mengubah/menonaktifkan lewat `POST/PATCH/DELETE /master/rumpun-ilmu`
(`?semua=true` menampilkan yang nonaktif juga).

### Validasi (baru)

`rumpunIlmu` **harus salah satu nama aktif** di daftar di atas (spasi di awal/akhir dirapikan) saat
dikirim ke:

- `POST/PATCH /dosen/proposals[/:id]` dan `POST/PATCH /proposals[/:id]`
- `POST /laporan` dan `PATCH /laporan/:id`

Selain itu → **400**:

```json
{ "success": false, "message": "Rumpun ilmu \"Ilmu Kedokteran\" tidak tersedia. Pilih dari daftar rumpun ilmu bidang komputer (GET /master/rumpun-ilmu)." }
```

`rumpunIlmu: ""` → dikosongkan (`null`). Tidak mengirim `rumpunIlmu` → nilai lama tidak disentuh (data
lama dengan rumpun umum tetap aman selama tidak diubah).

### Rumpun ilmu di laporan (Isi Laporan)

- Saat laporan dibuat, `rumpunIlmu` **disalin dari proposal** (seperti sebelumnya); `POST /laporan` kini
  juga boleh membawa `rumpunIlmu` sendiri.
- **Baru:** `PATCH /laporan/:id` menerima `rumpunIlmu` (saat laporan draft/revisi) — bisa diubah
  terpisah dari proposal, sama seperti `kataKunci`. Proposal asal tidak ikut berubah.

### Untuk frontend

- Wizard **Usulan** (langkah Identitas) sudah memakai `GET /master/rumpun-ilmu` → otomatis hanya bidang
  komputer. Bila proposal lama punya nilai di luar daftar, tampilkan nilainya sebagai teks dan minta
  dosen memilih ulang bila ingin mengubah.
- **Isi Laporan** (`LaporanIsiPage.jsx`, Informasi Laporan): ganti tampilan baca-saja "Rumpun Ilmu" menjadi
  dropdown dari `GET /master/rumpun-ilmu`, nilai awal = `laporan.rumpunIlmu`, kirim `rumpunIlmu` di
  `PATCH /laporan/:id` (ikut Simpan draf).
