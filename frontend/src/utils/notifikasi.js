import {
  BadgeCheck,
  Bell,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  FileUp,
  KeyRound,
  PencilLine,
  Send,
  Trash2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helper notifikasi bersama: lonceng (NotificationBell), daftar (/notifikasi) dan
// detail (/notifikasi/:id). TYPE_META = ikon + warna + label per NotifType;
// targetFor = halaman terkait sesuai peran pertama.
// ---------------------------------------------------------------------------

export const TYPE_META = {
  proposal_diajukan: { icon: Send, tone: 'bg-navy-50 text-navy-700', label: 'Proposal diajukan' },
  proposal_disetujui: { icon: CircleCheck, tone: 'bg-green-50 text-green-700', label: 'Proposal disetujui' },
  proposal_ditolak: { icon: CircleX, tone: 'bg-red-50 text-red-700', label: 'Proposal ditolak' },
  proposal_revisi: { icon: PencilLine, tone: 'bg-amber-50 text-amber-700', label: 'Proposal perlu revisi' },
  reviewer_ditugaskan: { icon: ClipboardCheck, tone: 'bg-purple-50 text-purple-700', label: 'Penugasan review' },
  review_selesai: { icon: BadgeCheck, tone: 'bg-green-50 text-green-700', label: 'Review selesai' },
  laporan_diunggah: { icon: FileUp, tone: 'bg-navy-50 text-navy-700', label: 'Laporan diunggah' },
  laporan_diajukan: { icon: FileUp, tone: 'bg-navy-50 text-navy-700', label: 'Laporan diajukan' },
  laporan_disetujui: { icon: CircleCheck, tone: 'bg-green-50 text-green-700', label: 'Laporan disetujui' },
  laporan_ditolak: { icon: CircleX, tone: 'bg-red-50 text-red-700', label: 'Laporan ditolak' },
  laporan_revisi: { icon: PencilLine, tone: 'bg-amber-50 text-amber-700', label: 'Laporan perlu revisi' },
  deletion_request: { icon: Trash2, tone: 'bg-red-50 text-red-700', label: 'Permintaan hapus' },
  deletion_approved: { icon: Trash2, tone: 'bg-slate-100 text-slate-600', label: 'Penghapusan disetujui' },
  deletion_cancelled: { icon: Trash2, tone: 'bg-slate-100 text-slate-600', label: 'Penghapusan ditolak/dibatalkan' },
  password_direset: { icon: KeyRound, tone: 'bg-amber-50 text-amber-700', label: 'Password direset' },
}

// Kategori notifikasi menurut pengirim & jenis kegiatannya — field `kategori` dari backend (W-56); notifikasi dari
// backend lama tanpa field itu diturunkan dari `type` dengan pemetaan yang sama:
//   kegiatan  = aktivitas pengusul (proposal/laporan diajukan, laporan diunggah)
//   keputusan = keputusan LPPM (Ketua/Admin) atas proposal & laporan
//   review    = penugasan & hasil review (reviewer)
//   admin     = tindakan Admin/Ketua atas data & akun (hapus dokumen/periode, reset password), juga jenis lain
export const KATEGORI_NOTIF = [
  { key: 'kegiatan', label: 'Kegiatan', types: ['proposal_diajukan', 'laporan_diajukan', 'laporan_diunggah'] },
  { key: 'keputusan', label: 'Keputusan LPPM', types: ['proposal_disetujui', 'proposal_ditolak', 'proposal_revisi', 'laporan_disetujui', 'laporan_ditolak', 'laporan_revisi'] },
  { key: 'review', label: 'Review', types: ['reviewer_ditugaskan', 'review_selesai'] },
  { key: 'admin', label: 'Admin & sistem', types: [] },
]
export const kategoriNotif = (n) =>
  KATEGORI_NOTIF.find((k) => k.key === n?.kategori) || KATEGORI_NOTIF.find((k) => k.types.includes(n?.type)) || KATEGORI_NOTIF[3]
export const DEFAULT_META = { icon: Bell, tone: 'bg-slate-100 text-slate-600', label: 'Notifikasi' }

export function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

// Pihak yang memicu notifikasi: `pengirim` dari backend (W-56); bila null (sistem/data lama) ditebak dari jenisnya —
// pengusul untuk pengajuan, reviewer untuk review selesai, selain itu pengelola LPPM.
export function pengirimFor(n, related) {
  if (n?.pengirim) return n.pengirim.fullName || n.pengirim.name || 'Pengguna'
  const pengusul = related?.pengusul?.fullName || related?.pengusul?.name
  if (['proposal_diajukan', 'laporan_diajukan', 'laporan_diunggah'].includes(n.type)) return pengusul || 'Pengusul kegiatan'
  if (n.type === 'review_selesai') return 'Reviewer'
  if (n.type === 'deletion_request') return 'Admin LPPM'
  if (n.type?.startsWith('deletion_')) return 'Ketua LPPM'
  if (n.type === 'password_direset') return 'Admin LPPM'
  if (n.type === 'reviewer_ditugaskan' && n.refType === 'laporan') return 'Sistem (reviewer proposal)'
  return 'LPPM (Ketua/Admin)'
}

// Halaman tujuan untuk notifikasi, mengikuti menu yang dimiliki peran.
export function targetFor(n, roles) {
  const primary = roles[0]
  const pengelola = primary === 'admin' || primary === 'ketua_lppm'
  // Hapus proposal/laporan dengan izin Ketua (W-34): permintaan tampil di Dokumen Masuk › Proposal Kegiatan.
  if (n.refType === 'DokumenDeletionRequest') return pengelola ? { to: '/proposals', label: 'Buka Dokumen Masuk' } : null
  if (n.refType === 'periode' || n.type?.startsWith('deletion_')) return pengelola ? { to: '/periode', label: 'Buka periode' } : null
  if (n.refType === 'laporan') {
    if (n.type === 'reviewer_ditugaskan') return n.refId ? { to: `/laporan-masuk/detail/${n.refId}`, label: 'Buka laporan untuk direview' } : { to: '/penugasan?tab=laporan', label: 'Buka penugasan' }
    if (pengelola) return { to: `/laporan-masuk/detail/${n.refId}`, label: 'Kelola laporan' }
    // Pengusul: jenis menyesuaikan otomatis setelah laporan dimuat.
    if (primary === 'dosen' || primary === 'mahasiswa') return { to: `/kegiatan/penelitian/laporan/${n.refId}`, label: 'Buka laporan' }
    return null
  }
  if (n.type === 'reviewer_ditugaskan' && roles.includes('reviewer')) {
    return n.refType === 'proposal' && n.refId ? { to: `/proposals/detail/${n.refId}`, label: 'Buka proposal untuk direview' } : { to: '/penugasan', label: 'Buka penugasan' }
  }
  if (n.refType === 'proposal') {
    if (pengelola) return { to: `/proposals/detail/${n.refId}`, label: 'Buka proposal' }
    // Halaman Detail Kegiatan; jenis tidak ada di notifikasi → halaman menyesuaikan jenis.
    if (primary === 'dosen' || primary === 'mahasiswa') return { to: `/kegiatan/penelitian/detail/${n.refId}`, label: 'Buka kegiatan' }
    if (primary === 'reviewer') return { to: '/penugasan', label: 'Buka penugasan' }
  }
  return null
}
