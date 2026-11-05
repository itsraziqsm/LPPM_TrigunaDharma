import { History } from 'lucide-react'

// Penanda: isian formulir dipulihkan dari draf otomatis (hooks/useDrafForm). Tombol Buang = kembali ke isian awal.
export default function DrafDipulihkan({ draf, className = '' }) {
  if (!draf?.dipulihkan) return null
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-navy-200 bg-navy-50 px-4 py-2.5 text-sm text-navy-900 ${className}`}>
      <History className="size-4 shrink-0 text-navy-600" aria-hidden="true" />
      <span className="min-w-0 flex-1">Isian yang belum disimpan dipulihkan dari draf otomatis di peramban ini.</span>
      <button type="button" onClick={draf.buang} className="text-sm font-semibold text-navy-700 underline-offset-2 hover:underline">
        Buang draf
      </button>
    </div>
  )
}
