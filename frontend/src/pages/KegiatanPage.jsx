import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { proposalDosenApi } from '../api/Proposaldosen'
import ApiPending from '../components/ApiPending'
import { ProposalDetailModal } from './ProposalDosen/ProposalDetailModal'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Halaman menu "Kegiatan" (Penelitian / Pengabdian) untuk dosen: ringkasan
// dan daftar proposal milik dosen untuk satu jenis kegiatan. Data dari
// GET /dosen/proposals (filter jenis, status, search). Bagian tanpa endpoint
// memakai ApiPending dan dicatat di docs/waitingApi-list.md.
// ---------------------------------------------------------------------------

const LIMIT = 10
const STATUSES = ['draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak']

const COPY = {
  penelitian: {
    desc: 'Seluruh usulan penelitian yang Anda ajukan sebagai ketua, beserta statusnya.',
    extraLabel: 'Skema',
    empty: 'Belum ada usulan penelitian.',
  },
  pengabdian: {
    desc: 'Seluruh usulan pengabdian kepada masyarakat yang Anda ajukan sebagai ketua, beserta statusnya.',
    extraLabel: 'Mitra',
    empty: 'Belum ada usulan pengabdian.',
  },
}

const rupiah = (value) =>
  value === null || value === undefined || value === '' ? '—' : `Rp ${Number(value).toLocaleString('id-ID')}`

// Jumlah per status dibaca dari meta.total (satu baris per permintaan).
async function loadCounts(jenis) {
  const totals = await Promise.all(
    STATUSES.map((status) =>
      proposalDosenApi.getAll({ jenis, status, limit: 1 }).then((r) => Number(r.data.meta?.total) || 0),
    ),
  )
  return Object.fromEntries(STATUSES.map((s, i) => [s, totals[i]]))
}

function SummaryCard({ label, value, hint, pending }) {
  return (
    <li className="card px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 font-serif text-[2rem] font-medium leading-none tabular-nums lining-nums text-navy-950">
        {value === null || value === undefined ? '—' : value}
      </p>
      {pending ? <ApiPending className="mt-2" /> : hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
    </li>
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

  const [counts, setCounts] = useState(null)
  const [countsFailed, setCountsFailed] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [tick, setTick] = useState(0)

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
    return () => {
      alive = false
    }
  }, [jenis, tick])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    proposalDosenApi
      .getAll({ jenis, page, limit: LIMIT, ...(status ? { status } : {}), ...(query ? { search: query } : {}) })
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
  }, [jenis, page, status, query, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const all = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null
  const diproses = counts ? counts.diajukan + counts.review : null
  const pages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="page rise space-y-6">
      <header className="space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li className="text-slate-500">Kegiatan</li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">{label}</li>
          </ol>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="page-title">{label}</h1>
            <p className="page-desc">{copy.desc}</p>
          </div>
          <Link to="/proposal-saya" className="btn btn-primary shrink-0">
            Ajukan {label.toLowerCase()} baru
          </Link>
        </div>
      </header>

      <section aria-label={`Ringkasan ${label.toLowerCase()}`}>
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <SummaryCard label={`Total ${label.toLowerCase()}`} value={all} hint={counts ? `${counts.draft} masih draft` : null} />
          <SummaryCard label="Disetujui" value={counts?.disetujui} hint="Sedang/sudah dilaksanakan" />
          <SummaryCard label="Diproses" value={diproses} hint={counts ? `${counts.revisi} perlu revisi` : null} />
          <SummaryCard label="Ditolak" value={counts?.ditolak} hint="Tidak lolos seleksi" />
          <SummaryCard label="Luaran tercatat" value={null} pending />
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

      <section aria-labelledby="daftar-kegiatan" className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="daftar-kegiatan" className="text-lg font-semibold text-navy-950">
            Daftar {label.toLowerCase()}
          </h2>
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
              {counts ? <span className="ml-1.5 tabular-nums opacity-70">{counts[s]}</span> : null}
            </FilterChip>
          ))}
        </div>

        <div className="table-wrap">
          <table className="table table-tight">
            <thead>
              <tr>
                <th scope="col">Judul</th>
                <th scope="col">Periode</th>
                <th scope="col">Anggaran</th>
                <th scope="col">Status</th>
                <th scope="col">{copy.extraLabel}</th>
                <th scope="col">Tahapan</th>
                <th scope="col">Luaran</th>
                <th scope="col">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <tr key={i} aria-hidden="true">
                    <td colSpan={8}>
                      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : failed ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <p className="text-slate-600">Daftar {label.toLowerCase()} gagal dimuat.</p>
                    <button type="button" onClick={refresh} className="btn btn-secondary btn-sm mt-3">
                      Coba lagi
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    {status || query ? 'Tidak ada yang cocok dengan filter.' : copy.empty}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id}>
                    <td className="min-w-[16rem] max-w-md">
                      <p className="line-clamp-2 font-semibold text-slate-900">{p.judul}</p>
                    </td>
                    <td className="whitespace-nowrap">{p.periode?.nama || 'Belum ada periode'}</td>
                    <td className="whitespace-nowrap tabular-nums">{rupiah(p.anggaran)}</td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[p.status] || 'badge-neutral'}`}>
                        {STATUS_LABEL[p.status] || p.status}
                      </span>
                    </td>
                    <td>
                      <ApiPending className="whitespace-nowrap" />
                    </td>
                    <td>
                      <ApiPending className="whitespace-nowrap" />
                    </td>
                    <td>
                      <ApiPending className="whitespace-nowrap" />
                    </td>
                    <td className="text-right">
                      <button type="button" onClick={() => setSelectedId(p.id)} className="btn btn-ghost btn-sm">
                        Detail
                      </button>
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

      <section aria-labelledby="kegiatan-anggota" className="card px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="kegiatan-anggota" className="text-lg font-semibold text-navy-950">
            {label} sebagai anggota tim
          </h2>
          <ApiPending />
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
          Daftar {label.toLowerCase()} milik dosen lain yang Anda ikuti sebagai anggota belum tersedia.
          Undangan tim yang menunggu respons dapat dilihat di menu{' '}
          <Link to="/undangan" className="font-semibold text-navy-700 hover:text-navy-900">
            Undangan Tim
          </Link>
          .
        </p>
      </section>

      {selectedId ? (
        <ProposalDetailModal proposalId={selectedId} onClose={() => setSelectedId(null)} onRefresh={refresh} />
      ) : null}
    </div>
  )
}
