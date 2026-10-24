import { useEffect, useMemo, useState } from 'react'
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
import { dashboardApi } from '../api/dashboard'
import { usersApi } from '../api/users'
import { activityLogApi } from '../api/activityLog'

// ---------------------------------------------------------------------------
// Palet status — selaras dengan lencana di seluruh aplikasi (nuansa diredam).
// `hex` dipakai grafik; `className` memakai kelas lencana dari index.css.
// ---------------------------------------------------------------------------
const STATUS_META = {
  draft: { label: 'Draft', className: 'badge-neutral', hex: '#98a3b7' },
  submitted: { label: 'Submitted', className: 'badge-info', hex: '#4e69a6' },
  reviewed: { label: 'Reviewed', className: 'badge-review', hex: '#7664b8' },
  approved: { label: 'Approved', className: 'badge-success', hex: '#348a63' },
  rejected: { label: 'Rejected', className: 'badge-danger', hex: '#c54a42' },
  revision: { label: 'Revision', className: 'badge-warning', hex: '#c0702a' },
}
const FALLBACK_STATUS = { label: 'Lainnya', className: 'badge-neutral', hex: '#cbd3df' }

const USER_STATUS_COLOR = {
  approved: 'badge-success',
  pending: 'badge-warning',
  rejected: 'badge-danger',
}

const ROLE_COMPOSITION_COLORS = {
  dosen: '#1b3060',
  reviewer: '#4e69a6',
  lainnya: '#c5d1e8',
}

function statusMeta(status) {
  return STATUS_META[status] || { ...FALLBACK_STATUS, label: status || 'Lainnya' }
}

function StatCard({ label, value, sub }) {
  return (
    <article className="bg-white px-6 py-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2.5 font-serif text-[2.25rem] font-medium leading-none tracking-tight text-navy-950 tabular-nums">{value ?? '—'}</p>
      {sub && <p className="mt-2.5 text-sm text-slate-500">{sub}</p>}
    </article>
  )
}

function Section({ title, subtitle, children, action, noPadding }) {
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

function Badge({ label, className }) {
  return <span className={`badge ${className}`}>{label}</span>
}

function EmptyState({ text }) {
  return (
    <div className="px-6 py-8 text-center">
      <p className="text-base text-slate-500">{text}</p>
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

// Daftar batang horizontal — untuk rincian sederhana tanpa sumbu grafik penuh.
function HorizontalBarList({ data, barClassName = 'bg-navy-700' }) {
  const max = data[0]?.value || 1
  return (
    <ul className="space-y-4">
      {data.map((d) => {
        const pct = Math.max(8, Math.round((d.value / max) * 100))
        return (
          <li key={d.name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm capitalize text-slate-600" title={d.name}>
              {d.name}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right text-sm font-semibold text-slate-900 tabular-nums">{d.value}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, usersRes, logsRes] = await Promise.all([
          dashboardApi.getStats(),
          usersApi.getAll({ limit: 8 }),
          activityLogApi.getAll({ limit: 10 }),
        ])
        setStats(statsRes.data.data)
        setUsers(usersRes.data.data || [])
        setLogs(logsRes.data.data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  // ---------------------------------------------------------------------
  // Data grafik turunan — dihitung dari `stats` (agregat, bukan paginasi)
  // sehingga komposisi role dan status mencerminkan seluruh sistem,
  // bukan hanya 8 user / proposal yang dimuat pada daftar di bawah.
  // ---------------------------------------------------------------------
  const statusBarData = useMemo(() => {
    if (!stats?.perStatus?.length) return []
    return stats.perStatus.map((s) => ({
      name: statusMeta(s.status).label,
      value: s.count,
      hex: statusMeta(s.status).hex,
    }))
  }, [stats])

  const roleCompositionData = useMemo(() => {
    if (!stats?.users) return []
    const total = stats.users.total || 0
    const dosen = stats.users.dosen || 0
    const reviewer = stats.users.reviewer || 0
    const lainnya = Math.max(total - dosen - reviewer, 0)
    return [
      { key: 'dosen', name: 'Dosen', value: dosen, hex: ROLE_COMPOSITION_COLORS.dosen },
      { key: 'reviewer', name: 'Reviewer', value: reviewer, hex: ROLE_COMPOSITION_COLORS.reviewer },
      { key: 'lainnya', name: 'Lainnya', value: lainnya, hex: ROLE_COMPOSITION_COLORS.lainnya },
    ].filter((d) => d.value > 0)
  }, [stats])

  const periodeJenisData = useMemo(() => {
    if (!stats?.periodeAktif?.length) return []
    const counts = {}
    stats.periodeAktif.forEach((p) => {
      const key = p.jenis || 'Tidak diketahui'
      counts[key] = (counts[key] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [stats])

  const totalUsersForDonut = roleCompositionData.reduce((sum, d) => sum + d.value, 0)

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

  return (
    <div className="page space-y-8">
      {/* Judul halaman */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="page-title">Ringkasan LPPM</h1>
          <p className="page-desc">
            Pantau proposal, status penilaian, aktivitas sistem, dan data pengguna dalam satu tampilan yang ringkas.
          </p>
        </div>
        <dl className="flex shrink-0 gap-10">
          <div>
            <dt className="text-sm text-slate-500">Periode Aktif</dt>
            <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{stats?.periodeAktif?.length || 0}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Aktivitas Tercatat</dt>
            <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{logs.length}</dd>
          </div>
        </dl>
      </header>

      {/* Ringkasan statistik utama: satu strip, bukan empat kartu terpisah */}
      <section aria-labelledby="ringkasan-statistik" className="card overflow-hidden">
        <h2 id="ringkasan-statistik" className="sr-only">
          Ringkasan Utama
        </h2>
        <div className="grid grid-cols-2 gap-px bg-slate-200 lg:grid-cols-4">
          <StatCard
            label="Total Proposal"
            value={stats?.totalProposal}
            sub={`${stats?.periodeAktif?.length || 0} periode aktif`}
          />
          <StatCard
            label="Total User"
            value={stats?.users?.total}
            sub={`${stats?.users?.dosen ?? 0} dosen · ${stats?.users?.reviewer ?? 0} reviewer`}
          />
          <StatCard
            label="Disetujui"
            value={stats?.perStatus?.find((s) => s.status === 'approved')?.count || 0}
            sub="Proposal approved"
          />
          <StatCard
            label="Menunggu Review"
            value={stats?.perStatus?.find((s) => s.status === 'submitted')?.count || 0}
            sub="Proposal submitted"
          />
        </div>
      </section>

      {/* Grafik: komposisi user (donat, 3 kategori) + distribusi status proposal (batang, 6 kategori) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Section title="Komposisi User" subtitle={`${totalUsersForDonut} user terdaftar`} noPadding>
          {roleCompositionData.length === 0 ? (
            <EmptyState text="Belum ada data" />
          ) : (
            <div className="px-6 py-6">
              <div className="flex flex-col items-center gap-8 sm:flex-row">
                <div className="relative size-[184px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={roleCompositionData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
                        {roleCompositionData.map((d) => (
                          <Cell key={d.key} fill={d.hex} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="font-serif text-3xl font-medium text-navy-950 tabular-nums">{totalUsersForDonut}</p>
                    <p className="text-xs text-slate-500">User</p>
                  </div>
                </div>
                <ul className="w-full space-y-3">
                  {roleCompositionData.map((d) => (
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
        </Section>

        <Section title="Distribusi Status Proposal" subtitle="Seluruh proposal di sistem" noPadding>
          {statusBarData.length === 0 ? (
            <EmptyState text="Belum ada data" />
          ) : (
            <div className="h-[268px] px-3 py-5 sm:px-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusBarData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={28}>
                  <CartesianGrid vertical={false} stroke="#e1e6ee" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#687590' }} axisLine={{ stroke: '#e1e6ee' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#687590' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#eef1f6' }} />
                  <Bar dataKey="value" name="Proposal" radius={[4, 4, 0, 0]}>
                    {statusBarData.map((d, i) => (
                      <Cell key={i} fill={d.hex} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </section>

      {/* Periode: daftar periode aktif berdampingan dengan sebaran jenisnya */}
      <section className="grid grid-cols-1 gap-6 empty:hidden lg:grid-cols-[1.15fr_0.85fr]">
        {stats?.periodeAktif?.length > 0 && (
          <Section title="Periode Aktif" noPadding>
            <div className="divide-y divide-slate-100">
              {stats.periodeAktif.map((p) => (
                <article key={p.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-900">{p.nama}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{p.tahun}</p>
                  </div>
                  <div className="shrink-0">
                    <Badge label={p.jenis} className="badge-info capitalize" />
                  </div>
                </article>
              ))}
            </div>
          </Section>
        )}

        {periodeJenisData.length > 0 && (
          <Section title="Periode Aktif per Jenis" subtitle="Sebaran jenis periode yang sedang berjalan">
            <HorizontalBarList data={periodeJenisData} />
          </Section>
        )}
      </section>

      {/* Data pendukung */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Section title="User Terdaftar" noPadding>
          {users.length === 0 ? (
            <EmptyState text="Belum ada data" />
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map((u) => (
                <article
                  key={u.id}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors duration-150 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-50 text-sm font-semibold text-navy-700">
                      {u.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">{u.name}</p>
                      <p className="truncate text-sm text-slate-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {u.roles?.slice(0, 1).map((r, i) => {
                      const name = typeof r === 'string' ? r : r.role?.name || r.name || ''
                      return <Badge key={i} label={name} className="badge-plain" />
                    })}
                    <Badge label={u.status} className={USER_STATUS_COLOR[u.status] || 'badge-neutral'} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>

        <Section title="Aktivitas Terbaru" noPadding>
          {logs.length === 0 ? (
            <EmptyState text="Belum ada aktivitas" />
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <article key={log.id} className="px-6 py-3.5 transition-colors duration-150 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-base leading-relaxed text-slate-900">
                        <span className="font-semibold">{log.user?.name || 'System'}</span>
                        {' — '}
                        <span className="text-slate-600">{log.action}</span>
                      </p>
                      {log.description && <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{log.description}</p>}
                    </div>
                    <div className="shrink-0">
                      <span className="text-sm text-slate-400 tabular-nums">
                        {new Date(log.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      </section>
    </div>
  )
}
