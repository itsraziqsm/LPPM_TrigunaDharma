import { useLayoutEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Sorot item navigasi aktif yang MELUNCUR ke item yang diklik (Sidebar). Satu kotak putih (kartu +
// garis brass) diposisikan absolut di belakang tautan `a[aria-current="page"]` di dalam elemen `wadah`
// (dari ref-callback berbasis state, agar tersedia saat efek pertama berjalan);
// posisi & ukuran diukur ulang saat pindah halaman (`kunci`), saat wadah berubah ukuran (grup menu
// membuka/menutup — ResizeObserver mengikuti animasinya), dan saat jendela diubah ukurannya.
// Tautan aktif di dalam grup yang tertutup (`inert`) → sorot memudar. Gerak: translate + width +
// height 300 ms; posisi pertama tanpa animasi; hormati prefers-reduced-motion.
//   varian: 'menu' (garis brass di tepi kiri item) | 'rail' (garis di luar item, rail ciut)
// ---------------------------------------------------------------------------

export default function SorotNav({ wadah, kunci, varian = 'menu' }) {
  const [pos, setPos] = useState(null) // { x, y, w, h, tampil }
  const [animasi, setAnimasi] = useState(false)

  useLayoutEffect(() => {
    if (!wadah) return undefined
    const ukur = () => {
      const el = wadah.querySelector('a[aria-current="page"]')
      if (!el || el.closest('[inert]')) {
        setPos((p) => (p ? { ...p, tampil: false } : null))
        return
      }
      const a = wadah.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      setPos({ x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height, tampil: true })
    }
    ukur()
    const ro = new ResizeObserver(ukur)
    ro.observe(wadah)
    window.addEventListener('resize', ukur)
    // Aktifkan transisi setelah posisi pertama terpasang (tidak meluncur dari pojok saat dibuka).
    const id = requestAnimationFrame(() => setAnimasi(true))
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', ukur)
      cancelAnimationFrame(id)
    }
  }, [wadah, kunci])

  if (!pos) return null
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 top-0 z-0 rounded-lg bg-white shadow-sm ring-1 ring-inset ring-navy-100 motion-reduce:transition-none ${
        animasi ? 'transition-[translate,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]' : ''
      } ${pos.tampil ? 'opacity-100' : 'opacity-0'}`}
      style={{ translate: `${pos.x}px ${pos.y}px`, width: pos.w, height: pos.h }}
    >
      <span className={`absolute inset-y-2 w-0.5 rounded-full bg-brass-400 ${varian === 'rail' ? '-left-[0.875rem]' : 'left-0'}`} />
    </span>
  )
}
