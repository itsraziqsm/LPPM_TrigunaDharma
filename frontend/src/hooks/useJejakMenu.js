import useAuthStore from '../store/authStore'
import { getRoleNames } from '../utils/roles'

// Induk menu untuk breadcrumb, mengikuti pohon sidebar peran pertama. Sidebar Admin bertingkat
// (Akademik › Dokumen Masuk/Luaran/Periode, Dokumentasi › Manajemen Template/Cetak Dokumen),
// sedangkan menu Ketua LPPM masih datar — jadi induk tambahan hanya untuk admin.
//   grup: 'akademik' | 'dokumentasi'
const INDUK_ADMIN = {
  akademik: [{ label: 'Akademik' }],
  dokumentasi: [{ label: 'Dokumentasi' }],
}

export default function useJejakMenu(grup) {
  const peran = getRoleNames(useAuthStore((s) => s.user)?.roles)[0]
  return peran === 'admin' ? INDUK_ADMIN[grup] || [] : []
}
