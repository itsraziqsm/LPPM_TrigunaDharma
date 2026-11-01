// ---------------------------------------------------------------------------
// Pembungkus daftar/tabel yang dimuat ulang (ganti tab, filter, halaman, cari, setelah aksi):
// data lama TETAP tampil — dipudarkan & tidak bisa diklik — sampai data baru datang, agar tinggi
// area tidak menciut, posisi gulir tidak melompat, dan tidak berkedip. Placeholder "Memuat…"
// hanya untuk muat pertama (belum ada data); pemanggil menampilkannya sendiri saat
// `memuat && data kosong`. Dipakai bersama `IndikatorMemuat` (spinner kecil di kepala kartu).
// ---------------------------------------------------------------------------

export default function AreaMemuat({ memuat, children, className = '' }) {
  return (
    <div
      aria-busy={memuat || undefined}
      className={`transition-opacity duration-150 motion-reduce:transition-none ${memuat ? 'pointer-events-none opacity-50' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function IndikatorMemuat({ teks = 'Memuat', className = '' }) {
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="spinner size-3.5" aria-hidden="true" />
      {teks}
    </span>
  )
}
