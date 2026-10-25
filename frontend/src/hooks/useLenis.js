import { useEffect } from 'react'
import Lenis from 'lenis'

// Smooth scroll (Lenis) untuk wadah gulir sebuah halaman. Setiap halaman di
// aplikasi ini menggulir di dalam elemen sendiri (bukan window), jadi Lenis
// dipasang pada elemen tersebut:
//   - wrapperRef : elemen yang punya overflow-y-auto
//   - contentRef : (opsional) anak langsung yang tingginya berubah; bila tidak
//                  diberikan, wrapper sendiri yang dipakai
//   - enabled    : (opsional, default true) false = tanpa Lenis, mis. halaman
//                  yang menggulir di elemen lain
//   - resetKey   : (opsional) bila berubah, Lenis dipasang ulang dan posisi
//                  gulir kembali ke atas (mis. pindah halaman, ganti tampilan)
// Elemen bergulir di dalamnya (dropdown, modal, tabel) tetap bisa digulir
// berkat allowNestedScroll; tambahkan `data-lenis-prevent` bila perlu
// mengecualikan elemen tertentu. Dinonaktifkan untuk prefers-reduced-motion.
const MODAL_SELECTOR = "[aria-modal='true'], .overlay, [data-scroll-lock]"

export function adaModalTerbuka() {
  if (document.documentElement.classList.contains('search-open')) return true
  if (document.querySelector(MODAL_SELECTOR)) return true
  return window.matchMedia('(max-width: 79.99rem)').matches && Boolean(document.querySelector('[data-scroll-lock-mobile]'))
}

export default function useLenis(wrapperRef, { contentRef, resetKey, enabled = true } = {}) {
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return undefined
    if (resetKey !== undefined) wrapper.scrollTop = 0
    if (!enabled) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const lenis = new Lenis({
      wrapper,
      content: contentRef?.current || wrapper,
      autoRaf: true,
      anchors: true,
      allowNestedScroll: true,
      // Saat modal/dialog/popup terbuka, latar tidak ikut digulir (lihat index.css).
      prevent: () => adaModalTerbuka(),
    })
    return () => lenis.destroy()
  }, [wrapperRef, contentRef, resetKey, enabled])
}
