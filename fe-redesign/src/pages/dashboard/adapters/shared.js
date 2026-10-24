import { reviewerApi } from '../../../api/reviewer'
import {
  JENIS_LABEL,
  OTHER_STATUS_HEX,
  STATUS_META,
  STATUS_ORDER,
  daysUntil,
  formatDay,
  normalizeStatus,
  periodTiming,
} from '../format'

// ── Pengambilan data ────────────────────────────────────────────────────────
// Tiap permintaan berdiri sendiri: satu endpoint yang gagal tidak mengosongkan
// seluruh dashboard. Yang gagal dicatat labelnya untuk ditampilkan sebagai
// pemberitahuan "sebagian data belum termuat".
export const req = (label, run) => ({ label, run })

export async function settleAll(requests) {
  const keys = Object.keys(requests)
  const results = await Promise.allSettled(
    keys.map((key) => Promise.resolve().then(requests[key].run)),
  )

  const data = {}
  const failed = []
  results.forEach((result, i) => {
    const key = keys[i]
    if (result.status === 'fulfilled') {
      data[key] = result.value
    } else {
      failed.push(requests[key].label)
      console.error(`[dashboard] gagal memuat ${requests[key].label}`, result.reason)
    }
  })

  return { data, failed, ok: keys.length === 0 || failed.length < keys.length }
}

// ── Sebaran status ──────────────────────────────────────────────────────────
// Ubah `perStatus` ([{ status, count }]) menjadi { diajukan: 3, ... } dengan
// kunci yang sudah dinormalkan.
export function countsFromPerStatus(perStatus) {
  const counts = {}
  ;(perStatus || []).forEach((row) => {
    const key = normalizeStatus(row?.status) || 'lainnya'
    counts[key] = (counts[key] || 0) + (Number(row?.count) || 0)
  })
  return counts
}

// Segmen sebaran mengikuti alur hidup proposal. Selisih terhadap total
// (status yang tidak dikenal) dikumpulkan sebagai "Lainnya" agar angka tetap
// menjumlah ke total.
export function lifecycleSegments(counts, total) {
  const segments = STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_META[key].label,
    value: Number(counts[key]) || 0,
    hex: STATUS_META[key].hex,
  }))

  const known = segments.reduce((sum, s) => sum + s.value, 0)
  const rest = Math.max(Number(counts.lainnya) || 0, (Number(total) || 0) - known)
  if (rest > 0) segments.push({ key: 'lainnya', label: 'Lainnya', value: rest, hex: OTHER_STATUS_HEX })
  return segments
}

export function approvalHint(disetujui, ditolak) {
  const approved = Number(disetujui) || 0
  const decided = approved + (Number(ditolak) || 0)
  if (decided === 0) return 'Belum ada keputusan akhir'
  return `${Math.round((approved / decided) * 100)}% dari ${decided} yang diputuskan`
}

// Akhiri kalimat dengan satu titik (nama bergelar seperti "M.Pd." sudah berakhir titik).
export function sentence(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

export function attentionTail(count) {
  return count === 0
    ? 'Tidak ada yang perlu diperhatikan saat ini.'
    : `Ada ${count} hal yang perlu Anda perhatikan.`
}

// ── Periode ─────────────────────────────────────────────────────────────────
function byEnd(a, b) {
  const x = a.selesai ? new Date(a.selesai).getTime() : Infinity
  const y = b.selesai ? new Date(b.selesai).getTime() : Infinity
  return x - y
}

// Dari respons /periode atau dari statistik ringkas ({ id, nama, tahun, jenis }).
export function mapPeriods(rows) {
  return (rows || [])
    .map((p) => ({
      key: p.id ?? `${p.nama}-${p.tahun ?? ''}`,
      nama: p.nama,
      jenis: p.jenis,
      tahun: p.tahun,
      mulai: p.tanggalMulai,
      selesai: p.tanggalSelesai,
    }))
    .sort(byEnd)
}

// Periode yang menempel pada proposal (dipakai peran yang tidak membaca /periode).
export function periodsFromProposals(proposals) {
  const seen = new Map()
  ;(proposals || []).forEach((proposal) => {
    const p = proposal?.periode
    if (!p?.nama) return
    const key = p.id ?? `${p.nama}-${p.tahun ?? ''}`
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        nama: p.nama,
        jenis: p.jenis,
        tahun: p.tahun,
        mulai: p.tanggalMulai,
        selesai: p.tanggalSelesai,
      })
    }
  })
  return [...seen.values()].sort(byEnd)
}

// Baris untuk panel "Periode": nama, rentang, jenis, dan kemajuan waktu.
export function periodRows(periods, limit = 4) {
  return periods.slice(0, limit).map((p) => {
    const timing = periodTiming(p)
    return {
      key: p.key,
      label: p.nama,
      sub: timing.range || (p.tahun ? `Tahun ${p.tahun}` : null),
      badge: JENIS_LABEL[p.jenis] || p.jenis || null,
      progress: timing.progress,
      progressLabel: timing.label,
      urgent: timing.urgent,
    }
  })
}

// Periode yang berakhir dalam 14 hari masuk daftar "Perlu perhatian".
export function periodAttention(periods, { to, cta }) {
  return periods
    .map((p) => ({ p, days: daysUntil(p.selesai) }))
    .filter(({ days }) => days !== null && days >= 0 && days <= 14)
    .slice(0, 2)
    .map(({ p, days }) => ({
      key: `periode-${p.key}`,
      tone: days <= 3 ? 'warning' : 'info',
      title: `Periode ${p.nama} ${days === 0 ? 'berakhir hari ini' : `berakhir ${days} hari lagi`}`,
      detail: `Batas akhir ${formatDay(p.selesai)}.`,
      to,
      cta,
    }))
}

// ── Tugasan review ──────────────────────────────────────────────────────────
// Dipakai peran reviewer, dan peran lain yang juga memegang tugasan review.
export async function loadTugasan() {
  const res = await reviewerApi.getMyTugasan({ page: 1, limit: 50 })
  const rows = res.data.data || []
  return { rows, total: Number(res.data.meta?.total) || rows.length }
}

// Tiga keadaan yang sama dengan kartu di halaman penugasan:
// belum direview (tanpa review), draft tersimpan, dan selesai.
export function digestTugasan({ rows, total }) {
  let belum = 0
  let draft = 0
  let selesai = 0
  const rekomendasi = { disetujui: 0, revisi: 0, ditolak: 0 }

  rows.forEach((t) => {
    const review = t.myReview
    if (review?.isDone === true) {
      selesai += 1
      if (rekomendasi[review.rekomendasi] !== undefined) rekomendasi[review.rekomendasi] += 1
    } else if (review) {
      draft += 1
    } else {
      belum += 1
    }
  })

  return {
    rows,
    loaded: rows.length,
    total: Math.max(total, rows.length),
    belum,
    draft,
    selesai,
    rekomendasi,
    partial: total > rows.length,
  }
}

export function tugasanAttention(digest) {
  const open = digest.belum + digest.draft
  if (open === 0) return []

  const parts = []
  if (digest.belum > 0) parts.push(`${digest.belum} belum dimulai`)
  if (digest.draft > 0) parts.push(`${digest.draft} berupa draft`)

  return [
    {
      key: 'tugasan-review',
      tone: 'warning',
      title: `${open}${digest.partial ? '+' : ''} tugasan review belum selesai`,
      detail: `${parts.join(', ')}.`,
      to: '/penugasan',
      cta: 'Buka penugasan',
    },
  ]
}

export function tugasanShortcut(digest) {
  const open = digest ? digest.belum + digest.draft : null
  return {
    to: '/penugasan',
    label: 'Penugasan review',
    desc:
      open === null
        ? 'Proposal yang ditugaskan untuk Anda review.'
        : open > 0
          ? `${open} tugasan belum selesai.`
          : 'Semua tugasan sudah selesai.',
  }
}

export const PROFILE_SHORTCUT = {
  to: '/profil',
  label: 'Profil saya',
  desc: 'Perbarui data akun dan kata sandi.',
}

// Nama pengusul dengan cadangan yang sama di seluruh aplikasi.
export function personName(person) {
  return person?.fullName || person?.name || '—'
}

// Undangan tim yang belum direspons (dosen dan mahasiswa memakai bentuk yang sama).
export function invitationAttention(invitations) {
  if (invitations.length === 0) return []

  const first = invitations[0]
  const title = first.proposal?.judul
  const from = first.proposal?.pengusul ? personName(first.proposal.pengusul) : null
  const more = invitations.length > 1 ? ` dan ${invitations.length - 1} undangan lainnya` : ''

  return [
    {
      key: 'undangan',
      tone: 'warning',
      title: `${invitations.length} undangan tim menunggu respons`,
      detail: title ? sentence(`“${title}”${from ? ` dari ${from}` : ''}${more}`) : null,
      to: '/undangan',
      cta: 'Tinjau undangan',
    },
  ]
}
