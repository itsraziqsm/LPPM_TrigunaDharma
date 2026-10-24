// Logika peran bersama (Sidebar, DashboardLayout, Manajemen User).

// roles dari /auth/me bisa berupa ['dosen'] atau [{ role: { name } }].
export function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

// Menu & halaman "Penugasan Review":
// - punya peran `reviewer` (reviewer murni, atau dosen yang dijadikan reviewer
//   oleh Admin/Ketua) → tampil;
// - dosen TANPA peran reviewer → disembunyikan walau masih punya tugasan
//   (`hasTugasan`); aksesnya diatur lewat peran reviewer;
// - peran lain (mis. mahasiswa) yang punya tugasan tetap tampil seperti sebelumnya.
export function canReview(user) {
  const roles = getRoleNames(user?.roles)
  if (roles.includes('reviewer')) return true
  if (roles.includes('dosen')) return false
  return user?.hasTugasan === true
}
