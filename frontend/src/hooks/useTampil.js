import { useEffect, useState } from 'react'

// Animasi masuk/keluar untuk popover yang dipasang-copot (lonceng notifikasi, saran pencarian).
//   const { pasang, tampil } = useTampil(open)
//   pasang → render elemen; tampil → kelas akhir (opacity-100 translate-y-0) vs awal.
// Saat menutup, elemen tetap terpasang `ms` milidetik agar transisi keluar selesai.
export default function useTampil(open, ms = 200) {
  const [pasang, setPasang] = useState(open)
  const [tampil, setTampil] = useState(open)
  useEffect(() => {
    if (open) {
      setPasang(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setTampil(true)))
      return () => cancelAnimationFrame(raf)
    }
    setTampil(false)
    const t = setTimeout(() => setPasang(false), ms)
    return () => clearTimeout(t)
  }, [open, ms])
  return { pasang, tampil }
}
