// Jejak (breadcrumb) halaman yang sedang tampil, untuk alat di luar halaman (mis. Hubungi Admin
// menyebut halaman tempat pengguna mengalami kendala). Diisi components/Breadcrumb.jsx.
let jejak = null

export const setJejak = (labels) => {
  jejak = labels
}

// Teks jejak mis. "Home / Akademik / Periode"; tanpa breadcrumb → jalur URL.
export const teksJejak = () => (jejak?.length ? jejak.join(' / ') : typeof window !== 'undefined' ? window.location.pathname : '')
