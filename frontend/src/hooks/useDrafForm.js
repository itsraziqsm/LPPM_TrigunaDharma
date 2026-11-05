import { useEffect, useRef, useState } from 'react'
import useAuthStore from '../store/authStore'
import { bacaDraf, hapusDraf, kunciDraf, samaNilai, tulisDraf } from '../utils/drafForm'

// ---------------------------------------------------------------------------
// Pengaman isian formulir: isian yang belum disimpan tidak hilang saat halaman di-refresh / tab tertutup.
//   const draf = useDrafForm(nama, nilai, setNilai, { siap })
//   - nama   : kunci unik formulir (mis. `usulan:penelitian:baru`, `laporan-isi:12`); null = nonaktif
//   - nilai  : objek isian (HANYA teks/pilihan — tanpa password & file)
//   - setNilai(v): dipanggil sekali untuk memulihkan draf
//   - siap   : true setelah nilai awal dimuat (mis. data dari server) — pemulihan menunggu ini
// Mengembalikan { dipulihkan, buang(), bersihkan() }:
//   buang()     → kembali ke nilai awal (sebelum dipulihkan) & hapus draf
//   bersihkan([nilaiBaru]) → panggil setelah berhasil disimpan ke server (nilai saat ini = patokan baru, draf dihapus)
// Draf hanya ditulis bila isian berbeda dari patokan (nilai awal / terakhir tersimpan), dengan jeda 400 ms.
// ---------------------------------------------------------------------------

export default function useDrafForm(nama, nilai, setNilai, { siap = true } = {}) {
  const userId = useAuthStore((s) => s.user?.id)
  const kunci = nama ? kunciDraf(userId, nama) : null
  const [dipulihkan, setDipulihkan] = useState(false)
  const patokan = useRef(null) // nilai awal / terakhir tersimpan ke server
  const sebelumPulih = useRef(null)
  const siapTulis = useRef(false)
  const nilaiRef = useRef(nilai)
  const setRef = useRef(setNilai)

  useEffect(() => {
    nilaiRef.current = nilai
    setRef.current = setNilai
  })

  // Pulihkan sekali, setelah nilai awal siap.
  useEffect(() => {
    if (!kunci || !siap || siapTulis.current) return
    const sekarang = nilaiRef.current
    patokan.current = sekarang
    const tersimpan = bacaDraf(kunci)
    if (tersimpan != null && !samaNilai(tersimpan, sekarang)) {
      sebelumPulih.current = sekarang
      setRef.current(tersimpan)
      setDipulihkan(true)
    }
    siapTulis.current = true
  }, [kunci, siap])

  // Simpan draf (debounce) bila isian berbeda dari patokan; sama → hapus.
  useEffect(() => {
    if (!kunci || !siapTulis.current) return undefined
    const t = setTimeout(() => {
      if (samaNilai(nilai, patokan.current)) hapusDraf(kunci)
      else tulisDraf(kunci, nilai)
    }, 400)
    return () => clearTimeout(t)
  }, [kunci, nilai])

  const buang = () => {
    if (kunci) hapusDraf(kunci)
    if (sebelumPulih.current != null) {
      patokan.current = sebelumPulih.current
      setRef.current(sebelumPulih.current)
    }
    setDipulihkan(false)
  }

  // nilaiBaru: isian setelah disimpan bila state ikut berubah (mis. id dari server); bawaan = isian saat ini.
  const bersihkan = (nilaiBaru) => {
    if (kunci) hapusDraf(kunci)
    patokan.current = nilaiBaru === undefined ? nilaiRef.current : nilaiBaru
    setDipulihkan(false)
  }

  return { dipulihkan, buang, bersihkan }
}
