// ---------------------------------------------------------------------------
// Pembantu tampilan dashboard: label peran, status proposal, tanggal, sapaan.
// Murni fungsi + konstanta (tanpa JSX) supaya aman dipakai adapter maupun UI.
// ---------------------------------------------------------------------------

export const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
  ketua_stmik: 'Ketua STMIK',
  dosen: 'Dosen',
  reviewer: 'Reviewer',
  mahasiswa: 'Mahasiswa',
}

export const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

// ── Status proposal ─────────────────────────────────────────────────────────
// Urutan = alur hidup proposal. `hex` dipakai bilah sebaran; `className` memakai
// kelas lencana dari index.css, sama dengan halaman daftar proposal.
export const STATUS_ORDER = ['draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak']

export const STATUS_META = {
  draft: { label: 'Draft', className: 'badge-neutral', hex: '#98a3b7' },
  diajukan: { label: 'Diajukan', className: 'badge-info', hex: '#4e69a6' },
  review: { label: 'Review', className: 'badge-review', hex: '#7664b8' },
  revisi: { label: 'Revisi', className: 'badge-warning', hex: '#c0702a' },
  disetujui: { label: 'Disetujui', className: 'badge-success', hex: '#348a63' },
  ditolak: { label: 'Ditolak', className: 'badge-danger', hex: '#c54a42' },
}

export const OTHER_STATUS_HEX = '#cbd3df'

// Statistik admin sebelumnya memakai istilah Inggris (approved, submitted, ...),
// sedangkan halaman lain memakai istilah Indonesia. Keduanya dipetakan ke satu
// kunci supaya angka tidak jatuh ke "Lainnya" hanya karena beda penulisan.
const STATUS_ALIAS = {
  submitted: 'diajukan',
  reviewed: 'review',
  in_review: 'review',
  approved: 'disetujui',
  rejected: 'ditolak',
  revision: 'revisi',
}

export function normalizeStatus(value) {
  const key = String(value ?? '').trim().toLowerCase()
  if (STATUS_META[key]) return key
  return STATUS_ALIAS[key] || null
}

export function statusMeta(value) {
  const key = normalizeStatus(value)
  if (key) return { key, ...STATUS_META[key] }
  return {
    key: 'lainnya',
    label: value ? String(value) : 'Lainnya',
    className: 'badge-neutral',
    hex: OTHER_STATUS_HEX,
  }
}

// Hitung jumlah per status dari daftar baris yang punya field `status`.
export function countStatuses(rows) {
  const counts = {}
  ;(rows || []).forEach((row) => {
    const key = normalizeStatus(row?.status) || 'lainnya'
    counts[key] = (counts[key] || 0) + 1
  })
  return counts
}

// ── Nada daftar "Perlu perhatian" ───────────────────────────────────────────
export const TONE = {
  danger: { hex: '#c54a42', label: 'Mendesak' },
  warning: { hex: '#b8862a', label: 'Perlu tindakan' },
  info: { hex: '#4e69a6', label: 'Informasi' },
  neutral: { hex: '#98a3b7', label: 'Catatan' },
}

const TONE_WEIGHT = { danger: 0, warning: 1, info: 2, neutral: 3 }

// Urutkan dari yang paling mendesak. Array.prototype.sort stabil, jadi urutan
// penyusunan di tiap adapter tetap terjaga untuk nada yang sama.
export function sortAttention(items) {
  return [...items].sort((a, b) => (TONE_WEIGHT[a.tone] ?? 9) - (TONE_WEIGHT[b.tone] ?? 9))
}

// ── Tanggal ─────────────────────────────────────────────────────────────────
const LOCALE = 'id-ID'
const SHORT = { day: '2-digit', month: 'short', year: 'numeric' }
const DAY_MONTH = { day: 'numeric', month: 'short' }
const DAY_MONTH_YEAR = { day: 'numeric', month: 'short', year: 'numeric' }
const MS_PER_DAY = 86_400_000

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Kolom tanggal murni (tanggalMulai, tanggal laporan) tersimpan sebagai
// "YYYY-MM-DD..." — ambil bagian harinya apa adanya agar tidak bergeser
// oleh zona waktu perambah.
export function parseDay(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : startOfDay(date)
}

// Penanda waktu (createdAt) dibaca sebagai saat kejadian di zona waktu lokal.
export function formatDate(value, options = SHORT) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(LOCALE, options) : '—'
}

export function formatDay(value, options = DAY_MONTH_YEAR) {
  const date = parseDay(value)
  return date ? date.toLocaleDateString(LOCALE, options) : '—'
}

export function formatLongDate(now) {
  return now.toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatClock(date) {
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

// Selisih hari kalender dari hari ini ke tanggal murni (negatif bila sudah lewat).
export function daysUntil(value, now = new Date()) {
  const target = parseDay(value)
  if (!target) return null
  return Math.round((target - startOfDay(now)) / MS_PER_DAY)
}

// Berapa hari kalender sejak suatu penanda waktu (0 = hari ini).
export function daysSince(value, now = new Date()) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(date)) / MS_PER_DAY))
}

// "hari ini", "kemarin", "5 hari lalu", atau "pada 2 Okt 2026" untuk yang lama.
export function sinceLabel(value, now = new Date()) {
  const days = daysSince(value, now)
  if (days === null) return ''
  if (days === 0) return 'hari ini'
  if (days === 1) return 'kemarin'
  if (days < 14) return `${days} hari lalu`
  return `pada ${formatDate(value, DAY_MONTH_YEAR)}`
}

export function timeAgo(value, now = Date.now()) {
  const time = value ? new Date(value).getTime() : NaN
  if (Number.isNaN(time)) return ''
  const seconds = Math.max(0, Math.floor((now - time) / 1000))
  if (seconds < 60) return 'Baru saja'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} jam lalu`
  if (seconds < 86_400 * 7) return `${Math.floor(seconds / 86_400)} hari lalu`
  return formatDate(value, DAY_MONTH_YEAR)
}

export function greeting(now = new Date()) {
  const hour = now.getHours()
  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

// ── Periode ─────────────────────────────────────────────────────────────────
// Menghitung rentang, kemajuan waktu, dan sisa hari sebuah periode.
// Bila tanggal tidak tersedia (mis. data ringkas dari statistik), hanya
// mengembalikan nilai kosong — UI cukup menampilkan nama periode.
export function periodTiming(period, now = new Date()) {
  const start = parseDay(period.mulai)
  const end = parseDay(period.selesai)
  if (!start || !end) {
    return { range: null, progress: null, label: null, urgent: false, daysLeft: null }
  }

  const today = startOfDay(now)
  const span = Math.max(end - start, MS_PER_DAY)
  const progress = Math.min(100, Math.max(0, Math.round(((today - start) / span) * 100)))
  const daysLeft = Math.round((end - today) / MS_PER_DAY)

  let label
  if (today < start) label = `Dimulai ${Math.round((start - today) / MS_PER_DAY)} hari lagi`
  else if (daysLeft < 0) label = 'Sudah berakhir'
  else if (daysLeft === 0) label = 'Berakhir hari ini'
  else label = `Berakhir ${daysLeft} hari lagi`

  const range = `${start.toLocaleDateString(LOCALE, DAY_MONTH)} – ${end.toLocaleDateString(LOCALE, DAY_MONTH_YEAR)}`
  return { range, progress, label, urgent: daysLeft >= 0 && daysLeft <= 7, daysLeft }
}
