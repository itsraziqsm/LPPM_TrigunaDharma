// Kategori log aktivitas — field `kategori` dari backend (W-53, new-api.md bagian 29.4):
// auth, akun, proposal, review, laporan, dokumen, periode, template, luaran, backup, sistem.
// `kategoriDari(log)` memakai field itu; log dari backend lama (tanpa `kategori`) diturunkan dari awalan `action`.
export const KATEGORI_LOG = [
  { key: 'auth', label: 'Info login' },
  { key: 'akun', label: 'Akun pengguna' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'review', label: 'Review' },
  { key: 'laporan', label: 'Laporan' },
  { key: 'dokumen', label: 'Dokumen' },
  { key: 'periode', label: 'Periode' },
  { key: 'template', label: 'Template' },
  { key: 'luaran', label: 'Luaran' },
  { key: 'backup', label: 'Backup' },
  { key: 'sistem', label: 'Sistem' },
]

const AUTH = ['LOGIN', 'LOGIN_GAGAL', 'LOGOUT', 'LOGOUT_ALL']

function kunciDariAction(action = '') {
  const a = String(action)
  if (AUTH.includes(a)) return 'auth'
  if (a.startsWith('user.')) return 'akun'
  if (a.startsWith('reviewer.') || a.startsWith('review.')) return 'review'
  if (a.startsWith('laporan')) return 'laporan'
  const awal = a.split('.')[0]
  return KATEGORI_LOG.some((k) => k.key === awal) ? awal : 'sistem'
}

// Terima objek log ({kategori, action}) atau string action.
export function kategoriDari(log) {
  const key = typeof log === 'string' ? kunciDariAction(log) : log?.kategori || kunciDariAction(log?.action)
  return KATEGORI_LOG.find((k) => k.key === key) || { key, label: key || 'Lainnya' }
}

const AKSI_AUTH = { LOGIN: 'login', LOGIN_GAGAL: 'login gagal', LOGOUT: 'logout', LOGOUT_ALL: 'logout semua perangkat' }

// Teks aksi yang lebih mudah dibaca: "proposal.status.disetujui" → "proposal · status · disetujui".
export const aksiTerbaca = (action = '') => AKSI_AUTH[action] || String(action).split('.').join(' · ').replace(/_/g, ' ')
