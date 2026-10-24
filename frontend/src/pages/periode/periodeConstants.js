import { API_BASE_URL } from '../../api/axios'
import { alertDialog } from '../../utils/dialog'

// ─── Helper ───────────────────────────────────────────────────────────────────

export const openDokumenWithAuth = async (proposalId) => {
    const token = localStorage.getItem('accessToken')
    const base = API_BASE_URL
    const res = await fetch(`${base}/proposals/${proposalId}/dokumen-utama`, {
        headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) { alertDialog({ title: 'Gagal membuka dokumen', message: 'Dokumen tidak dapat dibuka. Silakan coba lagi.' }); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
}

export function getRoleNames(roles) {
    if (!roles || roles.length === 0) return []
    if (typeof roles[0] === 'string') return roles
    return roles.map((r) => r.role?.name || r.name || '')
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

export const STATUS_LABEL = {
    draft: 'Draft',
    diajukan: 'Diajukan',
    review: 'Review',
    revisi: 'Revisi',
    disetujui: 'Disetujui',
    ditolak: 'Ditolak',
}

// Kelas lencana dari index.css (titik + kata, warna diredam)
export const STATUS_COLOR = {
    draft: 'badge-neutral',
    diajukan: 'badge-info',
    review: 'badge-review',
    revisi: 'badge-warning',
    disetujui: 'badge-success',
    ditolak: 'badge-danger',
}

export const EMPTY_FORM = {
    nama: '', tahun: new Date().getFullYear(),
    jenis: 'penelitian', tanggalMulai: '', tanggalSelesai: '', isAktif: true,
}