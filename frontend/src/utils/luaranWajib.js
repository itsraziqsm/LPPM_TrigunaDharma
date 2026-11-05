// ---------------------------------------------------------------------------
// Luaran wajib proposal (keputusan kampus): setiap usulan penelitian & pengabdian wajib menargetkan
// **artikel jurnal** dan **poster**. Editor Target Luaran (UsulanPage) menyiapkan keduanya sebagai item
// bawaan (ikut tersimpan ke /luaran saat proposal disimpan), jenisnya terkunci & tidak bisa dihapus;
// teks target bawaan = nama di master luaran (seed backend) dan tetap bisa diubah.
// Backend masih menganggap luaran opsional (new-api.md §25) — penegakan di server: docs/waitingApi-list.md W-57.
// ---------------------------------------------------------------------------

export const LUARAN_WAJIB = ['jurnal', 'poster']

const TARGET_BAWAAN = {
  penelitian: {
    jurnal: 'Artikel jurnal nasional terakreditasi (SINTA)',
    poster: 'Poster ilmiah (seminar / pameran)',
  },
  pengabdian: {
    jurnal: 'Artikel jurnal pengabdian kepada masyarakat',
    poster: 'Poster hasil kegiatan pengabdian',
  },
}

export const targetBawaan = (jenisKegiatan, jenisLuaran) => (TARGET_BAWAAN[jenisKegiatan] || TARGET_BAWAAN.penelitian)[jenisLuaran] || ''

// Kunci item yang berstatus wajib = item pertama untuk tiap jenis wajib.
export function kunciWajib(items) {
  const out = new Set()
  for (const j of LUARAN_WAJIB) {
    const it = items.find((i) => i.jenis === j)
    if (it) out.add(it.key)
  }
  return out
}

// Jenis wajib yang belum ada di daftar.
export const wajibKurang = (items) => LUARAN_WAJIB.filter((j) => !items.some((i) => i.jenis === j))

// Tambahkan item bawaan untuk jenis wajib yang belum ada; item wajib diletakkan paling atas (jurnal, poster),
// target lain mengikuti urutan semula. `buat()` = pembuat item baru kosong.
export function lengkapiWajib(items, jenisKegiatan, buat) {
  const kurang = wajibKurang(items)
  if (!kurang.length) return items
  const semua = [...items, ...kurang.map((j) => ({ ...buat(), jenis: j, target: targetBawaan(jenisKegiatan, j) }))]
  const wajib = LUARAN_WAJIB.map((j) => semua.find((i) => i.jenis === j))
  return [...wajib, ...semua.filter((i) => !wajib.includes(i))]
}
