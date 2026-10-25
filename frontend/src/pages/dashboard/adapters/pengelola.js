import { dashboardApi } from '../../../api/dashboard'
import { proposalApi } from '../../../api/proposal'
import { usersApi } from '../../../api/users'
import { periodeApi } from '../../../api/periode'
import { activityLogApi } from '../../../api/activityLog'
import { JENIS_LABEL, formatDate, sortAttention, statusMeta, timeAgo } from '../format'
import {
  PROFILE_SHORTCUT,
  approvalHint,
  attentionTail,
  countsFromPerStatus,
  digestTugasan,
  lifecycleSegments,
  loadTugasan,
  mapPeriods,
  periodAttention,
  periodRows,
  personName,
  req,
  settleAll,
  tugasanAttention,
  tugasanShortcut,
} from './shared'

// Admin dan Ketua LPPM memakai satu adapter: keduanya mengelola proposal,
// periode, dan akun.
export const actions = [
  { to: '/cetak-dokumen', label: 'Cetak dokumen', variant: 'secondary' },
  { to: '/proposals', label: 'Buka proposal', variant: 'primary' },
]

export async function load({ withReviewerDigest }) {
  const { data, failed, ok } = await settleAll({
    stats: req('Statistik proposal', () => dashboardApi.getStats().then((r) => r.data.data)),
    proposals: req('Proposal terbaru', () =>
      proposalApi.getAll({ page: 1, limit: 6 }).then((r) => r.data.data || []),
    ),
    pending: req('Akun menunggu persetujuan', () =>
      usersApi.getAll({ page: 1, limit: 1, status: 'pending' }).then((r) => r.data),
    ),
    periods: req('Periode aktif', () =>
      periodeApi.getAll({ limit: 100, isAktif: true }).then((r) => r.data.data || []),
    ),
    logs: req('Aktivitas sistem', () =>
      activityLogApi.getAll({ limit: 8 }).then((r) => r.data.data || []),
    ),
    ...(withReviewerDigest ? { tugasan: req('Tugasan review', loadTugasan) } : {}),
  })

  const stats = data.stats
  const hasStats = Boolean(stats)
  const counts = countsFromPerStatus(stats?.perStatus)
  const total = Number(stats?.totalProposal) || Object.values(counts).reduce((a, b) => a + b, 0)
  const n = (value) => (hasStats ? value || 0 : null)

  // Data periode lengkap dari /periode; bila gagal, pakai daftar ringkas dari statistik.
  const periodsKnown = Boolean(data.periods || stats?.periodeAktif)
  const periods = mapPeriods(data.periods || stats?.periodeAktif)

  const pendingUsers = Number(data.pending?.meta?.total ?? data.pending?.total) || 0
  const digest = data.tugasan ? digestTugasan(data.tugasan) : null

  // ── Perlu perhatian ───────────────────────────────────────────────────────
  const attention = []
  if (counts.diajukan > 0) {
    attention.push({
      key: 'antre',
      tone: 'warning',
      title: `${counts.diajukan} proposal menunggu diproses`,
      detail: 'Sudah diajukan dosen dan belum masuk tahap review.',
      to: '/proposals',
      cta: 'Buka proposal',
    })
  }
  if (pendingUsers > 0) {
    attention.push({
      key: 'akun',
      tone: 'warning',
      title: `${pendingUsers} akun menunggu persetujuan`,
      detail: 'Akun baru yang belum disetujui atau ditolak.',
      to: '/users',
      cta: 'Tinjau akun',
    })
  }
  if (digest) attention.push(...tugasanAttention(digest))
  if (data.periods && periods.length === 0) {
    attention.push({
      key: 'tanpa-periode',
      tone: 'info',
      title: 'Belum ada periode aktif',
      detail: 'Buat atau aktifkan periode dari halaman Periode.',
      to: '/periode',
      cta: 'Kelola periode',
    })
  }
  attention.push(...periodAttention(periods, { to: '/periode', cta: 'Lihat periode' }))

  const sortedAttention = sortAttention(attention)

  // ── Ringkasan satu kalimat ────────────────────────────────────────────────
  let fact = 'Ringkasan proposal belum termuat.'
  if (hasStats) {
    const periodClause = !periodsKnown
      ? ''
      : periods.length > 0
        ? ` di ${periods.length} periode aktif`
        : ', belum ada periode aktif'
    fact = `${total} proposal tercatat${periodClause}.`
  }

  return {
    ok,
    failed,
    model: {
      summary: `${fact} ${attentionTail(sortedAttention.length)}`,

      kpis: [
        { key: 'total', label: 'Total proposal', value: n(total), hint: 'Seluruh proposal di sistem' },
        {
          key: 'antre',
          label: 'Menunggu diproses',
          value: n(counts.diajukan),
          tone: 'warning',
          hint: 'Diajukan, belum masuk review',
        },
        { key: 'proses', label: 'Sedang direview', value: n(counts.review), hint: 'Sedang dinilai reviewer' },
        {
          key: 'selesai',
          label: 'Disetujui',
          value: n(counts.disetujui),
          hint: hasStats ? approvalHint(counts.disetujui, counts.ditolak) : 'Data belum termuat',
        },
      ],

      attention: {
        items: sortedAttention,
        emptyDesc: 'Tidak ada proposal yang menunggu dan tidak ada akun baru untuk ditinjau.',
      },

      pipeline: {
        title: 'Status proposal',
        subtitle: 'Seluruh proposal di sistem',
        unit: 'proposal',
        segments: lifecycleSegments(counts, total),
        emptyTitle: 'Belum ada proposal',
        emptyDesc: 'Sebaran status tampil setelah dosen mengajukan proposal.',
        unavailable: !hasStats,
      },

      list: {
        title: 'Proposal terbaru',
        items: (data.proposals || []).slice(0, 6).map((p) => ({
          key: p.id,
          title: p.judul,
          meta: [
            { label: 'Pengusul', value: personName(p.pengusul) },
            { label: 'Jenis', value: JENIS_LABEL[p.jenis] || p.jenis || '—' },
            ...(p.periode?.nama ? [{ label: 'Periode', value: p.periode.nama }] : []),
          ],
          status: statusMeta(p.status),
          note: p.createdAt ? formatDate(p.createdAt) : null,
        })),
        to: '/proposals',
        toLabel: 'Lihat semua proposal',
        emptyTitle: 'Belum ada proposal',
        emptyDesc: 'Proposal yang diajukan dosen akan muncul di sini.',
        unavailable: !data.proposals,
      },

      side: {
        title: 'Periode berjalan',
        subtitle: 'Periode yang sedang aktif',
        rows: periodRows(periods),
        to: '/periode',
        toLabel: 'Kelola periode',
        emptyTitle: 'Belum ada periode aktif',
        emptyDesc: 'Buat atau aktifkan periode dari halaman Periode.',
        unavailable: !periodsKnown,
      },

      feed: {
        title: 'Aktivitas sistem',
        items: (data.logs || []).map((log) => ({
          key: log.id,
          lead: log.user?.name || 'Sistem',
          rest: log.action,
          detail: log.description,
          when: timeAgo(log.createdAt),
        })),
        emptyTitle: 'Belum ada aktivitas',
        emptyDesc: 'Aktivitas pengguna akan tercatat di sini.',
        unavailable: !data.logs,
      },

      shortcuts: [
        {
          to: '/proposals',
          label: 'Proposal',
          desc: hasStats
            ? `${total} proposal, ${counts.diajukan || 0} menunggu diproses.`
            : 'Tinjau dan proses proposal.',
        },
        {
          to: '/users',
          label: 'User',
          desc: stats?.users
            ? `${stats.users.total ?? 0} akun: ${stats.users.dosen ?? 0} dosen, ${stats.users.reviewer ?? 0} reviewer.`
            : 'Kelola akun dan peran pengguna.',
        },
        {
          to: '/periode',
          label: 'Periode',
          desc: periodsKnown ? `${periods.length} periode aktif.` : 'Kelola periode proposal.',
        },
        { to: '/cetak-dokumen', label: 'Cetak dokumen', desc: 'Rekap proposal & surat tugas (PDF).' },
        ...(withReviewerDigest ? [tugasanShortcut(digest)] : []),
        PROFILE_SHORTCUT,
      ],
    },
  }
}
