// ---------------------------------------------------------------------------
// Luaran wajib proposal (keputusan kampus): setiap usulan penelitian & pengabdian wajib menargetkan
// **artikel jurnal** dan **poster**. Editor Target Luaran (UsulanPage) menyiapkan keduanya sebagai item
// bawaan (ikut tersimpan ke /luaran saat proposal disimpan), jenisnya terkunci & tidak bisa dihapus;
// teks target bawaan = nama di master luaran (seed backend) dan tetap bisa diubah.
// Server menegakkan aturan ini (W-57, new-api.md §32): submit tanpa keduanya → 400, hapus/ganti jenis item terakhir → 409.
// Daftar jenis wajib dari server = item `wajib: true` di GET /luaran/jenis (`wajibDariJenis`); LUARAN_WAJIB = cadangan.
// ---------------------------------------------------------------------------

export const LUARAN_WAJIB = ['jurnal', 'poster']

// Jenis wajib dari daftar GET /luaran/jenis ([{kode, wajib}]); backend lama tanpa field `wajib` → cadangan LUARAN_WAJIB.
export function wajibDariJenis(jenis) {
  if (!Array.isArray(jenis) || !jenis.some((j) => j && 'wajib' in j)) return LUARAN_WAJIB
  return jenis.filter((j) => j.wajib).map((j) => j.kode)
}

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
export function kunciWajib(items, wajib = LUARAN_WAJIB) {
  const out = new Set()
  for (const j of wajib) {
    const it = items.find((i) => i.jenis === j)
    if (it) out.add(it.key)
  }
  return out
}

// Jenis wajib yang belum ada di daftar.
export const wajibKurang = (items, wajib = LUARAN_WAJIB) => wajib.filter((j) => !items.some((i) => i.jenis === j))

// Tambahkan item bawaan untuk jenis wajib yang belum ada; item wajib diletakkan paling atas (jurnal, poster),
// target lain mengikuti urutan semula. `buat()` = pembuat item baru kosong.
export function lengkapiWajib(items, jenisKegiatan, buat, daftarWajib = LUARAN_WAJIB) {
  const kurang = wajibKurang(items, daftarWajib)
  if (!kurang.length) return items
  const semua = [...items, ...kurang.map((j) => ({ ...buat(), jenis: j, target: targetBawaan(jenisKegiatan, j) }))]
  const wajib = daftarWajib.map((j) => semua.find((i) => i.jenis === j))
  return [...wajib, ...semua.filter((i) => !wajib.includes(i))]
}
