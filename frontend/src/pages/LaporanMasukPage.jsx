import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { UserPlus, X } from 'lucide-react'
import api from '../api/axios'
import { laporanApi } from '../api/laporan'
import { periodeApi } from '../api/periode'
import { JENIS_LABEL, STATUS_LABEL } from './ProposalDosen/constants'
import { DokumenLaporan, InfoTable, Message, ReviewList, StatusBadge } from './laporan/shared'
import LuaranCapaian from './laporan/LuaranCapaian'
import { hari, rupiah, tanggal } from './laporan/format'
import { confirmDialog } from '../utils/dialog'

// ---------------------------------------------------------------------------
// Laporan Masuk (Ketua LPPM / Admin): daftar semua laporan (GET /laporan),
// detail di panel (GET /laporan/:id), tugaskan/hapus reviewer, dan keputusan
// status (PATCH /laporan/:id/status). ?id=… membuka detail langsung (tautan
// dari notifikasi laporan_diajukan).
// ---------------------------------------------------------------------------

const LIMIT = 10
const KEPUTUSAN = ['review', 'revisi', 'disetujui', 'ditolak']

function errorText(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}

function DetailPanel({ id, onClose, onChanged }) {
  const [laporan, setLaporan] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [catatan, setCatatan] = useState('')
  const [reviewers, setReviewers] = useState(null)
  const [picked, setPicked] = useState([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    laporanApi
      .getById(id)
      .then((r) => {
        if (!alive) return
        setLaporan(r.data.data)
        setCatatan(r.data.data.catatanRevisi || '')
      })
      .catch((e) => alive && setError(errorText(e, 'Laporan gagal dimuat.')))
    return () => {
      alive = false
    }
  }, [id, tick])

  const reload = () => {
    setTick((t) => t + 1)
    onChanged()
  }

  const openReviewerPicker = async () => {
    setPicked([])
    try {
      const r = await api.get('/users', { params: { role: 'reviewer', limit: 100 } })
      const assigned = new Set((laporan.reviewerTugasan || []).map((t) => t.reviewerId ?? t.reviewer?.id))
      setReviewers((r.data.data || []).filter((u) => u.id !== laporan.pengusul?.id && !assigned.has(u.id)))
    } catch {
      setReviewers([])
    }
  }

  const assign = async () => {
    if (picked.length === 0) return
    setBusy(true)
    setMsg(null)
    try {
      await laporanApi.assignReviewers(laporan.id, picked)
      setReviewers(null)
      setMsg({ type: 'success', text: 'Reviewer ditugaskan. Status laporan menjadi Review.' })
      reload()
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Gagal menugaskan reviewer.') })
    } finally {
      setBusy(false)
    }
  }

  const unassign = async (reviewerId) => {
    if (!(await confirmDialog({ tone: 'danger', title: 'Hapus tugasan reviewer?', message: 'Reviewer ini tidak lagi ditugaskan menilai laporan.', confirmText: 'Ya, hapus' }))) return
    setBusy(true)
    try {
      await laporanApi.removeReviewer(laporan.id, reviewerId)
      reload()
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Gagal menghapus tugasan.') })
    } finally {
      setBusy(false)
    }
  }

  const decide = async (e) => {
    e.preventDefault()
    if (!status) return
    if ((status === 'revisi' || status === 'ditolak') && !catatan.trim()) {
      setMsg({ type: 'error', text: 'Tuliskan catatan untuk keputusan revisi/ditolak.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await laporanApi.updateStatus(laporan.id, { status, ...(status !== 'review' && catatan.trim() ? { catatanRevisi: catatan.trim() } : {}) })
      setMsg({ type: 'success', text: `Status laporan diubah menjadi ${STATUS_LABEL[status]}.` })
      setStatus('')
      reload()
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err, 'Gagal mengubah status.') })
    } finally {
      setBusy(false)
    }
  }

  const canAssign = laporan && (laporan.status === 'diajukan' || laporan.status === 'review')
  // Laporan yang sudah disetujui berstatus final: status tidak bisa diubah lagi.
  const canDecide = laporan && laporan.status !== 'draft' && laporan.status !== 'disetujui'

  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label="Detail laporan" className="dialog flex max-h-full max-w-4xl flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              Laporan {JENIS_LABEL[laporan?.jenis] || ''} {laporan ? <StatusBadge status={laporan.status} /> : null}
            </p>
            <h2 className="mt-1 break-words text-lg font-semibold text-navy-950">{laporan?.judul || 'Memuat…'}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Tutup">
            <X className="size-[18px]" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5" data-lenis-prevent>
          {error ? <Message msg={{ type: 'error', text: error }} /> : null}
          <Message msg={msg} />
          {!laporan ? (
            !error ? <span className="spinner mx-auto block text-navy-600" aria-hidden="true" /> : null
          ) : (
            <>
              <InfoTable
                rows={[
                  ['Pengusul', `${laporan.pengusul?.fullName || laporan.pengusul?.name || '—'}${laporan.pengusul?.nidn ? ` · NIDN ${laporan.pengusul.nidn}` : ''}`],
                  ['Periode', laporan.periode?.nama],
                  ['Diajukan', tanggal(laporan.submittedAt)],
                  ['Kata kunci', (laporan.kataKunci || []).join(', ') || '—'],
                  ...(laporan.jenis === 'penelitian' ? [['Metode penelitian', laporan.metodePenelitian || '—']] : []),
                  ['Target luaran', laporan.luaran || '—'],
                  ['Luaran tercapai', laporan.luaranTercapai || '—'],
                  ['Ringkasan hasil', laporan.ringkasanHasil || '—'],
                  ['Anggaran / realisasi', `${rupiah(laporan.anggaran)} / ${rupiah(laporan.realisasiAnggaran)}`],
                  ['Dokumen', <DokumenLaporan key="d" laporan={laporan} />],
                ]}
              />

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-navy-950">Reviewer</h3>
                  {canAssign ? (
                    <button type="button" onClick={openReviewerPicker} className="btn btn-secondary btn-sm" disabled={busy}>
                      <UserPlus className="size-4" aria-hidden="true" />
                      Tugaskan reviewer
                    </button>
                  ) : null}
                </div>
                {(laporan.reviewerTugasan || []).length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada reviewer.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {laporan.reviewerTugasan.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span>{t.reviewer?.fullName || t.reviewer?.name}</span>
                        <button type="button" onClick={() => unassign(t.reviewerId ?? t.reviewer?.id)} className="btn btn-ghost btn-sm text-red-700" disabled={busy}>
                          Hapus
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {reviewers ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    {reviewers.length === 0 ? (
                      <p className="text-sm text-slate-500">Tidak ada reviewer lain yang tersedia.</p>
                    ) : (
                      <ul className="max-h-56 space-y-1 overflow-y-auto">
                        {reviewers.map((u) => (
                          <li key={u.id}>
                            <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white">
                              <input
                                type="checkbox"
                                className="accent-navy-700"
                                checked={picked.includes(u.id)}
                                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))}
                              />
                              {u.fullName || u.name}
                              <span className="text-xs text-slate-500">{u.email}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={assign} disabled={busy || picked.length === 0} className="btn btn-primary btn-sm">
                        Tugaskan ({picked.length})
                      </button>
                      <button type="button" onClick={() => setReviewers(null)} className="btn btn-ghost btn-sm">
                        Batal
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-semibold text-navy-950">Capaian luaran</h3>
                <LuaranCapaian proposalId={laporan.proposalId} />
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-semibold text-navy-950">Hasil review</h3>
                <ReviewList reviews={laporan.reviews} />
              </section>

              {canDecide ? (
                <form onSubmit={decide} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold text-navy-950">Keputusan</h3>
                  <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                    <div>
                      <label htmlFor="lm-status" className="label">
                        Ubah status ke
                      </label>
                      <select id="lm-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">-- Pilih --</option>
                        {KEPUTUSAN.filter((s) => s !== laporan.status).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="lm-catatan" className="label">
                        Catatan untuk pengusul
                      </label>
                      <textarea
                        id="lm-catatan"
                        rows={3}
                        className="input resize-y"
                        value={catatan}
                        onChange={(e) => setCatatan(e.target.value)}
                        disabled={status === 'review'}
                        placeholder="Wajib untuk revisi/ditolak"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={busy || !status}>
                    Simpan keputusan
                  </button>
                </form>
              ) : (
                <p className="text-sm text-slate-500">
                  {laporan.status === 'disetujui'
                    ? 'Laporan sudah disetujui. Status final dan tidak dapat diubah lagi.'
                    : 'Laporan masih draft dan belum diajukan pengusul.'}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

// Laporan Masuk hanya memuat laporan dari periode AKTIF (Periode.isAktif). Filter
// bawaan "Perlu ditangani" = diajukan (belum ada reviewer) + review (menunggu
// keputusan). Laporan periode lama (mis. yang sudah disetujui) dilihat lewat menu
// Periode → pilih periode → tab Laporan. GET /laporan hanya menerima satu
// periodeId & satu status, jadi data diambil per periode × status (limit 100)
// lalu digabung dan dipaginasi di peramban.
const FILTERS = [
  { key: 'perlu', label: 'Perlu ditangani', statuses: ['diajukan', 'review'] },
  { key: 'revisi', label: STATUS_LABEL.revisi, statuses: ['revisi'] },
  { key: 'disetujui', label: STATUS_LABEL.disetujui, statuses: ['disetujui'] },
  { key: 'ditolak', label: STATUS_LABEL.ditolak, statuses: ['ditolak'] },
  { key: 'semua', label: 'Semua', statuses: [null] },
]
const FETCH_LIMIT = 100
const waktuLaporan = (l) => new Date(l.submittedAt || l.updatedAt || l.createdAt || 0).getTime()

function PeriodeAktif({ periodes, counts, selected, onSelect }) {
  return (
    <section aria-labelledby="periode-aktif" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="periode-aktif" className="text-lg font-semibold text-navy-950">
          Periode aktif
        </h2>
        <Link to="/periode" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          Laporan periode sebelumnya ada di menu Periode
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {periodes.map((p) => {
          const active = selected === String(p.id)
          const n = counts[p.id]
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? '' : String(p.id))}
                className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-navy-800 bg-navy-50 ring-1 ring-navy-800' : 'border-slate-200 bg-white hover:border-navy-300'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">{p.nama}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {JENIS_LABEL[p.jenis] || p.jenis}
                    {p.tanggalMulai ? ` · ${hari(p.tanggalMulai)} – ${hari(p.tanggalSelesai)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-2xl font-bold leading-none tabular-nums ${n ? 'text-amber-700' : 'text-slate-400'}`}>
                    {n === undefined ? '…' : n === null ? '—' : n}
                  </span>
                  <span className="text-xs text-slate-500">perlu ditangani</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function LaporanMasukPage() {
  const [params, setParams] = useSearchParams()
  const openId = params.get('id')
  const [periodes, setPeriodes] = useState(null) // periode aktif; null = memuat
  const [periodeFailed, setPeriodeFailed] = useState(false)
  const [periodeId, setPeriodeId] = useState('') // '' = semua periode aktif
  const [counts, setCounts] = useState({})
  const [all, setAll] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('perlu')
  const [jenis, setJenis] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    periodeApi
      .getAll()
      .then((r) => alive && setPeriodes((r.data.data || []).filter((p) => p.isAktif)))
      .catch(() => {
        if (!alive) return
        setPeriodes([])
        setPeriodeFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // Jumlah "perlu ditangani" per periode aktif (meta.total, limit 1).
  useEffect(() => {
    if (!periodes?.length) return undefined
    let alive = true
    const total = (r) => Number(r.data.meta?.total) || 0
    Promise.all(
      periodes.map((p) =>
        Promise.all(['diajukan', 'review'].map((st) => laporanApi.getAll({ periodeId: p.id, status: st, limit: 1 })))
          .then((rs) => [p.id, rs.reduce((n, r) => n + total(r), 0)])
          .catch(() => [p.id, null]),
      ),
    ).then((pairs) => alive && setCounts(Object.fromEntries(pairs)))
    return () => {
      alive = false
    }
  }, [periodes, tick])

  const targets = (periodes || []).filter((p) => (periodeId ? String(p.id) === periodeId : true) && (jenis ? p.jenis === jenis : true))
  const targetKey = targets.map((p) => p.id).join(',')

  useEffect(() => {
    if (periodes === null) return undefined
    let alive = true
    const ids = targetKey ? targetKey.split(',') : []
    const statuses = FILTERS.find((f) => f.key === filter).statuses
    setLoading(true)
    setFailed(false)
    Promise.all(
      ids.flatMap((id) =>
        statuses.map((st) =>
          laporanApi.getAll({ periodeId: id, limit: FETCH_LIMIT, ...(st ? { status: st } : {}), ...(query ? { search: query } : {}) }),
        ),
      ),
    )
      .then((rs) => {
        if (!alive) return
        const seen = new Set()
        const merged = rs
          .flatMap((r) => r.data.data || [])
          .filter((l) => l.status !== 'draft' && !seen.has(l.id) && seen.add(l.id))
          .sort((x, y) => waktuLaporan(y) - waktuLaporan(x))
        setAll(merged)
        setTruncated(rs.some((r) => Number(r.data.meta?.total) > FETCH_LIMIT))
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [periodes, targetKey, filter, query, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const open = (id) => setParams(id ? { id: String(id) } : {})
  const total = all.length
  const pages = Math.max(1, Math.ceil(total / LIMIT))
  const rows = all.slice((page - 1) * LIMIT, page * LIMIT)
  const filterLabel = FILTERS.find((f) => f.key === filter).label
  const noPeriode = periodes !== null && periodes.length === 0

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="page-title">Laporan Masuk</h1>
          <p className="page-desc">
            Laporan dari periode aktif yang perlu ditindaklanjuti: tugaskan reviewer dan beri keputusan.
          </p>
        </div>
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">Laporan Masuk</li>
          </ol>
        </nav>
      </header>

      {periodes === null ? (
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
      ) : noPeriode ? (
        <section className="card px-6 py-8 text-center">
          <h2 className="text-lg font-semibold text-navy-950">{periodeFailed ? 'Periode gagal dimuat' : 'Tidak ada periode aktif'}</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            {periodeFailed
              ? 'Daftar periode tidak dapat dimuat. Muat ulang halaman untuk mencoba lagi.'
              : 'Laporan Masuk hanya menampilkan laporan dari periode aktif. Laporan periode sebelumnya dapat dilihat di menu Periode.'}
          </p>
          <Link to="/periode" className="btn btn-secondary btn-sm mt-4">
            Buka Periode
          </Link>
        </section>
      ) : (
        <PeriodeAktif
          periodes={periodes}
          counts={counts}
          selected={periodeId}
          onSelect={(id) => {
            setPeriodeId(id)
            setPage(1)
          }}
        />
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Filter status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key)
                setPage(1)
              }}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
                filter === f.key ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(search.trim())
          }}
          className="flex gap-2"
        >
          <label htmlFor="lm-jenis" className="sr-only">
            Jenis
          </label>
          <select
            id="lm-jenis"
            className="input w-40"
            value={jenis}
            onChange={(e) => {
              setJenis(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Semua jenis</option>
            <option value="penelitian">Penelitian</option>
            <option value="pengabdian">Pengabdian</option>
          </select>
          <label htmlFor="lm-cari" className="sr-only">
            Cari judul
          </label>
          <input id="lm-cari" type="search" className="input w-56" placeholder="Cari judul atau abstrak" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="btn btn-secondary">
            Cari
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table className="table table-tight">
          <thead>
            <tr>
              <th scope="col">Diajukan</th>
              <th scope="col">Judul</th>
              <th scope="col">Pengusul</th>
              <th scope="col">Jenis</th>
              <th scope="col">Status</th>
              <th scope="col">Reviewer</th>
              <th scope="col">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr aria-hidden="true">
                <td colSpan={7}>
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                </td>
              </tr>
            ) : failed ? (
              <tr>
                <td colSpan={7} className="py-10 text-center">
                  <p className="text-slate-600">Daftar laporan gagal dimuat.</p>
                  <button type="button" onClick={refresh} className="btn btn-secondary btn-sm mt-3">
                    Coba lagi
                  </button>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  {noPeriode ? 'Tidak ada periode aktif.' : `Tidak ada laporan (${filterLabel.toLowerCase()}) di periode aktif.`}
                </td>
              </tr>
            ) : (
              rows.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap tabular-nums">{tanggal(l.submittedAt || l.createdAt)}</td>
                  <td className="min-w-[16rem] max-w-md">
                    <p className="line-clamp-2 font-semibold text-slate-900">{l.judul}</p>
                    <p className="text-xs text-slate-500">{l.periode?.nama || '—'}</p>
                  </td>
                  <td>{l.pengusul?.fullName || l.pengusul?.name}</td>
                  <td>{JENIS_LABEL[l.jenis] || l.jenis}</td>
                  <td>
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="tabular-nums">{(l.reviewerTugasan || []).length}</td>
                  <td className="text-right">
                    <button type="button" onClick={() => open(l.id)} className="btn btn-ghost btn-sm">
                      Kelola
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > LIMIT ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span className="tabular-nums">
            Halaman {page} dari {pages} · {total} laporan
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

      {truncated ? (
        <p className="text-xs text-amber-700">Lebih dari {FETCH_LIMIT} laporan cocok di satu periode; persempit dengan pencarian atau filter.</p>
      ) : null}

      {openId ? <DetailPanel key={openId} id={openId} onClose={() => open(null)} onChanged={refresh} /> : null}
    </div>
  )
}
