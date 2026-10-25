import { Link } from 'react-router-dom'

// Breadcrumb halaman konfigurasi di menu Cetak Dokumen.
export default function CetakBreadcrumb({ last }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
            Home
          </Link>
        </li>
        <li aria-hidden="true" className="text-slate-400">/</li>
        <li>
          <Link to="/cetak-dokumen" className="font-medium text-navy-600 hover:text-navy-800">
            Cetak Dokumen
          </Link>
        </li>
        {last ? (
          <>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">
              {last}
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  )
}
