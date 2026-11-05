import { laporanApi } from '../api/laporan'

// Proposal disetujui yang belum punya laporan (GET /laporan/eligible), per jenis — dipakai lencana menu Kegiatan
// (Sidebar), tombol Kirim Laporan Baru (KegiatanPage) dan "Perlu perhatian" Beranda dosen.
// segarkanSiapLapor() → pemakai menghitung ulang (mis. setelah laporan baru dibuat).
export const EVENT_SIAP_LAPOR = 'siap-lapor-refresh'
export const segarkanSiapLapor = () => window.dispatchEvent(new CustomEvent(EVENT_SIAP_LAPOR))

export async function hitungSiapLapor() {
  const r = await laporanApi.getEligible()
  const list = r.data.data || []
  const penelitian = list.filter((p) => p.jenis === 'penelitian').length
  const pengabdian = list.filter((p) => p.jenis === 'pengabdian').length
  return { penelitian, pengabdian, total: list.length, list }
}
