import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import SearchPopup from './SearchPopup'
import { cariGlobal, konteksPencarian } from '../utils/globalSearch'

// Tombol cari melayang (kanan bawah) + pintasan Ctrl/⌘ + F → popup pencarian
// global (halaman + data sesuai peran, lihat utils/globalSearch.js).
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

export default function GlobalSearch({ roleNames, isReviewer }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const roleKey = roleNames.join(',')
  const ctx = useMemo(() => konteksPencarian(roleKey.split(','), isReviewer), [roleKey, isReviewer])
  const fetchRecs = useCallback((q) => cariGlobal(q, ctx), [ctx])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Cari (${MOD_KEY} + F)`}
        className="global-search-fab fixed bottom-5 right-5 z-20 grid size-14 place-items-center rounded-full bg-navy-800 text-white shadow-lg ring-4 ring-white transition-colors hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-400 lg:bottom-6 lg:right-6"
      >
        <Search className="size-6" aria-hidden="true" />
        <span className="sr-only">Cari ({MOD_KEY} + F)</span>
      </button>
      <SearchPopup
        open={open}
        onClose={() => setOpen(false)}
        title="Pencarian"
        placeholder="Cari halaman, proposal, laporan…"
        minChars={1}
        fetchRecs={fetchRecs}
        onSelect={(item) => navigate(item.to)}
        hint={`Ketik nama halaman, judul proposal/laporan${ctx.peran === 'pengelola' ? ', atau nama user' : ''}. Buka kapan saja dengan ${MOD_KEY} + F.`}
      />
    </>
  )
}
