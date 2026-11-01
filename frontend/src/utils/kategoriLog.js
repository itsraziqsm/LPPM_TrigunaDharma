// Kategori log aktivitas — DITURUNKAN dari awalan `action` (backend belum punya kolom kategori, W-53).
// `cari` = nilai parameter `action` untuk GET /activity-logs (backend memakai LIKE %…%).
export const KATEGORI_LOG = [
  { key: 'login', label: 'Info login', cari: 'LOGIN', cocok: (a) => a === 'LOGIN' },
  { key: 'akun', label: 'Akun pengguna', cari: 'user.', cocok: (a) => a.startsWith('user.') },
  { key: 'proposal', label: 'Proposal', cari: 'proposal.', cocok: (a) => a.startsWith('proposal.') },
  { key: 'review', label: 'Review', cari: 'review', cocok: (a) => a.startsWith('review') },
  { key: 'laporan', label: 'Laporan', cari: 'laporan', cocok: (a) => a.startsWith('laporan') },
  { key: 'dokumen', label: 'Dokumen', cari: 'dokumen.', cocok: (a) => a.startsWith('dokumen.') },
  { key: 'periode', label: 'Periode', cari: 'periode.', cocok: (a) => a.startsWith('periode.') },
  { key: 'template', label: 'Template', cari: 'template.', cocok: (a) => a.startsWith('template.') },
  { key: 'luaran', label: 'Luaran', cari: 'luaran.', cocok: (a) => a.startsWith('luaran.') },
  { key: 'backup', label: 'Backup', cari: 'backup.', cocok: (a) => a.startsWith('backup.') },
]

export const kategoriDari = (action = '') => KATEGORI_LOG.find((k) => k.cocok(String(action))) || { key: 'lain', label: 'Lainnya' }

// Teks aksi yang lebih mudah dibaca: "proposal.status.disetujui" → "proposal · status · disetujui".
export const aksiTerbaca = (action = '') => (action === 'LOGIN' ? 'login' : String(action).split('.').join(' · ').replace(/_/g, ' '))
