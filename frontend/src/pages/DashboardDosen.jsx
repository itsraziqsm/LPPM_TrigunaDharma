import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { proposalDosenApi } from '../api/Proposaldosen'
import useAuthStore from '../store/authStore'

// ---------------------------------------------------------------------------
// Palet status — selaras dengan lencana di seluruh aplikasi (nuansa diredam),
// agar makna warna tidak bergeser antara dashboard dan halaman daftar.
// `hex` dipakai grafik dan titik penanda; `className` memakai kelas lencana.
// ---------------------------------------------------------------------------
const STATUS_CONFIG = {
  draft: { label: 'Draft', className: 'badge-neutral', hex: '#98a3b7' },
  diajukan: { label: 'Diajukan', className: 'badge-info', hex: '#4e69a6' },
  disetujui: { label: 'Disetujui', className: 'badge-success', hex: '#348a63' },
  revisi: { label: 'Revisi', className: 'badge-warning', hex: '#c0702a' },
  ditolak: { label: 'Ditolak', className: 'badge-danger', hex: '#c54a42' },
}
const FALLBACK_STATUS = { label: 'Lainnya', className: 'badge-neutral', hex: '#cbd3df' }
const JENIS_COLOR = '#263f77' // navy tunggal — warna status sudah dimiliki lencana

function statusCfg(status) {
  return STATUS_CONFIG[status] || FALLBACK_STATUS
}

function StatCard({ label, value, hex }) {
  return (
    <article className="bg-white px-6 py-5">
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <span className="size-2 rounded-full" style={{ backgroundColor: hex }} />
        {label}
      </p>
      <p className="mt-2.5 font-serif text-[2.25rem] font-medium leading-none tracking-tight text-navy-950 tabular-nums">
        {value ?? '—'}
      </p>
    </article>
  )
}

function Badge({ status }) {
  const cfg = statusCfg(status)
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>
}

function SectionCard({ title, subtitle, action, children, noPadding }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-navy-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={noPadding ? '' : 'px-6 py-5'}>{children}</div>
    </section>
  )
}

function EmptyState({ title, desc, action }) {
  return (
    <div className="px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Tooltip grafik: bahasa visual yang sama dengan kartu (garis tipis, bayangan lembut).
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      {label && <p className="mb-1 font-semibold text-slate-900">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-slate-600">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="font-medium text-slate-900">{p.value}</span>
          <span>{p.name}</span>
        </p>
      ))}
    </div>
  )
}

export default function DashboardDosen() {
  const user = useAuthStore((s) => s.user)
  const [stats, setStats] = useState(null)
  const [proposals, setProposals] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, proposalRes, invRes] = await Promise.all([
          proposalDosenApi.getStats(),
          proposalDosenApi.getAll({ limit: 5 }),
          proposalDosenApi.getMyInvitations(),
        ])
        setStats(statsRes.data.data)
        setProposals(proposalRes.data.data || [])
        const pending = (invRes.data.data || []).filter((i) => i.statusUndangan === 'pending')
        setInvitations(pending)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const displayName = user?.fullName || user?.name || 'Dosen'
  const now = new Date()
  const greeting =
    now.getHours() < 11 ? 'Selamat pagi' : now.getHours() < 15 ? 'Selamat siang' : now.getHours() < 18 ? 'Selamat sore' : 'Selamat malam'

  // -----------------------------------------------------------------------
  // Data grafik turunan — dihitung murni dari `stats` dan `proposals`
  // yang sudah diambil di atas. Tidak ada panggilan API baru.
  // -----------------------------------------------------------------------
  const statusDonutData = useMemo(() => {
    if (!stats) return []
    return ['draft', 'diajukan', 'disetujui', 'revisi', 'ditolak']
      .map((key) => ({ key, name: statusCfg(key).label, value: stats[key] ?? 0, hex: statusCfg(key).hex }))
      .filter((d) => d.value > 0)
  }, [stats])

  const jenisBarData = useMemo(() => {
    const counts = {}
    proposals.forEach((p) => {
      const key = p.jenis || 'Tidak diketahui'
      counts[key] = (counts[key] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [proposals])

  const periodeBarData = useMemo(() => {
    const counts = {}
    proposals.forEach((p) => {
      const key = p.periode?.nama || 'Belum ada periode'
      counts[key] = (counts[key] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [proposals])

  const totalForDonut = statusDonutData.reduce((sum, d) => sum + d.value, 0)

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center px-6 py-10">
        <p className="flex items-center gap-3 text-base text-slate-500">
          <span className="spinner text-navy-600" aria-hidden="true" />
          Memuat data...
        </p>
      </div>
    )
  }

  const recentProposals = proposals.slice(0, 5)
  const needsAttention = proposals.filter((p) => p.status === 'revisi' || p.status === 'draft')

  return (
    <div className="page space-y-8">
      {/* Judul halaman */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="page-title">Dashboard Proposal Dosen</h1>
          <p className="page-desc">
            {greeting}, <span className="font-semibold text-slate-700">{displayName}</span>
          </p>
        </div>
        <nav className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row" aria-label="Aksi utama dashboard">
          <Link to="/proposal-saya" className="btn btn-secondary">
            Lihat Semua Proposal
          </Link>
          <Link to="/proposal-saya" className="btn btn-primary">
            Buat Proposal Baru
          </Link>
        </nav>
      </header>

      {/* Ringkasan: satu strip, bukan lima kartu terpisah */}
      <section aria-labelledby="ringkasan-proposal" className="card overflow-hidden">
        <h2 id="ringkasan-proposal" className="sr-only">
          Ringkasan Proposal
        </h2>
        <div className="grid grid-cols-2 gap-px bg-slate-200 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2 lg:grid-cols-5">
          <StatCard label="Total" value={stats?.total ?? 0} hex="#12234a" />
          <StatCard label="Draft" value={stats?.draft ?? 0} hex={statusCfg('draft').hex} />
          <StatCard label="Diajukan" value={stats?.diajukan ?? 0} hex={statusCfg('diajukan').hex} />
          <StatCard label="Disetujui" value={stats?.disetujui ?? 0} hex={statusCfg('disetujui').hex} />
          <StatCard label="Revisi" value={stats?.revisi ?? 0} hex={statusCfg('revisi').hex} />
        </div>
      </section>

      {/* Pemberitahuan undangan */}
      {invitations.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <header>
            <h2 className="text-base font-semibold text-amber-800">Undangan Tim Menunggu Respons</h2>
            <p className="mt-0.5 text-sm text-amber-800/80">
              {invitations.length} undangan belum dikonfirmasi.
            </p>
          </header>
          <Link to="/undangan" className="btn btn-secondary btn-sm shrink-0 self-start sm:self-auto">
            Lihat Undangan
          </Link>
        </section>
      )}

      {/* Grafik */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Distribusi Status" subtitle={`${totalForDonut} proposal tercatat`} noPadding>
          {statusDonutData.length === 0 ? (
            <EmptyState title="Belum Ada Data" desc="Distribusi status akan tampil setelah ada proposal." />
          ) : (
            <div className="px-6 py-6">
              <div className="flex flex-col items-center gap-8 sm:flex-row">
                <div className="relative size-[184px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDonutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={84}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {statusDonutData.map((d) => (
                          <Cell key={d.key} fill={d.hex} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="font-serif text-3xl font-medium text-navy-950 tabular-nums">{totalForDonut}</p>
                    <p className="text-xs text-slate-500">Proposal</p>
                  </div>
                </div>
                <ul className="w-full space-y-3">
                  {statusDonutData.map((d) => (
                    <li key={d.key} className="flex items-center justify-between gap-3 text-base">
                      <span className="flex items-center gap-2.5 text-slate-600">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: d.hex }} />
                        {d.name}
                      </span>
                      <span className="font-semibold text-slate-900 tabular-nums">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Proposal per Jenis" subtitle="Dari proposal yang dimuat saat ini" noPadding>
          {jenisBarData.length === 0 ? (
            <EmptyState title="Belum Ada Data" desc="Breakdown jenis proposal akan tampil di sini." />
          ) : (
            <div className="h-[260px] px-3 py-5 sm:px-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jenisBarData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={32}>
                  <CartesianGrid vertical={false} stroke="#e1e6ee" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#687590' }} axisLine={{ stroke: '#e1e6ee' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#687590' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef1f6' }} />
                  <Bar dataKey="value" name="Proposal" fill={JENIS_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </section>

      {/* Rincian per periode — batang horizontal ringkas */}
      {periodeBarData.length > 0 && (
        <SectionCard title="Proposal per Periode" subtitle="Dari proposal yang dimuat saat ini">
          <ul className="space-y-4">
            {periodeBarData.map((d) => {
              const max = periodeBarData[0].value || 1
              const pct = Math.max(8, Math.round((d.value / max) * 100))
              return (
                <li key={d.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-slate-600" title={d.name}>
                    {d.name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-navy-700" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-900 tabular-nums">{d.value}</span>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      {/* Ruang kerja */}
      <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <SectionCard title="Proposal Terbaru" noPadding>
          {recentProposals.length === 0 ? (
            <EmptyState
              title="Belum Ada Proposal"
              desc="Riwayat proposal akan tampil di halaman ini setelah Anda membuat pengajuan pertama."
              action={
                <Link to="/proposal-saya" className="btn btn-secondary">
                  Buat Proposal Pertama
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentProposals.map((p) => (
                <article key={p.id} className="px-6 py-4 transition-colors duration-150 hover:bg-slate-50">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <header className="min-w-0">
                      <h3 className="text-base font-semibold leading-snug text-slate-900">{p.judul}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                        <span className="capitalize">{p.jenis}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span>{p.periode?.nama || 'Belum ada periode'}</span>
                      </p>
                    </header>
                    <div className="shrink-0">
                      <Badge status={p.status} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>

        <aside className="space-y-6">
          <SectionCard title="Perlu Tindakan" noPadding>
            {needsAttention.length === 0 ? (
              <EmptyState title="Tidak Ada Tindakan Mendesak" desc="Seluruh proposal berada pada status yang aman untuk dipantau." />
            ) : (
              <div className="divide-y divide-slate-100">
                {needsAttention.slice(0, 4).map((p) => (
                  <article key={p.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold leading-snug text-slate-900">{p.judul}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">
                          {p.status === 'revisi'
                            ? 'Memerlukan tindak lanjut revisi.'
                            : 'Masih berstatus draft dan belum diajukan.'}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <Badge status={p.status} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Menu Cepat" noPadding>
            <nav className="divide-y divide-slate-100" aria-label="Menu cepat dashboard">
              {[
                { to: '/proposal-saya', label: 'Proposal Saya', desc: 'Kelola seluruh proposal penelitian.' },
                { to: '/undangan', label: 'Undangan Tim', desc: 'Tinjau dan respons undangan kolaborasi.' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors duration-150 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-slate-900">{item.label}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">{item.desc}</span>
                  </span>
                  <svg className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-navy-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </nav>
          </SectionCard>
        </aside>
      </section>
    </div>
  )
}
