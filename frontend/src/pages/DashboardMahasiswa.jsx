import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { laporanHarianApi } from '../api/laporanHarian'
import { proposalDosenApi } from '../api/Proposaldosen'
import useAuthStore from '../store/authStore'

const STATUS_CONFIG = {
  draft: { label: 'Draft', className: 'badge-neutral' },
  diajukan: { label: 'Diajukan', className: 'badge-info' },
  disetujui: { label: 'Disetujui', className: 'badge-success' },
  revisi: { label: 'Revisi', className: 'badge-warning' },
  ditolak: { label: 'Ditolak', className: 'badge-danger' },
}

function Badge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, className: 'badge-neutral' }
  return <span className={`badge ${cfg.className}`}>{cfg.label}</span>
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function StatCard({ label, value, sub, valueClassName = 'text-navy-950' }) {
  return (
    <article className="bg-white px-6 py-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2.5 font-serif text-[2.25rem] font-medium leading-none tracking-tight tabular-nums ${valueClassName}`}>
        {value}
      </p>
      <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{sub}</p>
    </article>
  )
}

function SectionCard({ title, subtitle, action, children }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-navy-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  )
}

function EmptyState({ title, desc }) {
  return (
    <div className="px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{desc}</p>
    </div>
  )
}

export default function DashboardMahasiswa() {
  const user = useAuthStore((s) => s.user)
  const [myProposals, setMyProposals] = useState([])
  const [invitations, setInvitations] = useState([])
  const [allLaporan, setAllLaporan] = useState([]) // laporan dari semua proposal
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [proposalRes, invRes] = await Promise.all([
          laporanHarianApi.getMyProposals(),
          proposalDosenApi.getMyInvitations(),
        ])
        const proposals = proposalRes.data.data || []
        setMyProposals(proposals)

        const pending = (invRes.data.data || []).filter(i => i.statusUndangan === 'pending')
        setInvitations(pending)

        // Ambil laporan terbaru dari tiap proposal (maksimal 3 proposal pertama)
        const laporanPromises = proposals.slice(0, 3).map(p =>
          laporanHarianApi.getByProposal(p.id)
            .then(r => (r.data.data || []).map(l => ({ ...l, proposalJudul: p.judul })))
            .catch(() => [])
        )
        const laporanResults = await Promise.all(laporanPromises)
        const flat = laporanResults
          .flat()
          .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
        setAllLaporan(flat.slice(0, 6))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const displayName = user?.fullName || user?.name || 'Mahasiswa'
  const now = new Date()
  const greeting =
    now.getHours() < 11
      ? 'Selamat pagi'
      : now.getHours() < 15
        ? 'Selamat siang'
        : now.getHours() < 18
          ? 'Selamat sore'
          : 'Selamat malam'

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center px-6 py-10">
        <div className="text-center">
          <span className="spinner text-navy-600" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-navy-950">Memuat dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">
            Data proposal, undangan, dan laporan sedang disiapkan.
          </p>
        </div>
      </div>
    )
  }

  const activeProposals = myProposals.filter(p => p.status === 'disetujui')
  const totalLaporan = allLaporan.length

  return (
    <div className="page space-y-8">
      {/* Judul halaman */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="page-title">
            {greeting}, {displayName}
          </h1>
          <p className="page-desc">
            Pantau keterlibatan Anda dalam proposal, laporan harian, dan undangan tim
            penelitian secara ringkas dan terstruktur.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          <Link to="/undangan" className="btn btn-secondary">
            Lihat Undangan
          </Link>
          <Link to="/laporan-harian" className="btn btn-primary">
            Isi Laporan Harian
          </Link>
        </div>
      </header>

      {/* Pemberitahuan undangan yang masih pending */}
      {invitations.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-amber-800">
              Terdapat {invitations.length} undangan tim yang menunggu respons
            </h2>
            <p className="text-sm leading-relaxed text-amber-800/80">
              Segera konfirmasi keikutsertaan agar Anda dapat mulai berkontribusi
              pada aktivitas tim dan pelaporan.
            </p>
          </div>

          <Link to="/undangan" className="btn btn-secondary btn-sm shrink-0 self-start lg:self-auto">
            Tinjau Undangan Tim
          </Link>
        </section>
      )}

      {/* Ringkasan: satu strip */}
      <section aria-labelledby="ringkasan-mahasiswa" className="card overflow-hidden">
        <h2 id="ringkasan-mahasiswa" className="sr-only">
          Ringkasan
        </h2>
        <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-3">
          <StatCard
            label="Proposal Diikuti"
            value={myProposals.length}
            sub={`${activeProposals.length} proposal berstatus aktif atau telah disetujui.`}
          />
          <StatCard
            label="Laporan Dibuat"
            value={totalLaporan}
            sub={`Diambil dari ${myProposals.length > 0 ? Math.min(3, myProposals.length) : 0} proposal terakhir yang tersedia.`}
          />
          <StatCard
            label="Undangan Menunggu"
            value={invitations.length}
            sub="Undangan yang belum dikonfirmasi membutuhkan perhatian Anda."
            valueClassName={invitations.length > 0 ? 'text-amber-700' : 'text-navy-950'}
          />
        </div>
      </section>

      {/* Konten utama: daftar proposal dan panel samping */}
      <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <SectionCard
          title="Proposal yang Diikuti"
          subtitle="Daftar proposal tempat Anda terdaftar beserta status keterlibatannya."
          action={
            <Link to="/laporan-harian" className="btn btn-secondary btn-sm">
              Buka Laporan Harian
            </Link>
          }
        >
          {myProposals.length === 0 ? (
            <EmptyState
              title="Belum ada proposal yang diikuti"
              desc="Proposal akan muncul di halaman ini setelah Anda menerima atau bergabung melalui undangan dari dosen pengusul."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {myProposals.map((p) => (
                <article key={p.id} className="px-6 py-4 transition-colors duration-150 hover:bg-slate-50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold leading-snug text-slate-900">{p.judul}</h3>
                      <div className="mt-1.5 space-y-0.5 text-sm text-slate-500">
                        <p>
                          <span className="font-medium text-slate-600">Pengusul:</span>{' '}
                          {p.pengusul?.fullName || p.pengusul?.name || '—'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-600">Periode:</span>{' '}
                          {p.periode ? p.periode.nama : '—'}
                        </p>
                      </div>
                    </div>

                    <aside className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                      <Badge status={p.status} />
                      <p className="text-sm text-slate-500">
                        Peran: <span className="font-medium capitalize text-slate-700">{p.peran || '—'}</span>
                      </p>
                    </aside>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>

        <aside className="space-y-6">
          <SectionCard
            title="Laporan Terbaru"
            subtitle="Aktivitas pelaporan terbaru dari proposal yang sedang Anda ikuti."
            action={
              <Link to="/laporan-harian" className="btn btn-secondary btn-sm">
                Lihat Semua Laporan
              </Link>
            }
          >
            {allLaporan.length === 0 ? (
              <EmptyState
                title="Belum ada laporan harian"
                desc="Laporan terbaru akan ditampilkan di sini setelah aktivitas pelaporan mulai dibuat."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {allLaporan.map((l) => (
                  <article key={l.id} className="px-6 py-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-base font-medium leading-snug text-slate-900">
                          {l.kegiatan}
                        </h3>
                        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{l.proposalJudul}</p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-sm text-slate-400 tabular-nums">
                        {formatDate(l.tanggal)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Menu Cepat" subtitle="Akses langsung ke fitur yang paling sering digunakan.">
            <nav className="divide-y divide-slate-100" aria-label="Menu cepat dashboard">
              {[
                { to: '/laporan-harian', label: 'Laporan Harian', desc: 'Buat dan lihat pelaporan kegiatan' },
                { to: '/undangan', label: 'Undangan Tim', desc: 'Tinjau undangan dan konfirmasi' },
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
