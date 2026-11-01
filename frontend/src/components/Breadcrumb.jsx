import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

// Breadcrumb bersama (gaya sama dengan breadcrumb halaman lain): "Home / … / halaman ini".
// items: [{ label, to? }] — item terakhir = halaman saat ini (tanpa tautan). Home selalu pertama.
// size: 'sm' (bawaan) | 'base' (kepala Dashboard & Pengaturan).
// Layar kecil (< lg): breadcrumb di halaman disembunyikan dan dipindah (portal) ke bilah atas
// ponsel di sebelah ikon menu (`#jejak-navbar` di Sidebar.jsx) — ringkas: "… / induk / halaman".

const SLOT_ID = 'jejak-navbar'

function JejakNavbar({ semua }) {
  // Maks 2 tingkat terakhir; sisanya diringkas jadi "…".
  const tampil = semua.length > 2 ? semua.slice(-2) : semua
  const dipotong = semua.length > 2
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
      <ol className="flex min-w-0 items-center gap-1.5">
        {dipotong ? (
          <li aria-hidden="true" className="shrink-0 text-white/50">
            … /
          </li>
        ) : null}
        {tampil.map((it, i) => {
          const terakhir = i === tampil.length - 1
          return (
            <li key={`${it.label}-${i}`} className={`flex items-center gap-1.5 ${terakhir ? 'min-w-0' : 'max-w-[40%] shrink-0'}`}>
              {i > 0 ? (
                <span aria-hidden="true" className="text-white/40">
                  /
                </span>
              ) : null}
              {terakhir ? (
                <span aria-current="page" className="truncate font-semibold text-white" title={it.label}>
                  {it.label}
                </span>
              ) : it.to ? (
                <Link to={it.to} className="truncate text-white/70 hover:text-white">
                  {it.label}
                </Link>
              ) : (
                <span className="truncate text-white/60">{it.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default function Breadcrumb({ items = [], className = '', size = 'sm' }) {
  const semua = [{ label: 'Home', to: '/dashboard' }, ...items]
  // Slot di bilah atas ponsel dipasang Sidebar; cari setelah render pertama.
  const [slot, setSlot] = useState(() => (typeof document !== 'undefined' ? document.getElementById(SLOT_ID) : null))
  useEffect(() => {
    if (!slot) setSlot(document.getElementById(SLOT_ID))
  }, [slot])

  return (
    <>
      <nav aria-label="Breadcrumb" className={`${size === 'base' ? 'text-base' : 'text-sm'} ${slot ? 'max-lg:hidden' : ''} ${className}`}>
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
      {slot ? createPortal(<JejakNavbar semua={semua} />, slot) : null}
    </>
  )
}
