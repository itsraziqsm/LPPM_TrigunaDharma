# public/

Berkas statis yang disajikan apa adanya oleh Vite (diakses dari akar URL, mis. `/brand/logo-lppm.webp`).

| Folder | Isi | Dipakai di |
|---|---|---|
| `brand/` | `logo-lppm.webp` — lencana resmi LPPM STMIK Triguna Dharma (juga favicon) | `src/components/LogoLppm.jsx`, `index.html` |
| `images/errors/` | Ilustrasi halaman galat per kode HTTP (WebP, latar transparan): `400`, `401`, `403`, `404`, `408-504` (dipakai 408 & 504), `429`, `500`, `501`, `502`, `503`. | `src/utils/errorCodes.js` → `src/components/ErrorState.jsx` |
| `templates/` | `template-proposal.docx` — templat dokumen proposal untuk diunduh dosen | `src/pages/UsulanPage.jsx` (langkah Dokumen) |
| `legacy/` | `icons.svg` — sprite bawaan template Vite | hanya `src/App.jsx` (tidak dipakai) |

Menambah berkas: letakkan di folder kategori yang sesuai (buat folder baru bila perlu), lalu
rujuk dengan path absolut dari akar (`/kategori/nama.ext`). Gambar sebaiknya WebP.
