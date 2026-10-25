import {
  JENIS_LABEL,
  formatDate,
  normalizeStatus,
  sinceLabel,
  statusMeta,
} from '../format'
import {
  PROFILE_SHORTCUT,
  digestTugasan,
  loadTugasan,
  personName,
  req,
  settleAll,
} from './shared'

export const actions = [{ to: '/penugasan', label: 'Buka penugasan review', variant: 'primary' }]

// Keadaan review sama dengan kartu di halaman penugasan.
const REVIEW_STATE = {
  belum: { label: 'Belum direview', className: 'badge-neutral' },
  draft: { label: 'Draft tersimpan', className: 'badge-warning' },
  selesai: { label: 'Selesai', className: 'badge-success' },
}

const REKOMENDASI = [
  { key: 'disetujui', label: 'Disetujui', hex: '#348a63' },
  { key: 'revisi', label: 'Perlu revisi', hex: '#c0702a' },
  { key: 'ditolak', label: 'Ditolak', hex: '#c54a42' },
]

// Butir tugasan yang ditampilkan di "Perlu perhatian"; sisanya diringkas satu baris.
const MAX_ATTENTION = 3

const REKOMENDASI_LABEL = Object.fromEntries(REKOMENDASI.map((r) => [r.key, r.label]))

function reviewState(tugasan) {
  const review = tugasan.myReview
  if (review?.isDone === true) return 'selesai'
  return review ? 'draft' : 'belum'
}

function createdTime(tugasan) {
  const time = tugasan.createdAt ? new Date(tugasan.createdAt).getTime() : NaN
  return Number.isNaN(time) ? 0 : time
}

export async function load() {
  const { data, failed, ok } = await settleAll({
    tugasan: req('Tugasan review', loadTugasan),
  })

  const digest = data.tugasan ? digestTugasan(data.tugasan) : null
  const hasDigest = Boolean(digest)
  const open = hasDigest ? digest.belum + digest.draft : 0
  const n = (value) => (hasDigest ? value : null)

  // ── Perlu perhatian: tugasan yang belum selesai, yang paling lama dulu ────
  const attention = []
  if (hasDigest) {
    const unfinished = digest.rows
      .filter((t) => reviewState(t) !== 'selesai')
      .sort((a, b) => createdTime(a) - createdTime(b))

    unfinished.slice(0, MAX_ATTENTION).forEach((t) => {
      const isDraft = reviewState(t) === 'draft'
      attention.push({
        key: `tugasan-${t.id}`,
        tone: isDraft ? 'info' : 'warning',
        title: t.proposal?.judul || `Proposal #${t.proposalId}`,
        detail: `${isDraft ? 'Draft tersimpan, belum difinalisasi' : 'Belum dimulai'}. Ditugaskan ${sinceLabel(t.createdAt)}.`,
        to: '/penugasan',
        cta: isDraft ? 'Lanjutkan' : 'Mulai review',
      })
    })

    if (unfinished.length > MAX_ATTENTION) {
      attention.push({
        key: 'tugasan-lain',
        tone: 'neutral',
        title: `${unfinished.length - MAX_ATTENTION} tugasan lainnya belum selesai`,
        detail: null,
        to: '/penugasan',
        cta: 'Lihat semua',
      })
    }
  }

  // ── Ringkasan satu kalimat ────────────────────────────────────────────────
  let summary = 'Daftar tugasan belum termuat.'
  if (hasDigest) {
    if (digest.total === 0) summary = 'Belum ada tugasan review untuk Anda.'
    else if (open === 0) summary = `Anda memiliki ${digest.total} tugasan review dan semuanya sudah selesai.`
    else summary = `Anda memiliki ${digest.total} tugasan review: ${digest.selesai} selesai, ${open} belum selesai.`
  }

  const rekomendasiRows = hasDigest
    ? REKOMENDASI.map((r) => {
        const count = digest.rekomendasi[r.key]
        const share = digest.selesai > 0 ? Math.round((count / digest.selesai) * 100) : 0
        return {
          key: r.key,
          label: r.label,
          sub: null,
          badge: null,
          progress: share,
          progressLabel: `${count} tugasan (${share}%)`,
          hex: r.hex,
          urgent: false,
        }
      })
    : []

  return {
    ok,
    failed,
    model: {
      summary,

      kpis: [
        {
          key: 'total',
          label: 'Total tugasan',
          value: n(digest?.total),
          hint: digest?.partial ? `${digest.loaded} terbaru dihitung` : 'Seluruh penugasan Anda',
        },
        {
          key: 'belum',
          label: 'Belum direview',
          value: n(digest?.belum),
          tone: 'warning',
          hint: 'Belum dimulai',
        },
        {
          key: 'draft',
          label: 'Draft tersimpan',
          value: n(digest?.draft),
          hint: 'Belum difinalisasi',
        },
        {
          key: 'selesai',
          label: 'Selesai direview',
          value: n(digest?.selesai),
          hint:
            hasDigest && digest.selesai > 0
              ? `${digest.rekomendasi.disetujui} disetujui, ${digest.rekomendasi.revisi} revisi, ${digest.rekomendasi.ditolak} ditolak`
              : 'Belum ada yang selesai',
        },
      ],

      attention: {
        items: attention,
        emptyDesc: hasDigest && digest.total === 0
          ? 'Tugasan baru dari Ketua LPPM akan muncul di sini.'
          : 'Semua tugasan review sudah selesai.',
      },

      pipeline: {
        title: 'Progres review',
        subtitle: 'Penugasan yang diberikan kepada Anda',
        unit: 'tugasan',
        segments: [
          { key: 'belum', label: 'Belum direview', value: digest?.belum || 0, hex: '#98a3b7' },
          { key: 'draft', label: 'Draft tersimpan', value: digest?.draft || 0, hex: '#4e69a6' },
          { key: 'selesai', label: 'Selesai', value: digest?.selesai || 0, hex: '#348a63' },
        ],
        emptyTitle: 'Belum ada tugasan',
        emptyDesc: 'Progres tampil setelah Ketua LPPM menugaskan proposal kepada Anda.',
        unavailable: !hasDigest,
      },

      list: {
        title: 'Tugasan review',
        items: (digest?.rows || []).slice(0, 6).map((t) => {
          const state = reviewState(t)
          const rekomendasi = t.myReview?.rekomendasi
          return {
            key: t.id,
            title: t.proposal?.judul || `Proposal #${t.proposalId}`,
            meta: [
              { label: 'Pengusul', value: personName(t.proposal?.pengusul) },
              { label: 'Jenis', value: JENIS_LABEL[t.proposal?.jenis] || t.proposal?.jenis || '—' },
              { label: 'Ditugaskan', value: formatDate(t.createdAt) },
              // Status proposal hanya berguna bila sudah bergeser dari tahap review.
              ...(normalizeStatus(t.proposal?.status) && normalizeStatus(t.proposal?.status) !== 'review'
                ? [{ label: 'Proposal', value: statusMeta(t.proposal.status).label }]
                : []),
            ],
            status: REVIEW_STATE[state],
            note: state === 'selesai' && rekomendasi ? REKOMENDASI_LABEL[rekomendasi] || rekomendasi : null,
          }
        }),
        to: '/penugasan',
        toLabel: 'Buka penugasan review',
        emptyTitle: 'Belum ada tugasan review',
        emptyDesc: 'Tugasan muncul di sini saat Ketua LPPM menugaskan proposal kepada Anda.',
        unavailable: !hasDigest,
      },

      side: {
        title: 'Rekomendasi Anda',
        subtitle: 'Dari review yang sudah selesai',
        rows: hasDigest && digest.selesai > 0 ? rekomendasiRows : [],
        emptyTitle: 'Belum ada review yang selesai',
        emptyDesc: 'Ringkasan rekomendasi tampil setelah Anda menyelesaikan review pertama.',
        unavailable: !hasDigest,
      },

      // Notifikasi terbaru tidak lagi tampil di Beranda (lonceng & /notifikasi tetap ada).
      feed: null,

      shortcuts: [
        {
          to: '/penugasan',
          label: 'Penugasan review',
          desc: hasDigest
            ? `${digest.belum} belum direview, ${digest.draft} draft tersimpan.`
            : 'Proposal yang ditugaskan untuk Anda review.',
        },
        PROFILE_SHORTCUT,
      ],
    },
  }
}
