import useAuthStore from '../store/authStore'
import { getRoleNames } from '../utils/roles'

// Induk menu untuk breadcrumb, mengikuti pohon sidebar peran pertama (components/Sidebar.jsx):
//   Admin       — Akademik › Dokumen Masuk/Periode; Dokumentasi › Manajemen Template/Cetak Dokumen
//   Ketua LPPM  — Dokumentasi › Cetak Dokumen/Luaran (Dokumen Masuk & Periode di tingkat atas)
//   Ketua STMIK — Akademik › Pemantauan Proposal
//   grup: 'akademik' | 'dokumentasi'
const INDUK = {
  admin: { akademik: [{ label: 'Akademik' }], dokumentasi: [{ label: 'Dokumentasi' }] },
  ketua_lppm: { dokumentasi: [{ label: 'Dokumentasi' }] },
  ketua_stmik: { akademik: [{ label: 'Akademik' }] },
}

export default function useJejakMenu(grup) {
  const peran = getRoleNames(useAuthStore((s) => s.user)?.roles)[0]
  return INDUK[peran]?.[grup] || []
}
