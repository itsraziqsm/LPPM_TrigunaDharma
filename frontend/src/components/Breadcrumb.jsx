import { Link } from 'react-router-dom'

// Breadcrumb bersama (gaya sama dengan breadcrumb halaman lain): "Home / … / halaman ini".
// items: [{ label, to? }] — item terakhir = halaman saat ini (tanpa tautan). Home selalu pertama.
export default function Breadcrumb({ items = [], className = '' }) {
  const semua = [{ label: 'Home', to: '/dashboard' }, ...items]
  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {semua.map((it, i) => {
          const terakhir = i === semua.length - 1
          return (
            <li key={`${it.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? (
                <span aria-hidden="true" className="text-slate-400">
                  /
                </span>
              ) : null}
              {terakhir ? (
                <span aria-current="page" className="max-w-[16rem] truncate text-slate-500" title={it.label}>
                  {it.label}
                </span>
              ) : it.to ? (
                <Link to={it.to} className="font-medium text-navy-600 hover:text-navy-800">
                  {it.label}
                </Link>
              ) : (
                <span className="text-slate-500">{it.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
