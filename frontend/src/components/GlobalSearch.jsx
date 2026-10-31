import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import SearchPopup from './SearchPopup'
import { cariGlobal, konteksPencarian } from '../utils/globalSearch'
import useAuthStore from '../store/authStore'
import { catatCari, hapusRiwayatCari, riwayatCari } from '../utils/riwayat'

// Tombol cari melayang (kanan bawah) + pintasan Ctrl/⌘ + F → popup pencarian
// global (halaman + data sesuai peran, lihat utils/globalSearch.js).
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

export default function GlobalSearch({ roleNames, isReviewer }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const roleKey = roleNames.join(',')
  const ctx = useMemo(() => konteksPencarian(roleKey.split(','), isReviewer), [roleKey, isReviewer])
  const fetchRecs = useCallback((q) => cariGlobal(q, ctx), [ctx])
  // Riwayat per user (maks 4 hasil terakhir dibuka), tampil saat kolom cari kosong.
  const userId = useAuthStore((s) => s.user?.id)
  const [recent, setRecent] = useState([])
  const buka = () => {
    setRecent(riwayatCari(userId))
    setOpen(true)
  }

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setRecent(riwayatCari(userId))
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userId])

  return (
    <>
      {/* Bulat 56px; saat hover/fokus melebar ke kiri (berlabuh di kanan) menjadi pil "Telusuri" + ikon. */}
      <button
        type="button"
        onClick={buka}
        title={`Telusuri (${MOD_KEY} + F)`}
        aria-label={`Telusuri (${MOD_KEY} + F)`}
        className="global-search-fab group fixed bottom-5 right-5 z-20 flex h-14 items-center rounded-full bg-navy-800 px-4 text-white shadow-lg ring-4 ring-white transition-colors duration-300 hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-400 lg:bottom-6 lg:right-6"
      >
        <span
          aria-hidden="true"
          className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-[max-width,opacity,margin] duration-300 ease-out group-hover:mr-2 group-hover:max-w-24 group-hover:opacity-100 group-focus-visible:mr-2 group-focus-visible:max-w-24 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          Telusuri
        </span>
        <Search className="size-6 shrink-0" aria-hidden="true" />
      </button>
      <SearchPopup
        open={open}
        onClose={() => setOpen(false)}
        title="Pencarian"
        placeholder="Cari halaman, proposal, laporan…"
        minChars={1}
        fetchRecs={fetchRecs}
        recent={recent}
        onClearRecent={() => {
          hapusRiwayatCari(userId)
          setRecent([])
        }}
        onSelect={(item) => {
          catatCari(userId, item)
          navigate(item.to)
        }}
        hint={`Ketik nama halaman, judul proposal/laporan${ctx.peran === 'pengelola' ? ', atau nama user' : ''}. Buka kapan saja dengan ${MOD_KEY} + F.`}
      />
    </>
  )
}
