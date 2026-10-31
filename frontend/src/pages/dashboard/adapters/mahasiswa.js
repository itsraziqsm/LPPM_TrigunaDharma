import { laporanHarianApi } from '../../../api/laporanHarian'
import { proposalDosenApi } from '../../../api/Proposaldosen'
import {
  daysUntil,
  formatDay,
  countStatuses,
  normalizeStatus,
  sortAttention,
  statusMeta,
} from '../format'
import {
  PROFILE_SHORTCUT,
  attentionTail,
  digestTugasan,
  invitationAttention,
  lifecycleSegments,
  loadTugasan,
  periodRows,
  periodsFromProposals,
  personName,
  req,
  settleAll,
  tugasanAttention,
  tugasanShortcut,
} from './shared'

// Laporan diambil dari beberapa proposal pertama saja (satu permintaan per
// proposal), sama seperti dashboard sebelumnya, dengan batas yang sedikit lebih longgar.
const LAPORAN_SAMPLE = 5
// Laporan terakhir yang lebih lama dari ini ditandai pada "Perlu perhatian".
const STALE_AFTER_DAYS = 2

const peranLabel = (peran) => (peran ? peran.charAt(0).toUpperCase() + peran.slice(1) : '—')

export const actions = [
  { to: '/undangan', label: 'Undangan ikut serta', variant: 'secondary' },
  { to: '/laporan-harian', label: 'Isi laporan harian', variant: 'primary' },
]

export async function load({ withReviewerDigest }) {
  const first = await settleAll({
    proposals: req('Proposal diikuti', () =>
      laporanHarianApi.getMyProposals().then((r) => r.data.data || []),
    ),
    invitations: req('Undangan ikut serta', () =>
      proposalDosenApi
        .getMyInvitations()
        .then((r) => (r.data.data || []).filter((i) => i.statusUndangan === 'pending')),
    ),
    ...(withReviewerDigest ? { tugasan: req('Tugasan review', loadTugasan) } : {}),
  })

  const proposals = first.data.proposals || []
  const invitations = first.data.invitations || []
  const digest = first.data.tugasan ? digestTugasan(first.data.tugasan) : null

  // Laporan per proposal: kegagalan satu proposal tidak membatalkan yang lain.
  const sampled = proposals.slice(0, LAPORAN_SAMPLE)
  const laporanResults = await Promise.all(
    sampled.map((proposal) =>
      laporanHarianApi
        .getByProposal(proposal.id)
        .then((r) => ({ ok: true, proposal, rows: r.data.data || [] }))
        .catch(() => ({ ok: false, proposal, rows: [] })),
    ),
  )
  const laporanFailed = laporanResults.some((r) => !r.ok)
  const failed = laporanFailed ? [...first.failed, 'Laporan harian'] : first.failed

  const laporan = laporanResults
    .flatMap((r) => r.rows.map((row) => ({ ...row, proposalJudul: r.proposal.judul })))
    .sort((a, b) => (parseTime(b.tanggal) || 0) - (parseTime(a.tanggal) || 0))

  const last7 = laporan.filter((l) => {
    const diff = daysUntil(l.tanggal)
    return diff !== null && diff <= 0 && diff >= -6
  })

  const counts = countStatuses(proposals)
  const approved = counts.disetujui || 0
  const periods = periodsFromProposals(proposals)
  const hasProposals = Boolean(first.data.proposals)

  // ── Perlu perhatian ───────────────────────────────────────────────────────
  const attention = []

  attention.push(...invitationAttention(invitations, 'undangan ikut serta'))

  if (digest) attention.push(...tugasanAttention(digest))

  // Proposal yang sudah disetujui tetapi laporan terakhirnya sudah lama (atau belum ada).
  laporanResults
    .filter((r) => r.ok && normalizeStatus(r.proposal.status) === 'disetujui')
    .map((r) => {
      const latest = r.rows.map((row) => daysUntil(row.tanggal)).filter((d) => d !== null)
      const daysAgo = latest.length > 0 ? -Math.max(...latest) : null
      return { proposal: r.proposal, daysAgo }
    })
    .filter(({ daysAgo }) => daysAgo === null || daysAgo >= STALE_AFTER_DAYS)
    .slice(0, 2)
    .forEach(({ proposal, daysAgo }) => {
      attention.push({
        key: `laporan-${proposal.id}`,
        tone: 'info',
        title:
          daysAgo === null
            ? `Belum ada laporan harian untuk “${proposal.judul}”`
            : `Laporan harian “${proposal.judul}” terakhir dibuat ${daysAgo} hari lalu`,
        detail: null,
        to: proposal.jenis ? `/project/${proposal.jenis}?id=${proposal.id}` : '/laporan-harian',
        cta: 'Isi laporan',
      })
    })

  const sortedAttention = sortAttention(attention)

  // ── Ringkasan satu kalimat ────────────────────────────────────────────────
  let fact = 'Daftar proposal belum termuat.'
  if (hasProposals) {
    fact =
      proposals.length === 0
        ? 'Anda belum terlibat di proposal mana pun.'
        : `Anda terlibat di ${proposals.length} proposal.`
  }

  const n = (value) => (hasProposals ? value : null)
  const sampleHint =
    proposals.length === 0
      ? 'Belum ada proposal'
      : proposals.length > LAPORAN_SAMPLE
        ? `Dari ${LAPORAN_SAMPLE} proposal pertama`
        : 'Dari seluruh proposal Anda'

  return {
    ok: first.ok,
    failed,
    model: {
      summary: `${fact} ${attentionTail(sortedAttention.length)}`,

      kpis: [
        {
          key: 'total',
          label: 'Proposal diikuti',
          value: n(proposals.length),
          hint: 'Proposal tempat Anda terdaftar',
        },
        {
          key: 'undangan',
          label: 'Undangan menunggu',
          value: first.data.invitations ? invitations.length : null,
          tone: 'warning',
          hint: 'Menunggu respons Anda',
        },
        {
          key: 'laporan',
          label: 'Laporan 7 hari terakhir',
          value: n(last7.length),
          hint: sampleHint,
        },
        {
          key: 'selesai',
          label: 'Proposal disetujui',
          value: n(approved),
          hint: hasProposals ? `${approved} dari ${proposals.length} proposal diikuti` : 'Data belum termuat',
        },
      ],

      attention: {
        items: sortedAttention,
        emptyDesc: 'Tidak ada undangan ikut serta yang menunggu respons Anda.',
      },

      pipeline: {
        title: 'Status proposal',
        subtitle: 'Proposal yang Anda ikuti',
        unit: 'proposal',
        segments: lifecycleSegments(counts, proposals.length),
        emptyTitle: 'Belum ada proposal',
        emptyDesc: 'Sebaran status tampil setelah Anda bergabung di sebuah proposal.',
        unavailable: !hasProposals,
      },

      list: {
        title: 'Proposal yang diikuti',
        items: proposals.map((p) => ({
          key: p.id,
          title: p.judul,
          meta: [
            { label: 'Pengusul', value: personName(p.pengusul) },
            { label: 'Periode', value: p.periode?.nama || '—' },
            { label: 'Peran', value: peranLabel(p.peran) },
          ],
          status: statusMeta(p.status),
          note: null,
        })),
        to: '/laporan-harian',
        toLabel: 'Buka laporan harian',
        emptyTitle: 'Belum ada proposal yang diikuti',
        emptyDesc: 'Proposal muncul di sini setelah Anda menerima undangan dari dosen pengusul.',
        emptyAction: { to: '/undangan', label: 'Lihat undangan' },
        unavailable: !hasProposals,
      },

      side: {
        title: 'Periode proposal',
        subtitle: 'Periode dari proposal yang Anda ikuti',
        rows: periodRows(periods),
        emptyTitle: 'Belum ada periode',
        emptyDesc: 'Periode tampil setelah Anda terdaftar di sebuah proposal.',
        unavailable: !hasProposals,
      },

      feed: {
        title: 'Laporan harian terbaru',
        items: laporan.slice(0, 6).map((l) => ({
          key: l.id,
          lead: l.kegiatan,
          detail: l.proposalJudul,
          when: formatDay(l.tanggal),
        })),
        to: '/laporan-harian',
        toLabel: 'Lihat semua laporan',
        emptyTitle: 'Belum ada laporan harian',
        emptyDesc: 'Laporan yang Anda buat akan tampil di sini.',
        unavailable: !hasProposals || (laporanFailed && laporan.length === 0),
      },

      shortcuts: [
        {
          to: '/project/penelitian',
          label: 'Project saya',
          desc: hasProposals
            ? `${last7.length} laporan dalam 7 hari terakhir.`
            : 'Buat dan lihat laporan kegiatan.',
        },
        {
          to: '/undangan',
          label: 'Undangan ikut serta',
          desc: first.data.invitations
            ? invitations.length > 0
              ? `${invitations.length} menunggu respons.`
              : 'Tidak ada undangan baru.'
            : 'Tinjau undangan dan konfirmasi.',
        },
        { to: '/arsip-project', label: 'Arsip project', desc: 'Project yang diikuti per periode.' },
        { to: '/cetak-laporan', label: 'Cetak laporan', desc: 'Rekap laporan harian (PDF).' },
        ...(withReviewerDigest ? [tugasanShortcut(digest)] : []),
        PROFILE_SHORTCUT,
      ],
    },
  }
}

function parseTime(value) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? 0 : time
}
