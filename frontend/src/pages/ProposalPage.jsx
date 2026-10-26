import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { proposalApi } from '../api/proposal'
import useDokumenMasuk, { FETCH_LIMIT, FILTERS_MASUK } from '../hooks/useDokumenMasuk'
import { FilterMasuk, PeriodeAktif, TanpaPeriodeAktif } from '../components/PeriodeAktif'
import { API_BASE_URL } from '../api/axios'
import useAuthStore from '../store/authStore'
import { alertDialog } from '../utils/dialog'
import { getRoleNames } from '../utils/roles'
import HapusDokumen from '../components/HapusDokumen'
import Breadcrumb from '../components/Breadcrumb'
import PermintaanHapusDokumen from '../components/PermintaanHapusDokumen'

// Proposal yang sudah disetujui berstatus final: Ketua/Admin tidak bisa mengubahnya lagi.
const isStatusFinal = (status) => status === 'disetujui'

const openDokumenWithAuth = async (proposalId) => {
  const token = localStorage.getItem('accessToken')
  const base = API_BASE_URL

  const res = await fetch(`${base}/proposals/${proposalId}/dokumen-utama`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    alertDialog({ title: 'Gagal membuka dokumen', message: 'Dokumen tidak dapat dibuka. Silakan coba lagi.' })
    return
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

// ── Konstanta ─────────────────────────────────────────────────────────────────
const JENIS_LABEL = {
  penelitian: 'Penelitian',
  pengabdian: 'Pengabdian',
}

const STATUS_LABEL = {
  draft: 'Draft',
  diajukan: 'Diajukan',
  review: 'Review',
  revisi: 'Revisi',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
}

// Status memakai lencana bertitik (kelas ada di index.css)
const STATUS_COLOR = {
  draft: 'badge-neutral',
  diajukan: 'badge-info',
  review: 'badge-review',
  revisi: 'badge-warning',
  disetujui: 'badge-success',
  ditolak: 'badge-danger',
}

// ── Komponen Kecil ────────────────────────────────────────────────────────────
function Badge({ label, className }) {
  return <span className={`badge ${className}`}>{label}</span>
}

// Proposal Kegiatan (Dokumen Masuk): hanya periode aktif, bawaan "Perlu ditangani".
const fetchProposals = (params) => proposalApi.getAll(params)

export default function ProposalPage() {
  const { user } = useAuthStore()
  // Admin (peran pertama): lihat & hapus saja; ubah status/penugasan oleh Ketua LPPM.
  const viewOnly = getRoleNames(user?.roles)[0] === 'admin'

  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('perlu')
  const [jenis, setJenis] = useState('')
  const [periodeId, setPeriodeId] = useState('') // '' = semua periode aktif
  const [tick, setTick] = useState(0)
  const { periodes, periodeFailed, counts, all, truncated, loading, noPeriode } = useDokumenMasuk({
    fetchList: fetchProposals,
    filter,
    periodeId,
    jenis,
    query,
    tick,
  })
  const total = all.length
  const proposals = all.slice((page - 1) * limit, page * limit)

  const totalPages = Math.max(1, Math.ceil(total / limit))

  // Detail & ubah status = halaman /proposals/detail/:id (bukan modal). ?detail=<id>
  // (pencarian global, notifikasi, tautan lama) dialihkan ke sana.
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const linkedId = Number(searchParams.get('detail')) || null
  const bukaDetail = (pid, hash = '') => navigate(`/proposals/detail/${pid}${hash}`)

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  if (linkedId) return <Navigate to={`/proposals/detail/${linkedId}`} replace />

  return (
    <>
      <div className="page space-y-6">
        <Breadcrumb className="flex justify-end" items={[{ label: 'Dokumen Masuk' }, { label: 'Proposal Kegiatan' }]} />
        {/* Judul halaman */}
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="page-title">Monitoring Proposal Kewirausahaan</h1>
            <p className="page-desc">
              Kelola proposal penelitian dan pengabdian secara terstruktur,
              pantau status evaluasi, serta tinjau progres dokumen, reviewer,
              dan laporan dalam satu halaman kerja.
            </p>
            {user?.role && (
              <p className="mt-3 text-sm text-slate-500">
                Peran: <span className="font-medium text-slate-700">{user.role}</span>
              </p>
            )}
          </div>

          <dl className="flex shrink-0 gap-10">
            <div>
              <dt className="text-sm text-slate-500">Total Proposal</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{total}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Halaman Aktif</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{page}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Total Halaman</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{totalPages}</dd>
            </div>
          </dl>
        </header>

        {/* Ketua: permintaan hapus dokumen dari Admin (W-34), proposal & laporan */}
        {viewOnly ? null : <PermintaanHapusDokumen onChanged={() => setTick((t) => t + 1)} />}

        {/* Dokumen Masuk: periode aktif + filter "Perlu ditangani" (hooks/useDokumenMasuk) */}
        {noPeriode ? (
          <TanpaPeriodeAktif failed={periodeFailed} noun="Proposal" />
        ) : (
          <PeriodeAktif
            periodes={periodes}
            counts={counts}
            selected={periodeId}
            noun="Proposal"
            onSelect={(id) => {
              setPeriodeId(id)
              setPage(1)
            }}
          />
        )}
        <FilterMasuk
          value={filter}
          onChange={(key) => {
            setFilter(key)
            setPage(1)
          }}
        />

        {/* Pencarian dan filter */}
        <section className="card px-6 py-5" aria-labelledby="filter-proposal-title">
          <h2 id="filter-proposal-title" className="sr-only">Pencarian dan Filter</h2>

          <form onSubmit={handleSearchSubmit}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <label htmlFor="search" className="label">
                  Kata Kunci Proposal
                </label>
                <input
                  id="search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari judul proposal, ketua, atau email"
                  className="input"
                />
              </div>

              <div className="lg:col-span-3">
                <label htmlFor="jenis" className="label">
                  Jenis Proposal
                </label>
                <select
                  id="jenis"
                  value={jenis}
                  onChange={(e) => {
                    setJenis(e.target.value)
                    setPage(1)
                  }}
                  className="input"
                >
                  <option value="">Semua jenis</option>
                  {Object.entries(JENIS_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end lg:col-span-3">
                <button type="submit" className="btn btn-primary w-full">
                  Cari Proposal
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Tabel data utama */}
        <section className="card overflow-hidden">
          <header className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-navy-950">Daftar Proposal</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {total} proposal ({FILTERS_MASUK.find((f) => f.key === filter).label.toLowerCase()}) dari periode aktif.
              {truncated ? ` Lebih dari ${FETCH_LIMIT} cocok di satu periode; persempit dengan pencarian.` : ''}
            </p>
          </header>

          {loading ? (
            <p className="flex items-center justify-center gap-3 px-6 py-14 text-center text-base text-slate-500">
              <span className="spinner text-navy-600" aria-hidden="true" />
              Memuat data...
            </p>
          ) : proposals.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <h3 className="text-lg font-semibold text-navy-950">
                Tidak ada proposal ditemukan
              </h3>
              <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-slate-500">
                Coba ubah kata kunci, filter status, atau periode. Proposal periode
                sebelumnya ada di menu Periode.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table table-tight min-w-[880px]">
                  <thead>
                    <tr>
                      <th className="pl-6">Judul Proposal</th>
                      <th>Ketua</th>
                      <th>Anggaran</th>
                      <th>Status</th>
                      <th>Anggota</th>
                      <th className="pr-6">Tindakan</th>
                    </tr>
                  </thead>

                  <tbody>
                    {proposals.map((p) => (
                      <tr key={p.id}>
                        <td className="min-w-[16rem] max-w-[30rem] pl-6">
                          <p className="font-medium leading-snug text-slate-900">
                            {p.judul}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <Badge
                              label={JENIS_LABEL[p.jenis] || p.jenis || '—'}
                              className="badge-tag"
                            />
                            <span className="text-sm text-slate-500">
                              ID Proposal #{p.id}
                            </span>
                          </div>
                        </td>

                        <td>
                          <p className="font-medium text-slate-900">
                            {p.pengusul?.fullName || p.pengusul?.name || '—'}
                          </p>
                          <p
                            className="mt-0.5 max-w-[12rem] truncate text-sm text-slate-500"
                            title={p.pengusul?.email || undefined}
                          >
                            {p.pengusul?.email || '—'}
                          </p>
                        </td>

                        <td className="whitespace-nowrap tabular-nums text-slate-900">
                          {p.anggaran
                            ? `Rp ${Number(p.anggaran).toLocaleString('id-ID')}`
                            : '—'}
                        </td>

                        <td>
                          <Badge
                            label={STATUS_LABEL[p.status] || p.status || '—'}
                            className={STATUS_COLOR[p.status] || 'badge-neutral'}
                          />
                        </td>

                        <td className="whitespace-nowrap text-slate-900">
                          {p.anggota?.length ?? 0} orang
                        </td>

                        <td className="pr-6">
                          <div className="-ml-2 flex w-[9.5rem] flex-col gap-0.5">
                            <button
                              onClick={() => bukaDetail(p.id)}
                              className="btn btn-ghost btn-sm w-full justify-start px-2 text-navy-800"
                            >
                              Lihat Detail Proposal
                            </button>

                            {viewOnly ? null : (
                              <button
                                onClick={() => bukaDetail(p.id, '#keputusan')}
                                disabled={isStatusFinal(p.status)}
                                title={isStatusFinal(p.status) ? 'Proposal sudah disetujui; status tidak dapat diubah lagi.' : undefined}
                                className="btn btn-ghost btn-sm w-full justify-start px-2 text-navy-800 disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                                {isStatusFinal(p.status) ? 'Status final (disetujui)' : 'Ubah Status Proposal'}
                              </button>
                            )}

                            <button
                              onClick={() => openDokumenWithAuth(p.id)}
                              className="btn btn-ghost btn-sm w-full justify-start px-2"
                            >
                              Lihat Dokumen Utama
                            </button>

                            {viewOnly ? (
                              <div className="px-2 pt-1">
                                <HapusDokumen
                                  compact
                                  tipe="proposal"
                                  id={p.id}
                                  status={p.status}
                                  noun="proposal"
                                  judul={p.judul}
                                  onDelete={async () => {
                                    await proposalApi.delete(p.id)
                                    setTick((t) => t + 1)
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Navigasi halaman */}
              <footer className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-base text-slate-500">
                  Halaman {page} dari {totalPages} — {total} total
                </p>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                    className="btn btn-secondary"
                  >
                    Halaman Sebelumnya
                  </button>

                  <button
                    onClick={() =>
                      setPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={page >= totalPages}
                    className="btn btn-secondary"
                  >
                    Halaman Berikutnya
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

    </>
  )
}
