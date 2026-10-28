import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronRight, CircleCheck, CirclePlus, FileCheck, FileText, ListChecks, Trash2 } from 'lucide-react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { laporanApi } from '../api/laporan'
import useAuthStore from '../store/authStore'
import { alertDialog, confirmDialog } from '../utils/dialog'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'
import PanelCari, { PilihanFilter } from '../components/PanelCari'

// ---------------------------------------------------------------------------
// Halaman "Status Penelitian / Pengabdian" (menu Kegiatan, dosen): ringkasan,
// Riwayat (disorot, tepat di bawah ringkasan) berisi proposal (GET /dosen/proposals)
// atau laporan (GET /laporan/my) untuk satu jenis — baris draft/revisi punya tombol
// "Lanjutkan" (draft juga "Hapus") — lalu tombol sekunder Usulkan Proposal Baru &
// Kirim Laporan Baru. Menggantikan halaman Proposal Saya (dihapus): tautan lama
// diarahkan ke sini, `?status=` membuka dengan filter status, `?detail=<id>` dialihkan ke
// halaman Detail Kegiatan (/kegiatan/:jenis/detail/:id); seluruh baris Riwayat bisa diklik
// (proposal → Detail Kegiatan, laporan → index laporan).
// Bagian "sebagai anggota tim" dari GET /dosen/proposals/as-member.
// ---------------------------------------------------------------------------

// Baris per halaman: Riwayat (proposal/laporan) & tabel "sebagai anggota tim" sama-sama 5.
const LIMIT = 5
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

// Seluruh baris tabel bisa diklik (mouse & keyboard) untuk membuka detail; tombol di
// dalam baris (Lanjutkan, Hapus) menghentikan propagasi.
function barisKlik(buka, judul) {
  return {
    onClick: buka,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        buka()
      }
    },
    tabIndex: 0,
    role: 'link',
    'aria-label': `Buka detail: ${judul}`,
    className: 'cursor-pointer transition-colors hover:bg-navy-50/60 focus-visible:bg-navy-50 focus-visible:outline-none',
  }
}

// Proposal milik dosen lain tempat user menjadi anggota (undangan diterima):
// GET /dosen/proposals/as-member. Detail lewat GET /proposals/:id (readOnly).
function MemberSection({ jenis, label, userId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    proposalDosenApi
      .getAsMember({ jenis, page, limit: LIMIT })
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

  const pages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <section aria-labelledby="kegiatan-anggota" className="space-y-3">
      <div>
        <h2 id="kegiatan-anggota" className="text-xl font-semibold text-navy-950">
          {label} sebagai anggota tim
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {label} milik dosen lain yang undangannya sudah Anda terima. Undangan yang menunggu respons ada di{' '}
          <Link to="/undangan" className="font-semibold text-navy-700 hover:text-navy-900">
            Undangan Kerja Sama
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
                const buka = () => navigate(`/kegiatan/${p.jenis || jenis}/detail/${p.id}`)
                return (
                  <tr key={p.id} {...barisKlik(buka, p.judul)}>
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
                      <ChevronRight className="ml-auto size-4 text-slate-400" aria-hidden="true" />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {total > LIMIT ? (
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

// Kartu angka sesuai desain: ubin ikon, angka besar, label. Juga dipakai Project Saya (mahasiswa).
export function StatusCard({ icon: Icon, tone, value, label, to }) {
  const body = (
    <>
      <span className={`grid size-10 place-items-center rounded-lg sm:size-16 sm:rounded-xl ${tone.tile}`}>
        <Icon className="size-5 sm:size-8" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={`mt-2 font-serif text-2xl font-medium leading-none tabular-nums lining-nums sm:mt-3 sm:text-[2rem] ${tone.text}`}>
        {value === null || value === undefined ? '—' : value}
      </span>
      <span className="mt-1.5 text-xs leading-tight text-slate-500 sm:text-sm">{label}</span>
    </>
  )
  const cls = 'card flex flex-col items-center px-2 py-3 text-center sm:px-5 sm:py-6'
  return <li>{to ? <Link to={to} className={`${cls} transition-shadow hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
}

function TipeTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`border-b-[3px] px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${
        active ? 'border-brass-400 text-white' : 'border-transparent text-white/60 hover:border-white/30 hover:text-white'
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
  const [status, setStatus] = useState(() => {
    const st = new URLSearchParams(location.search).get('status')
    return STATUSES.includes(st) ? st : ''
  })
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  // ?detail=<id> (tautan lama: notifikasi, dashboard) → halaman Detail Kegiatan.
  const detailParam = Number(new URLSearchParams(location.search).get('detail')) || null
  useEffect(() => {
    if (detailParam) navigate(`/kegiatan/${jenis}/detail/${detailParam}`, { replace: true })
  }, [detailParam, jenis, navigate])
  const [deleting, setDeleting] = useState(null)
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

  // Hapus proposal draft (DELETE /dosen/proposals/:id), dari halaman Proposal Saya lama.
  const hapus = async (p) => {
    const ok = await confirmDialog({
      tone: 'danger',
      title: 'Hapus proposal draft?',
      message: `“${p.judul}” beserta anggota dan target luarannya akan dihapus permanen.`,
      confirmText: 'Ya, hapus',
    })
    if (!ok) return
    setDeleting(p.id)
    try {
      await proposalDosenApi.delete(p.id)
      refresh()
    } catch (e) {
      alertDialog({ title: 'Gagal menghapus proposal', message: e.response?.data?.message || 'Silakan coba lagi.' })
    } finally {
      setDeleting(null)
    }
  }

  const switchTipe = (next) => {
    setTipe(next)
    setStatus('')
    setPage(1)
  }

  const aktif = counts ? counts.draft + counts.diajukan + counts.review + counts.revisi : null
  // Proposal yang menunggu tindakan pengusul (draft/revisi) — pintasan ke filternya.
  const perluLanjut =
    counts && tipe !== 'laporan' && counts.draft + counts.revisi > 0
      ? { total: counts.draft + counts.revisi, status: counts.revisi > 0 ? 'revisi' : 'draft' }
      : null
  const clearFilter = () => {
    setStatus('')
    setSearch('')
    setQuery('')
    setPage(1)
  }
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
        <ul className="grid grid-cols-3 gap-2 sm:gap-4">
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

      <section
        aria-labelledby="riwayat-kegiatan"
        className="scroll-mt-6 overflow-hidden rounded-2xl border-2 border-navy-800 bg-white shadow-md"
      >
        <header className="bg-navy-800 px-5 pb-0 pt-5 text-white sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="riwayat-kegiatan" className="font-serif text-2xl font-medium text-white">
                Riwayat {label}
              </h2>
              <p className="mt-1 text-sm text-white/75">
                Lanjutkan proposal atau laporan yang sedang berjalan dari daftar ini sebelum membuat yang baru.
              </p>
            </div>
            {perluLanjut ? (
              <button
                type="button"
                onClick={() => {
                  setStatus(perluLanjut.status)
                  setPage(1)
                }}
                className="inline-flex items-center gap-2 rounded-full bg-brass-400 px-3.5 py-1.5 text-sm font-semibold text-rail transition-colors hover:bg-brass-500"
              >
                {perluLanjut.total} proposal perlu dilanjutkan
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div role="tablist" aria-label="Jenis dokumen" className="mt-4 flex gap-6">
            <TipeTab active={!isLaporan} onClick={() => switchTipe('proposal')}>
              Proposal
            </TipeTab>
            <TipeTab active={isLaporan} onClick={() => switchTipe('laporan')}>
              Laporan
            </TipeTab>
          </div>
        </header>

        <div className="space-y-4 p-4 sm:p-5">
          {/* Panel cari standar (components/PanelCari): cari · Filter (status) · Cari; "Filter aktif" bila ada */}
          <PanelCari
            id="kegiatan"
            bare
            value={search}
            onChange={setSearch}
            onSubmit={() => {
              setPage(1)
              setQuery(search.trim())
            }}
            placeholder={`Cari judul atau abstrak ${isLaporan ? 'laporan' : 'proposal'}`}
            aktif={status ? [{ key: 'status', label: `Status: ${STATUS_LABEL[status]}`, onRemove: () => { setStatus(''); setPage(1) } }] : []}
            onReset={clearFilter}
          >
            <PilihanFilter
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v)
                setPage(1)
              }}
              items={[['', 'Semua status'], ...STATUSES.map((st) => [st, `${STATUS_LABEL[st]}${counts && !isLaporan ? ` (${counts[st]})` : ''}`])]}
            />
          </PanelCari>

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
                rows.map((p) => {
                  const lanjut = p.status === 'draft' || p.status === 'revisi'
                  const buka = () =>
                    navigate(isLaporan ? `/kegiatan/${p.jenis || jenis}/laporan/${p.id}` : `/kegiatan/${p.jenis || jenis}/detail/${p.id}`)
                  const klik = barisKlik(buka, p.judul)
                  return (
                  <tr key={`${tipe}-${p.id}`} {...klik} className={`${klik.className} ${lanjut ? 'bg-amber-50/60' : ''}`}>
                    <td className="whitespace-nowrap tabular-nums">{dateTime(p.createdAt)}</td>
                    <td className="min-w-[16rem] max-w-md">
                      <p className="line-clamp-2 font-semibold text-slate-900" title={p.judul}>
                        {p.judul}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.periode?.nama || 'Belum ada periode'}
                        {p.anggaran ? ` · ${rupiah(p.anggaran)}` : ''}
                      </p>
                      {lanjut ? (
                        <Link
                          to={isLaporan ? `/kegiatan/${p.jenis || jenis}/laporan/${p.id}/isi` : `/kegiatan/${p.jenis || jenis}/usulan/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="btn btn-primary btn-sm mt-2"
                        >
                          Lanjutkan {p.status === 'revisi' ? 'revisi' : 'draf'}
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      ) : null}
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
                        <ChevronRight className="ml-auto size-4 text-slate-400" aria-hidden="true" />
                      ) : (
                        <>
                          {p.status === 'draft' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                hapus(p)
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                              disabled={deleting === p.id}
                              className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              {deleting === p.id ? 'Menghapus…' : 'Hapus'}
                            </button>
                          ) : (
                            <ChevronRight className="ml-auto size-4 text-slate-400" aria-hidden="true" />
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  )
                })
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
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to={usulanTo} className="btn btn-secondary h-12">
          <CirclePlus className="size-5" aria-hidden="true" />
          Usulkan Proposal Baru
        </Link>
        <Link to={`/kegiatan/${jenis}/laporan/baru`} className="btn btn-secondary h-12">
          <FileText className="size-5" aria-hidden="true" />
          Kirim Laporan Baru
        </Link>
      </div>

      <MemberSection jenis={jenis} label={label} userId={user?.id} />
    </div>
  )
}
