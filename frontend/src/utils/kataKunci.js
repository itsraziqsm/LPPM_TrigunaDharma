// Kata kunci diketik dipisah koma → array (dipangkas, kosong dibuang, duplikat
// tanpa beda huruf besar/kecil digabung). Backend: maks 10 × 50 karakter.
export const parseKataKunci = (text) => {
  const seen = new Set()
  return String(text || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()))
}

// Pesan galat validasi kata kunci, atau null bila valid.
export function kataKunciError(text) {
  const kk = parseKataKunci(text)
  if (kk.length > 10) return `Maksimal 10 kata kunci (sekarang ${kk.length}).`
  if (kk.some((k) => k.length > 50)) return 'Setiap kata kunci maksimal 50 karakter.'
  return null
}
