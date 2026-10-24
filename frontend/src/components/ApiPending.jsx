// Penanda bagian UI yang belum punya endpoint backend. Setiap pemakaian baru
// wajib dicatat di docs/waitingApi-list.md (root repo).
const WAITING_TITLE = 'Endpoint API belum tersedia (lihat docs/waitingApi-list.md)'

export default function ApiPending({ className = '' }) {
  return (
    <span
      title={WAITING_TITLE}
      className={`inline-flex items-center gap-1 rounded-md border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 font-sans text-xs font-semibold text-amber-800 ${className}`}
    >
      API belum ada
    </span>
  )
}
