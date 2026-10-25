// Logika peran bersama (Sidebar, DashboardLayout, Manajemen User).

// roles dari /auth/me bisa berupa ['dosen'] atau [{ role: { name } }].
export function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

// Menu & halaman "Penugasan Review": hanya user berperan `reviewer` (reviewer murni
// atau dosen yang dijadikan reviewer oleh Admin/Ketua). Sejak aturan hak akses
// reviewer (new-api.md bagian 16) backend menolak tugasan/review dari user tanpa
// peran ini (403), termasuk mahasiswa yang masih punya `hasTugasan`.
export function canReview(user) {
  return getRoleNames(user?.roles).includes('reviewer')
}
