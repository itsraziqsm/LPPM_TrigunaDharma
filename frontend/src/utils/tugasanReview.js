import { reviewerApi } from '../api/reviewer'
import { laporanApi } from '../api/laporan'
import { semuaHalaman } from './semuaHalaman'

// ---------------------------------------------------------------------------
// Hitung tugasan review milik reviewer (semua halaman GET /reviewer/my-tugasan & /laporan/tugasan):
// total, belum (review belum diselesaikan & item masih bisa dinilai), selesai — per tab & gabungan.
// Dipakai lencana menu Penugasan Review (Sidebar) dan kartu/tab halaman Penugasan Review.
// segarkanTugasanReview() → semua pemakai menghitung ulang (mis. setelah review diselesaikan).
// ---------------------------------------------------------------------------

export const EVENT_TUGASAN = 'tugasan-review-refresh'
export const segarkanTugasanReview = () => window.dispatchEvent(new CustomEvent(EVENT_TUGASAN))

// Item yang sudah diputuskan (disetujui/ditolak/revisi) tidak bisa dinilai lagi → tidak dihitung "belum".
const masihTerbuka = (status) => !status || status === 'diajukan' || status === 'review'

function ringkas(items, statusOf) {
  const selesai = items.filter((t) => t.myReview?.isDone).length
  const belum = items.filter((t) => !t.myReview?.isDone && masihTerbuka(statusOf(t))).length
  return { total: items.length, belum, selesai }
}

export async function hitungTugasanReview() {
  const [p, l] = await Promise.all([
    semuaHalaman(reviewerApi.getMyTugasan).catch(() => ({ items: [] })),
    semuaHalaman(laporanApi.getTugasan).catch(() => ({ items: [] })),
  ])
  const proposal = ringkas(p.items, (t) => t.proposal?.status)
  const laporan = ringkas(l.items, (t) => t.laporan?.status)
  return { proposal, laporan, belum: proposal.belum + laporan.belum }
}
