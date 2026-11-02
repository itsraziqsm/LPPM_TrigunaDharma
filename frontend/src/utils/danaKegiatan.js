// ---------------------------------------------------------------------------
// Dana final kegiatan = **dana disetujui reviewer** (keputusan reviewer di Form Penilaian; final,
// tidak bisa dinegosiasi setelah review diselesaikan). Dipakai semua statistik & pelaporan:
// proposal yang belum `disetujui` TIDAK dihitung.
//
// Field `danaDisetujui` kegiatan dikirim backend (W-54; laporan = dana proposal asal; `null` bila belum ada review
// berdana yang difinalisasi). Cadangan backend lama (field tidak ada sama sekali): nilai sementara = `anggaran`
// proposal yang disetujui dan `danaSementara()` true → UI menampilkan penanda ApiPending.
// ---------------------------------------------------------------------------

const angka = (v) => Number(v) || 0

// Item laporan (tipe 'laporan') selalu berasal dari proposal yang disetujui.
const sudahDisetujui = (p) => p?.tipe === 'laporan' || p?.status === 'disetujui'

// Nominal dana disetujui, atau null bila belum disetujui / belum ditetapkan reviewer.
export function danaFinal(p) {
  if (!p || !sudahDisetujui(p)) return null
  if ('danaDisetujui' in p) return p.danaDisetujui == null ? null : angka(p.danaDisetujui)
  return angka(p.anggaran)
}

// Jumlah dana disetujui sekumpulan proposal (yang belum disetujui diabaikan).
export const totalDana = (list) => (list || []).reduce((n, p) => n + (danaFinal(p) ?? 0), 0)

// true = backend belum mengirim `danaDisetujui` → angka di atas masih memakai dana diusulkan.
export const danaSementara = (list) => (Array.isArray(list) ? list : [list]).some((p) => p && sudahDisetujui(p) && !('danaDisetujui' in p))
