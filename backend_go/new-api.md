# API Baru — Laporan & Pemecahan Tabel Proposal

Dokumen ini untuk **developer frontend**. Isinya perubahan backend yang terlihat dari sisi
API: field baru di endpoint proposal lama, dan endpoint baru `/api/v1/laporan`.

- Base URL: `VITE_API_URL` (default `http://localhost:3000/api/v1`)
- Semua endpoint butuh header `Authorization: Bearer <accessToken>`
- Format respons sama seperti endpoint lain: `{ success, message, data[, meta] }`
- Migrasi DB: `migrations/20261024000000_split_proposal_penelitian_pengabdian`

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
  "catatanRevisi": null,
  // ... field lain tetap sama
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
| `judul`, `abstrak`, `anggaran`, `luaran`, `periode`, `jenis` | Disalin dari proposal saat laporan dibuat. `judul`/`abstrak` bisa diubah. |
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
