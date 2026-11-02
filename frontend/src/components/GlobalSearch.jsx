import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppWindow, LifeBuoy, MessageSquareText, Search } from 'lucide-react'
import SearchPopup from './SearchPopup'
import useTampil from '../hooks/useTampil'
import { alertDialog } from '../utils/dialog'
import { kontakTermuat, muatKontakAdmin, nomorAdmin, pesanKendala, tautanWhatsApp } from '../utils/hubungiAdmin'
import { ROLE_LABEL } from '../pages/dashboard/format'
import { cariGlobal, konteksPencarian } from '../utils/globalSearch'
import useAuthStore from '../store/authStore'
import { catatCari, hapusRiwayatCari, riwayatCari } from '../utils/riwayat'

// Tombol Alat melayang (kanan bawah, ikon jendela) → panel kecil berisi 3 alat:
//   1. Pencarian (Ctrl/⌘ + F) → popup pencarian global (halaman + data sesuai peran, utils/globalSearch.js)
//   2. Bantuan (Ctrl/⌘ + H)       → halaman /bantuan (sementara 501)
//   3. Hubungi Admin (Ctrl/⌘ + M) → WhatsApp admin (utils/hubungiAdmin.js) dengan pesan templat berisi
//      jejak halaman saat ini, nama & peran pelapor; nomor dari GET /kontak-admin (W-50), cadangan VITE_ADMIN_WA
// Pintasan tetap berfungsi walau panel tertutup. Panel: Esc / klik di luar = tutup.
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

// Alat 3: buka WhatsApp admin di tab baru dengan pesan templat. Nomor dari GET /kontak-admin (dimuat saat
// tombol Alat terpasang); bila belum termuat, tab disiapkan dulu secara sinkron agar tidak diblokir popup.
async function hubungiAdmin(user) {
  const peran = (user?.roles || []).map((r) => ROLE_LABEL[r?.name || r] || r?.name || r)[0]
  const pesan = pesanKendala({ nama: user?.fullName || user?.name, peran })
  const tab = kontakTermuat() ? null : window.open('', '_blank')
  await muatKontakAdmin()
  const nomor = nomorAdmin()
  if (!nomor) {
    tab?.close()
    alertDialog({
      tone: 'info',
      title: 'Nomor admin belum diatur',
      message: 'Nomor WhatsApp admin belum dikonfigurasi pada sistem. Silakan hubungi admin LPPM secara langsung.',
    })
    return
  }
  const url = tautanWhatsApp(pesan, nomor)
  if (tab) {
    tab.opener = null
    tab.location.href = url
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export default function GlobalSearch({ roleNames, isReviewer }) {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState(false)
  const { pasang, tampil } = useTampil(panel, 180)
  const wadahRef = useRef(null)
  const navigate = useNavigate()
  const roleKey = roleNames.join(',')
  const ctx = useMemo(() => konteksPencarian(roleKey.split(','), isReviewer), [roleKey, isReviewer])
  const fetchRecs = useCallback((q) => cariGlobal(q, ctx), [ctx])
  // Riwayat per user (maks 4 hasil terakhir dibuka), tampil saat kolom cari kosong.
  const user = useAuthStore((s) => s.user)
  const userId = user?.id
  const [recent, setRecent] = useState([])
  const buka = () => {
    setRecent(riwayatCari(userId))
    setOpen(true)
  }

  // Kontak admin dimuat di awal agar Hubungi Admin bisa langsung membuka WhatsApp.
  useEffect(() => {
    muatKontakAdmin()
  }, [])

  const ALAT = [
    { kunci: 'f', label: 'Pencarian', desc: 'Cari halaman, proposal, laporan', icon: Search, jalankan: buka },
    { kunci: 'h', label: 'Bantuan', desc: 'Panduan penggunaan sistem', icon: LifeBuoy, jalankan: () => navigate('/bantuan') },
    { kunci: 'm', label: 'Hubungi Admin', desc: 'Laporkan kendala lewat WhatsApp', icon: MessageSquareText, jalankan: () => hubungiAdmin(user) },
  ]

  // Pintasan Ctrl/⌘ + F/H/M — aktif walau panel tertutup.
  useEffect(() => {
    const aksi = {
      f: () => {
        setRecent(riwayatCari(userId))
        setOpen(true)
      },
      h: () => navigate('/bantuan'),
      m: () => hubungiAdmin(user),
    }
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const jalankan = aksi[e.key.toLowerCase()]
      if (!jalankan) return
      e.preventDefault()
      setPanel(false)
      jalankan()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userId, user, navigate])

  // Panel: tutup dengan Esc atau klik di luar.
  useEffect(() => {
    if (!panel) return
    const onDown = (e) => wadahRef.current && !wadahRef.current.contains(e.target) && setPanel(false)
    const onEsc = (e) => e.key === 'Escape' && setPanel(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [panel])

  return (
    <>
      <div ref={wadahRef} className="global-search-fab fixed bottom-5 right-5 z-20 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6">
        {/* Panel kecil 3 alat (di atas tombol, berlabuh kanan bawah) */}
        {pasang ? (
          <div
            id="panel-alat"
            role="menu"
            aria-label="Alat"
            className={`w-80 max-w-[calc(100vw-2.5rem)] origin-bottom-right rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl transition-[opacity,translate,scale] duration-200 ease-out motion-reduce:transition-none ${
              tampil ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'
            }`}
          >
            <p className="px-3 pb-1 pt-2 text-xs font-semibold text-slate-500">Alat</p>
            {ALAT.map((a) => (
              <button
                key={a.kunci}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPanel(false)
                  a.jalankan()
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-navy-50 focus-visible:bg-navy-50 focus-visible:outline-none"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                  <a.icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-navy-950">{a.label}</span>
                  <span className="block truncate text-xs text-slate-500">{a.desc}</span>
                </span>
                <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500">
                  {MOD_KEY} + {a.kunci.toUpperCase()}
                </kbd>
              </button>
            ))}
          </div>
        ) : null}

        {/* Bulat 56px; saat hover/fokus melebar ke kiri (berlabuh di kanan) menjadi pil "Alat" + ikon jendela. */}
        <button
          type="button"
          onClick={() => setPanel((v) => !v)}
          title="Alat"
          aria-label="Alat"
          aria-haspopup="menu"
          aria-expanded={panel}
          aria-controls={panel ? 'panel-alat' : undefined}
          className="group flex h-14 items-center rounded-full bg-navy-800 px-4 text-white shadow-lg ring-4 ring-white transition-colors duration-300 hover:bg-navy-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-400"
        >
          <span
            aria-hidden="true"
            className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-[max-width,opacity,margin] duration-300 ease-out group-hover:mr-2 group-hover:max-w-24 group-hover:opacity-100 group-focus-visible:mr-2 group-focus-visible:max-w-24 group-focus-visible:opacity-100 motion-reduce:transition-none"
          >
            Alat
          </span>
          <AppWindow className="size-6 shrink-0" aria-hidden="true" />
        </button>
      </div>
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
