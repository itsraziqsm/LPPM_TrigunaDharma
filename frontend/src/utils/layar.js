// Layar ponsel (< 640px, breakpoint `sm` Tailwind). Dipakai Arsip Kegiatan/Project: di ponsel klik
// folder langsung membuka halaman detail periode, bukan pratinjau 3 item.
export const layarPonsel = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
