import * as pengelola from './pengelola'
import * as dosen from './dosen'
import * as mahasiswa from './mahasiswa'
import * as reviewer from './reviewer'

// Satu adapter per kelompok peran. Semuanya mengembalikan bentuk model yang
// sama, sehingga tampilan dashboard tidak perlu tahu peran siapa yang sedang masuk.
export const ADAPTERS = { pengelola, dosen, mahasiswa, reviewer }

export function adapterKeyForRole(role) {
  if (role === 'admin' || role === 'ketua_lppm') return 'pengelola'
  if (role === 'dosen' || role === 'mahasiswa' || role === 'reviewer') return role
  return null
}
