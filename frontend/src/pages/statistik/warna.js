// Warna data Statistik (dicek validator palet skill dataviz) + persen 1 desimal.
export const WARNA = {
  navy: '#4e69a6',
  brass: '#b8924a',
  hijau: '#2f855a',
  merah: '#c0392b',
  track: '#e2e8f0',
}

export const persen = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)
export const fmtPersen = (v) => `${String(v).replace('.', ',')}%`
