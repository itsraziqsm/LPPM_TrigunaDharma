// ── Konstanta Proposal Dosen ──────────────────────────────────────────────────

export const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

export const STATUS_LABEL = {
    draft: 'Draft', diajukan: 'Diajukan', review: 'Review',
    revisi: 'Revisi', disetujui: 'Disetujui', ditolak: 'Ditolak',
}

// Kelas lencana status (didefinisikan di index.css)
export const STATUS_COLOR = {
    draft: 'badge-neutral',
    diajukan: 'badge-info',
    review: 'badge-review',
    revisi: 'badge-warning',
    disetujui: 'badge-success',
    ditolak: 'badge-danger',
}

export const UNDANGAN_COLOR = {
    pending: 'badge-warning',
    diterima: 'badge-success',
    ditolak: 'badge-danger',
}

export const PERAN_OPTIONS = ['anggota', 'co-investigator', 'peneliti', 'asisten']
