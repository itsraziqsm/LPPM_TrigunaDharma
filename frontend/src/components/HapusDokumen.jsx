import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import ApiPending from './ApiPending'
import { confirmDialog } from '../utils/dialog'

// Hapus dokumen (proposal/laporan) oleh Admin di Dokumen Masuk — "hapus dengan izin".
// Backend saat ini hanya mengizinkan hapus berstatus draft (DELETE /proposals/:id,
// DELETE /laporan/:id), dan draft tidak tampil di Dokumen Masuk. Hapus dokumen yang
// sudah diajukan harus lewat permintaan yang disetujui Ketua LPPM (pola hapus
// periode) → endpoint belum ada: W-33 di docs/waitingApi-list.md.
//   onDelete() → Promise; hanya dipanggil untuk status draft.
export default function HapusDokumen({ status, noun = 'dokumen', judul, onDelete, compact = false }) {
  const [busy, setBusy] = useState(false)

  if (status === 'draft') {
    const hapus = async () => {
      const ok = await confirmDialog({
        tone: 'danger',
        title: `Hapus ${noun}?`,
        message: `${noun.charAt(0).toUpperCase() + noun.slice(1)} "${judul}" akan dihapus permanen beserta lampirannya.`,
        confirmText: 'Hapus',
      })
      if (!ok) return
      setBusy(true)
      try {
        await onDelete()
      } finally {
        setBusy(false)
      }
    }
    return (
      <button type="button" onClick={hapus} disabled={busy} className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50">
        <Trash2 className="size-4" aria-hidden="true" />
        {busy ? 'Menghapus…' : `Hapus ${noun}`}
      </button>
    )
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${compact ? '' : 'text-sm'}`}>
      <button
        type="button"
        disabled
        title={`${noun.charAt(0).toUpperCase() + noun.slice(1)} yang sudah diajukan hanya bisa dihapus dengan izin Ketua LPPM.`}
        className="btn btn-ghost btn-sm cursor-not-allowed text-slate-400"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Ajukan hapus (izin Ketua)
      </button>
      <ApiPending />
    </span>
  )
}
