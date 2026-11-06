// ---------------------------------------------------------------------------
// Pokok luaran dari teks ringkasan `luaran` proposal (mis. "Jurnal: Artikel SINTA 3; Poster: Poster seminar") →
// daftar jenis singkat tanpa duplikat: ['Jurnal', 'Poster']. Teks lama bebas (tanpa awalan "Jenis:") dikenali
// lewat kata kunci; yang tidak dikenali = 'Lainnya'. Dipakai kolom Luaran tabel Riwayat (KegiatanPage, mode ringkas).
// ---------------------------------------------------------------------------

const POLA = [
  ['Jurnal', /jurnal|artikel|sinta|scopus/i],
  ['Poster', /poster/i],
  ['Prosiding', /prosiding|seminar|konferensi/i],
  ['HKI', /hki|kekayaan intelektual|paten|hak cipta/i],
  ['Buku', /buku|modul/i],
  ['Produk / TTG', /produk|ttg|teknologi tepat guna|prototipe|purwarupa|aplikasi/i],
  ['Media massa', /media|video|berita/i],
]

export function luaranPokok(teks) {
  if (!teks || !String(teks).trim()) return []
  const hasil = []
  for (const bagian of String(teks).split(/[;\n]+/)) {
    const b = bagian.trim()
    if (!b) continue
    const kepala = b.includes(':') ? b.slice(0, b.indexOf(':')) : b
    const cocok = POLA.find(([, re]) => re.test(kepala)) || POLA.find(([, re]) => re.test(b))
    const label = cocok ? cocok[0] : 'Lainnya'
    if (!hasil.includes(label)) hasil.push(label)
  }
  return hasil
}
