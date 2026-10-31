// Seluruh baris tabel bisa diklik (mouse & keyboard Enter/Spasi) untuk membuka detail; tombol di
// dalam baris harus menghentikan propagasi (`e.stopPropagation()`). Dipakai semua tabel navy (M1).
export function barisKlik(buka, judul) {
  return {
    onClick: buka,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        buka()
      }
    },
    tabIndex: 0,
    role: 'link',
    'aria-label': `Buka detail: ${judul}`,
    className: 'cursor-pointer transition-colors hover:bg-navy-50/60 focus-visible:bg-navy-50 focus-visible:outline-none',
  }
}

// Bungkus handler tombol di dalam baris yang bisa diklik.
export const tanpaBaris = (fn) => (e) => {
  e.stopPropagation()
  fn(e)
}
