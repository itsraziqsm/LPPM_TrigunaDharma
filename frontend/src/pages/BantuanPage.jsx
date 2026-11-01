import Breadcrumb from '../components/Breadcrumb'
import ErrorState from '../components/ErrorState'

// Bantuan (/bantuan, semua peran; dibuka dari tombol Alat atau Ctrl/⌘ + H): belum dibangun —
// sistematika panduan menyusul. Ditampilkan sebagai 501 Not Implemented.
export default function BantuanPage() {
  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">Bantuan</h1>
        <Breadcrumb items={[{ label: 'Bantuan' }]} />
      </header>

      <div className="card px-5 py-10 sm:px-8">
        <ErrorState
          code={501}
          as="h2"
          title="Halaman Bantuan belum tersedia"
          desc="Panduan penggunaan sistem sedang disiapkan."
          note="Sementara itu, gunakan Hubungi Admin pada tombol Alat (kanan bawah) bila mengalami kendala."
          actions={[{ to: '/dashboard', label: 'Kembali ke Dashboard' }]}
        />
      </div>
    </div>
  )
}
