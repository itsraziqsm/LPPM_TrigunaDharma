import { Link } from 'react-router-dom'
import ErrorState from '../components/ErrorState'

// Menu Luaran: fitur belum dibangun, menunggu keputusan/kelanjutan dari pihak
// kampus. Ditampilkan sebagai 501 Not Implemented (lihat docs/waitingApi-list.md).
export default function LuaranPage() {
  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">Luaran</h1>
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">Luaran</li>
          </ol>
        </nav>
      </header>

      <div className="card px-5 py-10 sm:px-8">
        <ErrorState
          code={501}
          as="h2"
          title="Fitur Luaran belum diimplementasikan"
          desc="Halaman ini menunggu kelanjutan perkembangan dari Pihak Kampus."
          note="Sementara itu, target luaran tiap proposal dapat diisi saat mengusulkan kegiatan, dan luaran yang tercapai dicatat pada laporan."
          actions={[{ to: '/kegiatan/penelitian', label: 'Lihat kegiatan' }]}
        />
      </div>
    </div>
  )
}
