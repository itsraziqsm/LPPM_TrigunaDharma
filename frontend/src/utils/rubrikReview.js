// ---------------------------------------------------------------------------
// Rubrik Form Penilaian Reviewer (mengikuti formulir kertas "Form Penilaian Proposal
// Penelitian Mandiri"): 7 komponen substansi, skor 1–5 + catatan singkat per komponen,
// total & rata-rata, keterangan kelayakan, rekomendasi, dan dana disetujui (proposal).
//
// Semua tersimpan di server (W-54): skor `skor[{kode,skor,catatan}]`, `danaDisetujui`, `catatan`, `rekomendasi`;
// kode komponen sama dengan GET /reviewer/rubrik (sama untuk penelitian, pengabdian, dan laporan). Draf localStorage
// lama (`formReview:<userId>:<tipe>:<id>`, sebelum W-54) hanya dibaca sekali sebagai nilai awal lalu dihapus.
// ---------------------------------------------------------------------------

export const KOMPONEN = [
  { kode: 'judul', label: 'Kejelasan & fokus judul' },
  { kode: 'relevansi', label: 'Relevansi topik' },
  { kode: 'latar', label: 'Latar belakang & perumusan masalah' },
  { kode: 'kebaruan', label: 'Research gap & kebaruan' },
  { kode: 'pustaka', label: 'Tinjauan pustaka (mutakhir & relevan)' },
  { kode: 'konsistensi', label: 'Konsistensi judul–latar–pustaka' },
  { kode: 'kelayakan', label: 'Kelayakan pelaksanaan' },
]

export const SKOR = [1, 2, 3, 4, 5]

export const REKOMENDASI = [
  { value: 'disetujui', label: 'Diterima', desc: 'Layak didanai tanpa perbaikan.', tone: 'success' },
  { value: 'revisi', label: 'Diterima dengan perbaikan', desc: 'Layak setelah pengusul memperbaiki catatan.', tone: 'warning' },
  { value: 'ditolak', label: 'Ditolak', desc: 'Tidak layak dilanjutkan.', tone: 'danger' },
]

export const tautanForm = (tipe, id) => `/penugasan/nilai/${tipe}/${id}`

export const labelRekomendasi = (v) => REKOMENDASI.find((r) => r.value === v)?.label || v || '—'

// Keterangan kelayakan dari rata-rata (≥ 4,0 layak lanjut; 3,0–3,9 layak dengan revisi; < 3,0 tidak layak).
export function kelayakan(rata) {
  if (rata == null) return null
  if (rata >= 4) return { label: 'Layak lanjut', saran: 'disetujui', tone: 'success' }
  if (rata >= 3) return { label: 'Layak dengan revisi', saran: 'revisi', tone: 'warning' }
  return { label: 'Tidak layak', saran: 'ditolak', tone: 'danger' }
}

export function hitungSkor(skor = {}) {
  const nilai = KOMPONEN.map((k) => Number(skor[k.kode])).filter((n) => n >= 1 && n <= 5)
  const total = nilai.reduce((a, b) => a + b, 0)
  // Dibulatkan 1 desimal seperti formulir (30 / 7 = 4,3); kelayakan memakai nilai yang dibulatkan.
  const rata = nilai.length ? Math.round((total / nilai.length) * 10) / 10 : null
  return { total, rata, terisi: nilai.length, lengkap: nilai.length === KOMPONEN.length, kelayakan: kelayakan(rata) }
}

// `skor` review dari server ([{kode, skor}]) → { kode: skor } untuk hitungSkor.
export const petaSkor = (review) => Object.fromEntries((review?.skor || []).map((x) => [x.kode, Number(x.skor)]))

export const angkaId = (n, digit = 1) => (n == null ? '—' : n.toLocaleString('id-ID', { minimumFractionDigits: digit, maximumFractionDigits: digit }))
export const rupiahId = (v) => (v || v === 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')

// ── draf lokal lama (sebelum W-54; hanya dibaca untuk migrasi) ─────────────
const kunci = (userId, tipe, id) => `formReview:${userId}:${tipe}:${id}`

export function bacaDraf(userId, tipe, id) {
  try {
    const raw = localStorage.getItem(kunci(userId, tipe, id))
    const d = raw ? JSON.parse(raw) : null
    return d && typeof d === 'object' ? d : null
  } catch {
    return null
  }
}

export function hapusDraf(userId, tipe, id) {
  try {
    localStorage.removeItem(kunci(userId, tipe, id))
  } catch {
    /* abaikan */
  }
}
