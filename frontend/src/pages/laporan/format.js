// Format tampilan untuk halaman laporan.
export const rupiah = (v) =>
  v === null || v === undefined || v === '' ? '—' : `Rp ${Number(v).toLocaleString('id-ID')}`

export const tanggal = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export const hari = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
