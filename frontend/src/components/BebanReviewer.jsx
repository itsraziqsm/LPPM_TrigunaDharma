// Lencana beban reviewer dari GET /users/kandidat-reviewer (W-32): reviewer tanpa
// tugasan aktif diprioritaskan; selain itu jumlah tugasan aktif.
export default function BebanReviewer({ kandidat: k }) {
  if (!k || k.tugasanBelumSelesai == null) return null
  return k.prioritas ? (
    <span className="badge badge-success">Diprioritaskan · belum ada tugasan</span>
  ) : (
    <span className="badge badge-neutral">{k.tugasanBelumSelesai} tugasan aktif</span>
  )
}
