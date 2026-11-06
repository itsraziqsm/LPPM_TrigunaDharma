import { proposalDosenApi } from '../api/Proposaldosen'
import { semuaHalaman } from './semuaHalaman'

// ---------------------------------------------------------------------------
// Tanggapan tim atas undangan (pengusul): dihitung dari `anggota[].statusUndangan` proposal draft/revisi
// (GET /dosen/proposals). Dua keadaan yang perlu tindakan pengusul:
//   lengkap = semua anggota menerima undangan → proposal siap diajukan
//   ditolak = ada anggota yang menolak → ganti anggota sebelum diajukan
// Dipakai: lencana menu Kegiatan (Sidebar), lencana baris Riwayat (KegiatanPage), "Perlu perhatian" Beranda dosen,
// banner Detail Kegiatan. Notifikasi saat anggota menanggapi menunggu backend (W-58);
// segarkanTanggapanTim() → pemakai menghitung ulang (mis. setelah proposal diajukan/disimpan).
// ---------------------------------------------------------------------------

export const EVENT_TANGGAPAN_TIM = 'tanggapan-tim-refresh'
export const segarkanTanggapanTim = () => window.dispatchEvent(new CustomEvent(EVENT_TANGGAPAN_TIM))

const BISA_DIAJUKAN = ['draft', 'revisi']

export function ringkasTim(p) {
  const anggota = (p?.anggota || []).filter((a) => a.peran !== 'ketua')
  const hitung = (s) => anggota.filter((a) => a.statusUndangan === s).length
  return { total: anggota.length, diterima: hitung('diterima'), ditolak: hitung('ditolak'), pending: hitung('pending') }
}

// Keadaan tim proposal draft/revisi: null bila tidak relevan (bukan draft/revisi, atau tanpa anggota).
export function statusTim(p) {
  if (!p || !BISA_DIAJUKAN.includes(p.status)) return null
  const r = ringkasTim(p)
  if (!r.total) return null
  if (r.ditolak > 0)
    return { kode: 'ditolak', ...r, tone: 'badge-danger', label: `${r.ditolak} anggota menolak`, pesan: `${r.ditolak} anggota menolak undangan — ganti anggota sebelum mengajukan.` }
  if (r.pending === 0)
    return { kode: 'lengkap', ...r, tone: 'badge-success', label: 'Semua anggota menerima', pesan: `Semua ${r.total} anggota menerima undangan — proposal siap diajukan.` }
  return { kode: 'menunggu', ...r, tone: 'badge-neutral', label: `${r.pending} belum menanggapi`, pesan: `${r.pending} dari ${r.total} anggota belum menanggapi undangan.` }
}

const kosong = () => ({ lengkap: 0, ditolak: 0, total: 0 })

// Hitungan per jenis dari proposal draft & revisi milik user.
export async function hitungTanggapanTim() {
  const [draft, revisi] = await Promise.all(BISA_DIAJUKAN.map((status) => semuaHalaman((q) => proposalDosenApi.getAll(q), { status }, 5)))
  const hasil = { penelitian: kosong(), pengabdian: kosong(), total: 0, lengkap: [], ditolak: [] }
  for (const p of [...draft.items, ...revisi.items]) {
    const s = statusTim(p)
    if (!s || s.kode === 'menunggu') continue
    const j = hasil[p.jenis] || hasil.penelitian
    j[s.kode] += 1
    j.total += 1
    hasil.total += 1
    hasil[s.kode].push(p)
  }
  return hasil
}
