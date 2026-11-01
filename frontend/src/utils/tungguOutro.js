// Lama animasi outro tombol (TombolProses: titik kanan → pil "Berhasil ✓"); tunggu ini sebelum berpindah halaman.
export const tungguOutro = () =>
  new Promise((r) => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 400 : 1200))
