import { monitoringApi } from '../../../api/monitoring'
import { periodeApi } from '../../../api/periode'
import { JENIS_LABEL, formatDate, statusMeta } from '../format'
import { PROFILE_SHORTCUT, attentionTail, countsFromPerStatus, lifecycleSegments, mapPeriods, periodRows, personName, req, settleAll } from './shared'

// Ketua STMIK: pemantauan saja (W-37). Data dari /monitoring (proposal yang sudah diajukan).
export const actions = []

export const rupiahRingkas = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}

export async function load() {
  const { data, failed, ok } = await settleAll({
    ringkasan: req('Ringkasan pemantauan', () => monitoringApi.ringkasan().then((r) => r.data.data)),
    proposals: req('Proposal terbaru', () => monitoringApi.proposals({ limit: 6 }).then((r) => r.data.data || [])),
    periods: req('Periode aktif', () => periodeApi.getAll({ limit: 100, isAktif: true }).then((r) => r.data.data || [])),
  })

  const rk = data.ringkasan
  const has = Boolean(rk)
  const counts = countsFromPerStatus(Object.entries(rk?.perStatus || {}).map(([status, count]) => ({ status, count })))
  const total = Number(rk?.jumlahProposal) || 0
  const n = (v) => (has ? v : null)
  const periods = mapPeriods(data.periods)

  return {
    ok,
    failed,
    model: {
      summary: has ? `${total} proposal diajukan oleh ${rk.jumlahDosenPengusul} dosen. ${attentionTail(0)}` : 'Ringkasan belum termuat.',
      kpis: [
        { key: 'total', label: 'Proposal diajukan', value: n(total), hint: 'Tanpa draft' },
        { key: 'dosen', label: 'Dosen pengusul', value: n(Number(rk?.jumlahDosenPengusul) || 0), hint: 'Dosen yang memasukkan proposal' },
        { key: 'selesai', label: 'Disetujui', value: n(counts.disetujui || 0), hint: has ? `Anggaran ${rupiahRingkas(rk.anggaranDisetujui)}` : 'Data belum termuat' },
        { key: 'anggaran', label: 'Total anggaran diajukan', value: has ? rupiahRingkas(rk.totalAnggaran) : null, tone: 'warning', hint: 'Seluruh proposal diajukan' },
      ],
      attention: { items: [], emptyDesc: 'Pemantauan saja — tidak ada tindakan yang menunggu Anda.' },
      pipeline: {
        title: 'Status proposal',
        subtitle: 'Proposal yang sudah diajukan',
        unit: 'proposal',
        segments: lifecycleSegments(counts, total),
        emptyTitle: 'Belum ada proposal',
        emptyDesc: 'Sebaran status tampil setelah dosen mengajukan proposal.',
        unavailable: !has,
      },
      list: {
        title: 'Proposal terbaru',
        items: (data.proposals || []).map((p) => ({
          key: p.id,
          title: p.judul,
          meta: [
            { label: 'Pengusul', value: personName(p.pengusul) },
            { label: 'Jenis', value: JENIS_LABEL[p.jenis] || p.jenis || '—' },
            { label: 'Anggaran', value: p.anggaran != null ? rupiahRingkas(p.anggaran) : '—' },
          ],
          status: statusMeta(p.status),
          note: p.submittedAt ? formatDate(p.submittedAt) : null,
        })),
        to: '/pemantauan',
        toLabel: 'Buka pemantauan',
        emptyTitle: 'Belum ada proposal',
        emptyDesc: 'Proposal yang diajukan dosen akan muncul di sini.',
        unavailable: !data.proposals,
      },
      side: {
        title: 'Periode berjalan',
        subtitle: 'Periode yang sedang aktif',
        rows: periodRows(periods),
        emptyTitle: 'Belum ada periode aktif',
        emptyDesc: 'Periode aktif tampil di sini.',
        unavailable: !data.periods,
      },
      feed: null,
      shortcuts: [
        { to: '/pemantauan', label: 'Pemantauan proposal', desc: 'Proposal, progres, anggaran & dosen pengusul.' },
        { to: '/pemantauan?tab=dosen', label: 'Dosen pengusul', desc: 'Rekap per dosen.' },
        { to: '/users', label: 'Monitor pengguna', desc: 'Data pengguna, peran & status akun (baca saja).' },
        PROFILE_SHORTCUT,
      ],
    },
  }
}
