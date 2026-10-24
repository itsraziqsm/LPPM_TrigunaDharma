import { proposalDosenApi } from '../../../api/Proposaldosen'
import { proposalApi } from '../../../api/proposal'
import { periodeApi } from '../../../api/periode'
import { notificationApi } from '../../../api/notification'
import {
  JENIS_LABEL,
  formatDate,
  normalizeStatus,
  sortAttention,
  statusMeta,
  timeAgo,
} from '../format'
import {
  PROFILE_SHORTCUT,
  approvalHint,
  attentionTail,
  digestTugasan,
  invitationAttention,
  lifecycleSegments,
  loadTugasan,
  mapPeriods,
  periodAttention,
  periodRows,
  req,
  sentence,
  settleAll,
  tugasanAttention,
  tugasanShortcut,
} from './shared'

export const actions = [
  { to: '/undangan', label: 'Undangan tim', variant: 'secondary' },
  { to: '/proposal-saya', label: 'Buat proposal baru', variant: 'primary' },
]

export async function load({ withReviewerDigest }) {
  const { data, failed, ok } = await settleAll({
    stats: req('Statistik proposal', () => proposalDosenApi.getStats().then((r) => r.data.data)),
    proposals: req('Proposal terbaru', () =>
      proposalDosenApi.getAll({ limit: 6 }).then((r) => r.data.data || []),
    ),
    invitations: req('Undangan tim', () =>
      proposalDosenApi
        .getMyInvitations()
        .then((r) => (r.data.data || []).filter((i) => i.statusUndangan === 'pending')),
    ),
    periods: req('Periode aktif', () =>
      periodeApi.getAll({ limit: 100, isAktif: true }).then((r) => r.data.data || []),
    ),
    notifications: req('Notifikasi', () =>
      notificationApi.getAll({ limit: 6 }).then((r) => r.data.data || []),
    ),
    penelitian: req('Jumlah penelitian', () => countDisetujui('penelitian')),
    pengabdian: req('Jumlah pengabdian', () => countDisetujui('pengabdian')),
    ...(withReviewerDigest ? { tugasan: req('Tugasan review', loadTugasan) } : {}),
  })

  const stats = data.stats
  const hasStats = Boolean(stats)
  const counts = {
    draft: Number(stats?.draft) || 0,
    diajukan: Number(stats?.diajukan) || 0,
    review: Number(stats?.review) || 0,
    revisi: Number(stats?.revisi) || 0,
    disetujui: Number(stats?.disetujui) || 0,
    ditolak: Number(stats?.ditolak) || 0,
  }
  const total = Number(stats?.total) || Object.values(counts).reduce((a, b) => a + b, 0)
  // /dosen/proposals/stats tidak mengirim jumlah "review"; selisih terhadap
  // total adalah proposal yang sedang direview.
  if (hasStats && stats.review === undefined) {
    counts.review = Math.max(0, total - Object.values(counts).reduce((a, b) => a + b, 0))
  }
  const inProcess = counts.diajukan + counts.review
  const n = (value) => (hasStats ? value : null)

  const proposals = data.proposals || []
  const invitations = data.invitations || []
  const periods = mapPeriods(data.periods)
  const digest = data.tugasan ? digestTugasan(data.tugasan) : null

  // Usulan terakhir: tahapan diturunkan dari status + laporan (lihat stageOf).
  const latest = proposals[0] || null
  let latestLaporan = null
  if (latest && normalizeStatus(latest.status) === 'disetujui') {
    try {
      latestLaporan = await proposalApi.getLaporan(latest.id).then((r) => r.data.data || [])
    } catch (error) {
      failed.push('Laporan usulan terakhir')
      console.error('[dashboard] gagal memuat Laporan usulan terakhir', error)
    }
  }

  // ── Perlu perhatian ───────────────────────────────────────────────────────
  const attention = []

  attention.push(...invitationAttention(invitations))

  if (counts.revisi > 0) {
    const first = proposals.find((p) => normalizeStatus(p.status) === 'revisi')
    attention.push({
      key: 'revisi',
      tone: 'warning',
      title: `${counts.revisi} proposal perlu direvisi`,
      detail: first
        ? `${sentence(`“${first.judul}”`)} Catatan revisi ada di detail proposal.`
        : 'Catatan revisi ada di detail proposal.',
      to: '/proposal-saya',
      cta: 'Buka proposal',
    })
  }

  if (digest) attention.push(...tugasanAttention(digest))

  if (counts.draft > 0) {
    attention.push({
      key: 'draft',
      tone: 'info',
      title: `${counts.draft} proposal masih draft`,
      detail: 'Belum diajukan ke LPPM.',
      to: '/proposal-saya',
      cta: 'Lanjutkan',
    })
  }

  attention.push(...periodAttention(periods, { to: '/proposal-saya', cta: 'Lihat proposal' }))

  const sortedAttention = sortAttention(attention)

  // ── Ringkasan satu kalimat ────────────────────────────────────────────────
  let fact = 'Ringkasan proposal belum termuat.'
  if (hasStats) {
    if (total === 0) fact = 'Anda belum memiliki proposal.'
    else if (inProcess > 0) fact = `Anda memiliki ${total} proposal, ${inProcess} di antaranya sedang diproses.`
    else fact = `Anda memiliki ${total} proposal.`
  }

  return {
    ok,
    failed,
    model: {
      summary: `${fact} ${attentionTail(sortedAttention.length)}`,

      // Blok khusus tampilan dosen (DosenScreen). Nilai `null` = data gagal
      // dimuat; bagian yang belum punya endpoint ditandai di tampilan dan
      // dicatat di docs/waitingApi-list.md.
      dosen: {
        cards: {
          diterima: n(counts.disetujui),
          ditolak: n(counts.ditolak),
          diproses: n(inProcess),
          revisi: n(counts.revisi),
          total: n(total),
        },
        latest: latest
          ? {
              id: latest.id,
              judul: latest.judul,
              jenis: JENIS_LABEL[latest.jenis] || latest.jenis || null,
              periode: latest.periode?.nama || null,
              status: statusMeta(latest.status),
              stage: stageOf(latest.status, latestLaporan),
            }
          : null,
        latestUnavailable: !data.proposals,
        penelitian: data.penelitian ?? null,
        pengabdian: data.pengabdian ?? null,
      },

      kpis: [
        {
          key: 'total',
          label: 'Proposal saya',
          value: n(total),
          hint: hasStats ? `${counts.draft} masih draft` : 'Data belum termuat',
        },
        {
          key: 'revisi',
          label: 'Perlu revisi',
          value: n(counts.revisi),
          tone: 'warning',
          hint: 'Dikembalikan untuk diperbaiki',
        },
        {
          key: 'proses',
          label: 'Dalam proses',
          value: n(inProcess),
          hint: 'Menunggu hasil penilaian',
        },
        {
          key: 'selesai',
          label: 'Disetujui',
          value: n(counts.disetujui),
          hint: hasStats ? approvalHint(counts.disetujui, counts.ditolak) : 'Data belum termuat',
        },
      ],

      attention: {
        items: sortedAttention,
        emptyDesc: 'Tidak ada undangan, revisi, atau draft yang menunggu Anda.',
      },

      pipeline: {
        title: 'Status proposal',
        subtitle: 'Proposal yang Anda usulkan',
        unit: 'proposal',
        segments: lifecycleSegments(counts, total),
        emptyTitle: 'Belum ada proposal',
        emptyDesc: 'Sebaran status tampil setelah Anda membuat proposal pertama.',
        unavailable: !hasStats,
      },

      list: {
        title: 'Proposal terbaru',
        items: proposals.slice(0, 6).map((p) => ({
          key: p.id,
          title: p.judul,
          meta: [
            { label: 'Jenis', value: JENIS_LABEL[p.jenis] || p.jenis || '—' },
            { label: 'Periode', value: p.periode?.nama || 'Belum ada periode' },
          ],
          status: statusMeta(p.status),
          note: p.createdAt ? formatDate(p.createdAt) : null,
        })),
        to: '/proposal-saya',
        toLabel: 'Lihat semua proposal',
        emptyTitle: 'Belum ada proposal',
        emptyDesc: 'Buat proposal pertama Anda untuk periode yang sedang berjalan.',
        emptyAction: { to: '/proposal-saya', label: 'Buat proposal' },
        unavailable: !data.proposals,
      },

      side: {
        title: 'Periode berjalan',
        subtitle: 'Periode yang sedang aktif',
        rows: periodRows(periods),
        emptyTitle: 'Belum ada periode aktif',
        emptyDesc: 'Periode aktif akan tampil di sini setelah dibuka oleh LPPM.',
        unavailable: !data.periods,
      },

      feed: {
        title: 'Notifikasi terbaru',
        items: (data.notifications || []).map((item) => ({
          key: item.id,
          lead: item.judul,
          detail: item.pesan,
          when: timeAgo(item.createdAt),
          unread: item.isRead === false,
        })),
        emptyTitle: 'Belum ada notifikasi',
        emptyDesc: 'Kabar tentang proposal dan undangan Anda akan muncul di sini.',
        unavailable: !data.notifications,
      },

      shortcuts: [
        {
          to: '/proposal-saya',
          label: 'Proposal saya',
          desc: hasStats ? `${total} proposal, ${counts.draft} draft.` : 'Kelola seluruh proposal Anda.',
        },
        {
          to: '/undangan',
          label: 'Undangan tim',
          desc: data.invitations
            ? invitations.length > 0
              ? `${invitations.length} menunggu respons.`
              : 'Tidak ada undangan baru.'
            : 'Tinjau undangan kolaborasi.',
        },
        ...(withReviewerDigest ? [tugasanShortcut(digest)] : []),
        PROFILE_SHORTCUT,
      ],
    },
  }
}

// Jumlah proposal milik dosen yang disetujui untuk satu jenis kegiatan
// (dibaca dari meta.total, cukup ambil satu baris).
function countDisetujui(jenis) {
  return proposalDosenApi
    .getAll({ jenis, status: 'disetujui', limit: 1 })
    .then((r) => Number(r.data.meta?.total) || 0)
}

// Tahapan pada desain: 0 Seleksi/Usulan, 1 Pelaksanaan Kegiatan,
// 2 Seleksi/Lanjutan, 3 Pasca pelaksanaan. Belum ada field/endpoint tahapan,
// jadi diturunkan: belum disetujui → 0; disetujui → 1; ada laporan kemajuan
// → 2; ada laporan akhir → 3.
function stageOf(status, laporan) {
  if (normalizeStatus(status) !== 'disetujui') return 0
  const jenis = (laporan || []).map((l) => l.jenis)
  if (jenis.includes('akhir')) return 3
  if (jenis.includes('kemajuan')) return 2
  return 1
}
