import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CircleCheck, CirclePlus, FileCheck, FileText, ListChecks } from 'lucide-react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { laporanApi } from '../api/laporan'
import useAuthStore from '../store/authStore'
import { ProposalDetailModal } from './ProposalDosen/ProposalDetailModal'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Halaman "Status Penelitian / Pengabdian" (menu Kegiatan, dosen): ringkasan,
// tombol Usulan (→ halaman UsulanPage) & Laporan, dan Riwayat berisi proposal
// (GET /dosen/proposals) atau laporan (GET /laporan/my) untuk satu jenis.
// Bagian "sebagai anggota tim" dari GET /dosen/proposals/as-member.
// ---------------------------------------------------------------------------

const LIMIT = 10
const STATUSES = ['draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak']

const COPY = {
  penelitian: {
    desc: 'Usulan dan laporan penelitian yang Anda ajukan sebagai ketua, beserta statusnya.',
    extraLabel: 'Skema',
    empty: 'Belum ada usulan penelitian.',
  },
  pengabdian: {
    desc: 'Usulan dan laporan pengabdian kepada masyarakat yang Anda ajukan sebagai ketua, beserta statusnya.',
    extraLabel: 'Mitra',
    empty: 'Belum ada usulan pengabdian.',
  },
}

const rupiah = (value) =>
  value === null || value === undefined || value === '' ? '—' : `Rp ${Number(value).toLocaleString('id-ID')}`

// Jumlah per status untuk satu jenis: GET /dosen/proposals/stats?jenis=… (+ key review).
async function loadCounts(jenis) {
  const r = await proposalDosenApi.getStats({ jenis })
  const d = r.data.data || {}
  return Object.fromEntries(STATUSES.map((s) => [s, Number(d[s]) || 0]))
}

function TahapanBadge({ tahapan }) {
  if (!tahapan) return <span className="text-slate-400">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-700" title={`Tahap ${tahapan.urutan} dari 4`}>
      <span className="grid size-5 place-items-center rounded-full bg-navy-100 text-[0.6875rem] font-bold text-navy-800">{tahapan.urutan}</span>
      {tahapan.label}
    </span>
  )
}

// Proposal milik dosen lain tempat user menjadi anggota (undangan diterima):
// GET /dosen/proposals/as-member. Detail lewat GET /proposals/:id (readOnly).
function MemberSection({ jenis, label, userId, onDetail }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    proposalDosenApi
      .getAsMember({ jenis, page, limit: 5 })
      .then((r) => {
        if (!alive) return
        setRows(r.data.data || [])
        setTotal(Number(r.data.meta?.total) || 0)
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [jenis, page])

  const pages = Math.max(1, Math.ceil(total / 5))

  return (
    <section aria-labelledby="kegiatan-anggota" className="space-y-3">
      <div>
        <h2 id="kegiatan-anggota" className="text-xl font-semibold text-navy-950">
          {label} sebagai anggota tim
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {label} milik dosen lain yang undangannya sudah Anda terima. Undangan yang menunggu respons ada di{' '}
          <Link to="/undangan" className="font-semibold text-navy-700 hover:text-navy-900">
            Undangan Tim
          </Link>
          .
        </p>
      </div>
      <div className="table-wrap">
        <table className="table table-tight">
          <thead>
            <tr>
              <th scope="col">Judul</th>
              <th scope="col">Ketua pengusul</th>
              <th scope="col">Peran saya</th>
              <th scope="col">Status</th>
              <th scope="col">Tahapan</th>
              <th scope="col">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {state === 'loading' ? (
              <tr aria-hidden="true">
                <td colSpan={6}>
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                </td>
              </tr>
            ) : state === 'error' ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-600">
                  Daftar keanggotaan gagal dimuat.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Anda belum menjadi anggota {label.toLowerCase()} lain.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const saya = (p.anggota || []).find((a) => a.user?.id === userId)
                return (
                  <tr key={p.id}>
                    <td className="min-w-[16rem] max-w-md">
                      <p className="line-clamp-2 font-semibold text-slate-900" title={p.judul}>
                        {p.judul}
                      </p>
                      <p className="text-xs text-slate-500">{p.periode?.nama || 'Belum ada periode'}</p>
                    </td>
                    <td>{p.pengusul?.fullName || p.pengusul?.name || '—'}</td>
                    <td className="capitalize">{saya?.peran || 'anggota'}</td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[p.status] || 'badge-neutral'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                    </td>
                    <td>
                      <TahapanBadge tahapan={p.tahapan} />
                    </td>
                    <td className="text-right">
                      <button type="button" onClick={() => onDetail(p.id)} className="btn btn-ghost btn-sm">
                        Detail
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {total > 5 ? (
        <nav aria-label="Halaman keanggotaan" className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span className="tabular-nums">
            Halaman {page} dari {pages} · {total} {label.toLowerCase()}
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Sebelumnya
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Berikutnya
            </button>
          </span>
        </nav>
      ) : null}
    </section>
  )
}

const dateTime = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// Kartu angka sesuai desain: ubin ikon, angka besar, label.
function StatusCard({ icon: Icon, tone, value, label, to }) {
  const body = (
    <>
      <span className={`grid size-16 place-items-center rounded-xl ${tone.tile}`}>
        <Icon className="size-8" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={`mt-3 font-serif text-[2rem] font-medium leading-none tabular-nums lining-nums ${tone.text}`}>
        {value === null || value === undefined ? '—' : value}
      </span>
      <span className="mt-1.5 text-sm text-slate-500">{label}</span>
    </>
  )
  const cls = 'card flex flex-col items-center px-5 py-6 text-center'
  return <li>{to ? <Link to={to} className={`${cls} transition-shadow hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
}

function TipeTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${
        active ? 'border-navy-800 text-navy-950' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-navy-900'
      }`}
    >
      {children}
    </button>
  )
}

function FilterChip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-navy-800 bg-navy-800 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-navy-900'
      }`}
    >
      {children}
    </button>
  )
}

export default function KegiatanPage({ jenis }) {
  const label = JENIS_LABEL[jenis] || jenis
  const copy = COPY[jenis] || COPY.penelitian
  const location = useLocation()
  const navigate = useNavigate()
  const [flash] = useState(() => location.state?.flash || null)

  const [counts, setCounts] = useState(null)
  const [countsFailed, setCountsFailed] = useState(false)
  const [laporanDiterima, setLaporanDiterima] = useState(null)
  const [tipe, setTipe] = useState('proposal')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [memberDetailId, setMemberDetailId] = useState(null)
  const user = useAuthStore((s) => s.user)
  const [tick, setTick] = useState(0)

  // Bersihkan pesan kilat dari riwayat navigasi agar tidak muncul lagi saat dimuat ulang.
  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    let alive = true
    setCountsFailed(false)
    loadCounts(jenis)
      .then((c) => alive && setCounts(c))
      .catch(() => {
        if (!alive) return
        setCounts(null)
        setCountsFailed(true)
      })
    laporanApi
      .getMy({ jenis, status: 'disetujui', limit: 1 })
      .then((r) => alive && setLaporanDiterima(Number(r.data.meta?.total) || 0))
      .catch(() => alive && setLaporanDiterima(null))
    return () => {
      alive = false
    }
  }, [jenis, tick])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    const params = { jenis, page, limit: LIMIT, ...(status ? { status } : {}), ...(query ? { search: query } : {}) }
    const request = tipe === 'laporan' ? laporanApi.getMy(params) : proposalDosenApi.getAll(params)
    request
      .then((r) => {
        if (!alive) return
        setRows(r.data.data || [])
        setTotal(Number(r.data.meta?.total) || 0)
      })
      .catch(() => {
        if (!alive) return
        setRows([])
        setTotal(0)
        setFailed(true)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [jenis, tipe, page, status, query, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const switchTipe = (next) => {
    setTipe(next)
    setStatus('')
    setPage(1)
  }

  const aktif = counts ? counts.draft + counts.diajukan + counts.review + counts.revisi : null
  const pages = Math.max(1, Math.ceil(total / LIMIT))
  const usulanTo = `/kegiatan/${jenis}/usulan`
  const isLaporan = tipe === 'laporan'
  const colCount = isLaporan ? 7 : 9

  return (
    <div className="page rise space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Status {label}</h1>
          <p className="page-desc">{copy.desc}</p>
        </div>
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">{label}</li>
          </ol>
        </nav>
      </header>

      {flash ? (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            flash.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      <section aria-label={`Ringkasan ${label.toLowerCase()}`}>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatusCard icon={ListChecks} tone={{ tile: 'bg-navy-50 text-navy-700', text: 'text-navy-700' }} value={aktif} label="Proposal Aktif" />
          <StatusCard icon={CircleCheck} tone={{ tile: 'bg-green-50 text-green-700', text: 'text-green-700' }} value={counts?.disetujui} label="Proposal Diterima" />
          <StatusCard icon={FileCheck} tone={{ tile: 'bg-green-50 text-green-700', text: 'text-green-700' }} value={laporanDiterima} label="Laporan Diterima" />
        </ul>
        {countsFailed ? (
          <p role="status" className="mt-3 text-sm text-amber-800">
            Ringkasan belum dapat dimuat.{' '}
            <button type="button" onClick={refresh} className="font-semibold underline">
              Coba lagi
            </button>
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to={usulanTo} className="btn btn-secondary h-14 text-base">
          <CirclePlus className="size-5" aria-hidden="true" />
          Usulan {label}
        </Link>
        <Link to={`/kegiatan/${jenis}/laporan/baru`} className="btn btn-primary h-14 text-base">
          <FileText className="size-5" aria-hidden="true" />
          Laporan {label}
        </Link>
      </div>

      <section aria-labelledby="riwayat-kegiatan" className="scroll-mt-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="riwayat-kegiatan" className="text-xl font-semibold text-navy-950">
              Riwayat {label}
            </h2>
            <div role="tablist" aria-label="Jenis dokumen" className="mt-3 flex gap-6 border-b border-slate-200">
              <TipeTab active={!isLaporan} onClick={() => switchTipe('proposal')}>
                Proposal
              </TipeTab>
              <TipeTab active={isLaporan} onClick={() => switchTipe('laporan')}>
                Laporan
              </TipeTab>
            </div>
          </div>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setPage(1)
              setQuery(search.trim())
            }}
            className="flex w-full gap-2 lg:w-80"
          >
            <label htmlFor="cari-kegiatan" className="sr-only">
              Cari judul atau abstrak
            </label>
            <input
              id="cari-kegiatan"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul atau abstrak"
              className="input"
            />
            <button type="submit" className="btn btn-secondary shrink-0">
              Cari
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Filter status">
          <FilterChip active={status === ''} onClick={() => { setStatus(''); setPage(1) }}>
            Semua
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => { setStatus(s); setPage(1) }}>
              {STATUS_LABEL[s]}
              {counts && !isLaporan ? <span className="ml-1.5 tabular-nums opacity-70">{counts[s]}</span> : null}
            </FilterChip>
          ))}
        </div>

        <div className="table-wrap">
          <table className="table table-tight">
            <thead>
              <tr>
                <th scope="col">Tanggal Upload</th>
                <th scope="col">Judul</th>
                <th scope="col">Jenis</th>
                <th scope="col">Status</th>
                <th scope="col">Tanggal Update</th>
                {isLaporan ? (
                  <th scope="col">Luaran Tercapai</th>
                ) : (
                  <>
                    <th scope="col">Luaran</th>
                    <th scope="col">{copy.extraLabel}</th>
                    <th scope="col">Tahapan</th>
                  </>
                )}
                <th scope="col">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <tr key={i} aria-hidden="true">
                    <td colSpan={colCount}>
                      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : failed ? (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center">
                    <p className="text-slate-600">Riwayat {isLaporan ? 'laporan' : 'proposal'} gagal dimuat.</p>
                    <button type="button" onClick={refresh} className="btn btn-secondary btn-sm mt-3">
                      Coba lagi
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center text-slate-500">
                    {status || query
                      ? 'Tidak ada yang cocok dengan filter.'
                      : isLaporan
                        ? `Belum ada laporan ${label.toLowerCase()}.`
                        : copy.empty}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={`${tipe}-${p.id}`}>
                    <td className="whitespace-nowrap tabular-nums">{dateTime(p.createdAt)}</td>
                    <td className="min-w-[16rem] max-w-md">
                      <p className="line-clamp-2 font-semibold text-slate-900" title={p.judul}>
                        {p.judul}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.periode?.nama || 'Belum ada periode'}
                        {p.anggaran ? ` · ${rupiah(p.anggaran)}` : ''}
                      </p>
                    </td>
                    <td>
                      <span className={`badge ${isLaporan ? 'badge-success' : 'badge-info'}`}>{isLaporan ? 'Laporan' : 'Proposal'}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[p.status] || 'badge-neutral'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{dateTime(p.updatedAt)}</td>
                    {isLaporan ? (
                      <td className="max-w-xs">{p.luaranTercapai || '—'}</td>
                    ) : (
                      <>
                        <td className="max-w-xs">{p.luaran || '—'}</td>
                        <td className="max-w-xs">{(jenis === 'pengabdian' ? p.mitra : p.skema) || '—'}</td>
                        <td>
                          <TahapanBadge tahapan={p.tahapan} />
                        </td>
                      </>
                    )}
                    <td className="whitespace-nowrap text-right">
                      {isLaporan ? (
                        <Link to={`/kegiatan/${p.jenis || jenis}/laporan/${p.id}`} className="btn btn-ghost btn-sm">
                          {p.status === 'draft' || p.status === 'revisi' ? 'Lengkapi' : 'Detail'}
                        </Link>
                      ) : (
                        <>
                          {p.status === 'draft' || p.status === 'revisi' ? (
                            <Link to={`/kegiatan/${p.jenis || jenis}/usulan/${p.id}`} className="btn btn-ghost btn-sm">
                              Edit
                            </Link>
                          ) : null}
                          <button type="button" onClick={() => setSelectedId(p.id)} className="btn btn-ghost btn-sm">
                            Detail
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && !failed && total > LIMIT ? (
          <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span className="tabular-nums">
              Halaman {page} dari {pages} · {total} {isLaporan ? 'laporan' : 'proposal'}
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Berikutnya
              </button>
            </span>
          </nav>
        ) : null}
      </section>

      <MemberSection jenis={jenis} label={label} userId={user?.id} onDetail={(pid) => setMemberDetailId(pid)} />

      {selectedId ? (
        <ProposalDetailModal proposalId={selectedId} onClose={() => setSelectedId(null)} onRefresh={refresh} />
      ) : null}
      {memberDetailId ? (
        <ProposalDetailModal proposalId={memberDetailId} readOnly onClose={() => setMemberDetailId(null)} />
      ) : null}
    </div>
  )
}
