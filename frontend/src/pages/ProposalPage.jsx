import { useEffect, useState, useCallback } from 'react'
import { proposalApi } from '../api/proposal'
import { usersApi } from '../api/users'
import { API_BASE_URL } from '../api/axios'
import useAuthStore from '../store/authStore'
import { X } from 'lucide-react'
import { alertDialog } from '../utils/dialog'

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

const REKOMENDASI_COLOR = {
  disetujui: 'text-green-700',
  ditolak: 'text-red-700',
  revisi: 'text-yellow-700',
}

// ── Komponen Kecil ────────────────────────────────────────────────────────────
function Badge({ label, className }) {
  return <span className={`badge ${className}`}>{label}</span>
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay">
      <div
        className={`dialog flex max-h-full flex-col ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <h2 className="line-clamp-2 min-w-0 text-lg font-semibold leading-snug text-navy-950">
            {title}
          </h2>

          <button onClick={onClose} className="icon-btn" aria-label="Tutup" title="Tutup">
            <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        {/* Penggulir tanpa padding agar footer lengket menempel di dasar dialog */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function ProposalPage() {
  const { user } = useAuthStore()

  const [proposals, setProposals] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [jenis, setJenis] = useState('')
  const [loading, setLoading] = useState(false)

  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const [showStatusModal, setShowStatusModal] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [catatanRevisi, setCatatanRevisi] = useState('')
  const [selectedReviewers, setSelectedReviewers] = useState([])
  const [reviewerList, setReviewerList] = useState([])
  const [savingStatus, setSavingStatus] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const fetchProposalList = useCallback(async () => {
    try {
      setLoading(true)
      const res = await proposalApi.getAll({
        page,
        limit,
        search,
        status,
        jenis,
      })

      const payload = res?.data || {}
      setProposals(payload?.data || [])
      setTotal(payload?.total || 0)
    } catch (error) {
      console.error(error)
      setProposals([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, status, jenis])

  const fetchDetail = useCallback(async (id) => {
    try {
      setDetailLoading(true)
      const res = await proposalApi.getById(id)
      setDetail(res?.data?.data || null)
    } catch (error) {
      console.error(error)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const fetchReviewer = useCallback(async () => {
    try {
      const res = await usersApi.getAll({
        role: 'reviewer',
        page: 1,
        limit: 100,
      })
      setReviewerList(res?.data?.data || [])
    } catch (error) {
      console.error(error)
      setReviewerList([])
    }
  }, [])

  useEffect(() => {
    fetchProposalList()
  }, [fetchProposalList])

  useEffect(() => {
    if (showStatusModal && newStatus === 'revisi') {
      fetchReviewer()
    }
  }, [showStatusModal, newStatus, fetchReviewer])

  const handleOpenDetail = async (item) => {
    setSelected(item)
    setShowDetail(true)
    await fetchDetail(item.id)
  }

  const handleCloseDetail = () => {
    setShowDetail(false)
    setSelected(null)
    setDetail(null)
  }

  const handleOpenStatusModal = async (item) => {
    setSelected(item)
    setShowStatusModal(true)
    setNewStatus(item?.status || '')
    setCatatanRevisi(item?.catatanRevisi || '')
    setSelectedReviewers([])
    await fetchDetail(item.id)
  }

  const handleCloseStatusModal = () => {
    setShowStatusModal(false)
    setSelected(null)
    setDetail(null)
    setNewStatus('')
    setCatatanRevisi('')
    setSelectedReviewers([])
  }

  const handleToggleReviewer = (reviewerId) => {
    setSelectedReviewers((prev) =>
      prev.includes(reviewerId)
        ? prev.filter((id) => id !== reviewerId)
        : [...prev, reviewerId]
    )
  }

  const handleSubmitStatus = async (e) => {
    e.preventDefault()
    if (!selected?.id) return

    try {
      setSavingStatus(true)

      await proposalApi.updateStatus(selected.id, {
        status: newStatus,
        catatanRevisi,
        reviewerIds: selectedReviewers,
      })

      await fetchProposalList()
      await fetchDetail(selected.id)
      handleCloseStatusModal()
    } catch (error) {
      console.error(error)
      alertDialog({ title: 'Gagal memperbarui status proposal', message: error.response?.data?.message || 'Silakan coba lagi.' })
    } finally {
      setSavingStatus(false)
    }
  }

  const handleSearchSubmit = async (e) => {
    e.preventDefault()
    setPage(1)
    await fetchProposalList()
  }

  return (
    <>
      <div className="page space-y-6">
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

        {/* Pencarian dan filter */}
        <section className="card px-6 py-5" aria-labelledby="filter-proposal-title">
          <h2 id="filter-proposal-title" className="sr-only">Pencarian dan Filter</h2>

          <form onSubmit={handleSearchSubmit}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
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
                <label htmlFor="status" className="label">
                  Status Proposal
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input"
                >
                  <option value="">Semua status</option>
                  {Object.entries(STATUS_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label htmlFor="jenis" className="label">
                  Jenis Proposal
                </label>
                <select
                  id="jenis"
                  value={jenis}
                  onChange={(e) => setJenis(e.target.value)}
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

              <div className="flex items-end lg:col-span-2">
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
            <p className="mt-0.5 text-sm text-slate-500">{total} proposal ditemukan.</p>
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
                Coba ubah kata kunci pencarian atau filter status untuk melihat
                data lain.
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
                              onClick={() => handleOpenDetail(p)}
                              className="btn btn-ghost btn-sm w-full justify-start px-2 text-navy-800"
                            >
                              Lihat Detail Proposal
                            </button>

                            <button
                              onClick={() => handleOpenStatusModal(p)}
                              className="btn btn-ghost btn-sm w-full justify-start px-2 text-navy-800"
                            >
                              Ubah Status Proposal
                            </button>

                            <button
                              onClick={() => openDokumenWithAuth(p.id)}
                              className="btn btn-ghost btn-sm w-full justify-start px-2"
                            >
                              Lihat Dokumen Utama
                            </button>
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

      {/* Dialog detail proposal */}
      {showDetail && (
        <Modal
          title={
            selected?.judul
              ? `Detail Proposal: ${selected.judul}`
              : 'Detail Proposal'
          }
          onClose={handleCloseDetail}
          wide
        >
          {detailLoading ? (
            <p className="flex items-center justify-center gap-3 py-12 text-base text-slate-500">
              <span className="spinner text-navy-600" aria-hidden="true" />
              Memuat detail...
            </p>
          ) : !detail ? (
            <p className="py-12 text-center text-base text-slate-500">
              Gagal memuat data.
            </p>
          ) : (
            <div className="space-y-8">
              {/* Ringkasan utama */}
              <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <h3 className="text-base font-semibold text-navy-950">
                    Informasi Utama Proposal
                  </h3>

                  <div>
                    <p className="text-sm text-slate-500">Judul</p>
                    <p className="mt-1 font-serif text-xl font-medium leading-snug text-navy-950">
                      {detail.judul || '—'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-slate-500">Jenis Proposal</p>
                      <div className="mt-1.5">
                        <Badge
                          label={
                            JENIS_LABEL[detail.jenis] || detail.jenis || '—'
                          }
                          className="badge-tag"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500">Status Proposal</p>
                      <div className="mt-1.5">
                        <Badge
                          label={
                            STATUS_LABEL[detail.status] ||
                            detail.status ||
                            '—'
                          }
                          className={
                            STATUS_COLOR[detail.status] || 'badge-neutral'
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500">Anggaran</p>
                      <p className="mt-1 text-base font-medium tabular-nums text-slate-900">
                        {detail.anggaran
                          ? `Rp ${Number(detail.anggaran).toLocaleString('id-ID')}`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Abstrak</p>
                    <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-slate-700">
                      {detail.abstrak || '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Catatan Revisi</p>
                    <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-slate-700">
                      {detail.catatanRevisi || '—'}
                    </p>
                  </div>
                </div>

                <aside className="space-y-5 border-t border-slate-200 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                  <h3 className="text-base font-semibold text-navy-950">
                    Ringkasan Tim
                  </h3>

                  <div>
                    <p className="text-sm text-slate-500">Ketua Pengusul</p>
                    <p className="mt-1 text-base font-medium text-slate-900">
                      {detail?.pengusul?.fullName ||
                        detail?.pengusul?.name ||
                        '—'}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-slate-500">
                      {detail?.pengusul?.email || '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Jumlah Anggota</p>
                    <p className="mt-1 font-serif text-3xl font-medium tabular-nums text-navy-950">
                      {detail?.anggota?.length ?? 0}
                    </p>
                  </div>

                  <button
                    onClick={() => openDokumenWithAuth(detail.id)}
                    className="btn btn-primary w-full"
                  >
                    Lihat Dokumen
                  </button>
                </aside>
              </section>

              {/* Struktur data detail */}
              <section className="grid grid-cols-1 gap-x-10 gap-y-8 border-t border-slate-200 pt-8 xl:grid-cols-2">
                <div>
                  <h3 className="text-base font-semibold text-navy-950">
                    Anggota Tim
                  </h3>

                  {!detail.anggota || detail.anggota.length === 0 ? (
                    <p className="mt-3 text-base text-slate-500">
                      Tidak ada anggota tim.
                    </p>
                  ) : (
                    <div className="mt-2 divide-y divide-slate-100">
                      {detail.anggota.map((a, idx) => (
                        <div key={idx} className="py-3">
                          <p className="text-base font-medium text-slate-900">
                            {a.user?.fullName || a.user?.name}
                          </p>
                          <p className="mt-0.5 break-words text-sm text-slate-500">
                            {a.user?.email}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-semibold text-navy-950">
                    Reviewer Ditugaskan
                  </h3>

                  {!detail.reviewerTugasan || detail.reviewerTugasan.length === 0 ? (
                    <p className="mt-3 text-base text-slate-500">
                      Belum ada reviewer ditugaskan.
                    </p>
                  ) : (
                    <div className="mt-2 divide-y divide-slate-100">
                      {detail.reviewerTugasan.map((rt, idx) => (
                        <div key={idx} className="py-3">
                          <p className="text-base font-medium text-slate-900">
                            {rt.reviewer?.fullName || rt.reviewer?.name}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            Ditugaskan{' '}
                            {new Date(rt.createdAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="xl:col-span-2">
                  <h3 className="text-base font-semibold text-navy-950">
                    Hasil Review
                  </h3>

                  {!detail.review || detail.review.length === 0 ? (
                    <p className="mt-3 text-base text-slate-500">
                      Belum ada hasil review.
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {detail.review.map((rv, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <p className="text-base font-medium text-slate-900">
                            {rv.reviewer?.fullName || rv.reviewer?.name || 'Reviewer'}
                          </p>
                          <p
                            className={`mt-0.5 text-sm font-semibold ${
                              REKOMENDASI_COLOR[rv.rekomendasi] || 'text-slate-600'
                            }`}
                          >
                            Rekomendasi:{' '}
                            {rv.rekomendasi
                              ? rv.rekomendasi.charAt(0).toUpperCase() +
                                rv.rekomendasi.slice(1)
                              : '—'}
                          </p>

                          <p className="mt-3 text-sm text-slate-500">Catatan</p>
                          <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-slate-700">
                            {rv.catatan || '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="xl:col-span-2">
                  <h3 className="text-base font-semibold text-navy-950">
                    Laporan Kegiatan
                  </h3>

                  {!detail.laporan || detail.laporan.length === 0 ? (
                    <p className="mt-3 text-base text-slate-500">
                      Belum ada laporan diunggah.
                    </p>
                  ) : (
                    <div className="mt-2 divide-y divide-slate-100">
                      {detail.laporan.map((l, idx) => (
                        <div key={idx} className="space-y-1.5 py-4">
                          <p className="text-base font-semibold text-slate-900">
                            {l.judul}
                          </p>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <Badge label={l.jenis} className="badge-tag" />
                            <span className="text-sm text-slate-500">
                              {new Date(l.createdAt).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          {l.keterangan && (
                            <p className="text-base leading-relaxed text-slate-700">
                              {l.keterangan}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="xl:col-span-2">
                  <h3 className="text-base font-semibold text-navy-950">
                    Dokumen Lampiran
                  </h3>

                  {!detail.dokumen || detail.dokumen.length === 0 ? (
                    <p className="mt-3 text-base text-slate-500">
                      Belum ada dokumen lampiran.
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {detail.dokumen.map((d, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-base font-medium text-slate-900">
                              {d.namaFile}
                            </p>
                            {d.ukuran && (
                              <p className="mt-0.5 text-sm text-slate-500">
                                {(d.ukuran / 1024).toFixed(1)} KB
                              </p>
                            )}
                          </div>

                          <a
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm shrink-0"
                          >
                            Lihat Dokumen
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </Modal>
      )}

      {/* Dialog ubah status */}
      {showStatusModal && (
        <Modal
          title={
            selected?.judul
              ? `Ubah Status: ${selected.judul}`
              : 'Ubah Status Proposal'
          }
          onClose={handleCloseStatusModal}
          wide
        >
          {detailLoading ? (
            <p className="flex items-center justify-center gap-3 py-12 text-base text-slate-500">
              <span className="spinner text-navy-600" aria-hidden="true" />
              Memuat detail...
            </p>
          ) : !detail ? (
            <p className="py-12 text-center text-base text-slate-500">
              Gagal memuat data.
            </p>
          ) : (
            <form onSubmit={handleSubmitStatus} className="space-y-8">
              {/* Blok formulir utama */}
              <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <h3 className="text-base font-semibold text-navy-950">
                    Formulir Perubahan Status
                  </h3>

                  <div>
                    <label htmlFor="newStatus" className="label">
                      Status Proposal
                    </label>
                    <select
                      id="newStatus"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="input"
                    >
                      <option value="">Pilih status</option>
                      {Object.entries(STATUS_LABEL).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="catatanRevisi" className="label">
                      Catatan Revisi
                    </label>
                    <textarea
                      id="catatanRevisi"
                      value={catatanRevisi}
                      onChange={(e) => setCatatanRevisi(e.target.value)}
                      rows={5}
                      placeholder="Tuliskan catatan evaluasi atau arahan revisi"
                      className="input leading-relaxed"
                    />
                  </div>
                </div>

                <aside className="space-y-5 border-t border-slate-200 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                  <h3 className="text-base font-semibold text-navy-950">
                    Ringkasan Proposal
                  </h3>

                  <div>
                    <p className="text-sm text-slate-500">Judul</p>
                    <p className="mt-1 text-base font-medium text-slate-900">
                      {detail.judul || '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Ketua Pengusul</p>
                    <p className="mt-1 text-base font-medium text-slate-900">
                      {detail?.pengusul?.fullName ||
                        detail?.pengusul?.name ||
                        '—'}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">Status Saat Ini</p>
                    <div className="mt-1.5">
                      <Badge
                        label={
                          STATUS_LABEL[detail.status] || detail.status || '—'
                        }
                        className={
                          STATUS_COLOR[detail.status] || 'badge-neutral'
                        }
                      />
                    </div>
                  </div>
                </aside>
              </section>

              {/* Reviewer saat revisi */}
              {newStatus === 'revisi' && (
                <section className="border-t border-slate-200 pt-8">
                  <h3 className="text-base font-semibold text-navy-950">
                    Tugaskan Reviewer
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Pilih reviewer yang memenuhi syarat untuk meninjau proposal
                    ini.
                  </p>

                  {(() => {
                    // Kumpulkan semua ID yang terlibat dalam proposal (ketua + anggota)
                    const terlibatIds = new Set(
                      [
                        detail?.pengusul?.id,
                        ...(detail?.anggota?.map((a) => a.user?.id ?? a.userId) ??
                          []),
                      ].filter(Boolean)
                    )

                    const eligibleReviewers = reviewerList.filter(
                      (r) => !terlibatIds.has(r.id)
                    )

                    const alreadyAssigned =
                      detail?.reviewerTugasan?.map(
                        (rt) => rt.reviewer?.id ?? rt.reviewerId
                      ) ?? []

                    return (
                      <>
                        <div className="mt-4 space-y-2">
                          {eligibleReviewers.length === 0 && (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                              Tidak ada reviewer yang tersedia — semua reviewer
                              terdaftar sebagai anggota tim proposal ini.
                            </p>
                          )}

                          {terlibatIds.size > 0 && (
                            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                              {terlibatIds.size} anggota tim (termasuk ketua)
                              tidak dapat ditugaskan sebagai reviewer.
                            </p>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {eligibleReviewers.map((r) => {
                            const isAssigned = alreadyAssigned.includes(r.id)
                            const isSelected = selectedReviewers.includes(r.id)

                            return (
                              <label
                                key={r.id}
                                className={`flex cursor-pointer items-start gap-3.5 rounded-lg border p-4 transition-colors ${
                                  isSelected
                                    ? 'border-navy-600 bg-navy-50'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                } ${isAssigned ? 'opacity-70' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 size-4 rounded accent-navy-800"
                                  checked={isSelected}
                                  onChange={() => handleToggleReviewer(r.id)}
                                />

                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-medium text-slate-900">
                                    {r.fullName || r.name}
                                  </p>
                                  <p className="mt-0.5 break-words text-sm text-slate-500">
                                    {r.email}
                                  </p>
                                  {isAssigned && (
                                    <p className="mt-2 text-sm font-medium text-navy-700">
                                      Reviewer ini sudah pernah ditugaskan pada
                                      proposal ini.
                                    </p>
                                  )}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </>
                    )
                  })()}
                </section>
              )}

              {/* Data pendukung untuk pengambil keputusan */}
              <section className="grid grid-cols-1 gap-x-10 gap-y-8 border-t border-slate-200 pt-8 xl:grid-cols-2">
                <div>
                  <h3 className="text-base font-semibold text-navy-950">
                    Tim Pengusul
                  </h3>

                  <div className="mt-2 divide-y divide-slate-100">
                    <div className="py-3">
                      <p className="text-sm text-slate-500">Ketua Pengusul</p>
                      <p className="mt-1 text-base font-medium text-slate-900">
                        {detail?.pengusul?.fullName ||
                          detail?.pengusul?.name ||
                          '—'}
                      </p>
                      <p className="mt-0.5 break-words text-sm text-slate-500">
                        {detail?.pengusul?.email || '—'}
                      </p>
                    </div>

                    {!detail.anggota || detail.anggota.length === 0 ? (
                      <p className="py-3 text-base text-slate-500">
                        Tidak ada anggota tim.
                      </p>
                    ) : (
                      detail.anggota.map((a, idx) => (
                        <div key={idx} className="py-3">
                          <p className="text-base font-medium text-slate-900">
                            {a.user?.fullName || a.user?.name}
                          </p>
                          <p className="mt-0.5 break-words text-sm text-slate-500">
                            {a.user?.email}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-navy-950">
                      Hasil Review
                    </h3>
                    {!detail.review || detail.review.length === 0 ? (
                      <p className="mt-3 text-base text-slate-500">
                        Belum ada hasil review.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {detail.review.map((rv, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-slate-200 p-4"
                          >
                            <p className="text-base font-medium text-slate-900">
                              {rv.reviewer?.fullName ||
                                rv.reviewer?.name ||
                                'Reviewer'}
                            </p>
                            <p
                              className={`mt-0.5 text-sm font-semibold ${
                                REKOMENDASI_COLOR[rv.rekomendasi] ||
                                'text-slate-600'
                              }`}
                            >
                              Rekomendasi:{' '}
                              {rv.rekomendasi
                                ? rv.rekomendasi.charAt(0).toUpperCase() +
                                  rv.rekomendasi.slice(1)
                                : '—'}
                            </p>
                            <p className="mt-3 text-sm text-slate-500">
                              Catatan:
                            </p>
                            <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-slate-700">
                              {rv.catatan || '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-navy-950">
                      Dokumen Lampiran
                    </h3>
                    {!detail.dokumen || detail.dokumen.length === 0 ? (
                      <p className="mt-3 text-base text-slate-500">
                        Belum ada dokumen lampiran.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2.5">
                        {detail.dokumen.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="break-words text-base font-medium text-slate-900">
                                {d.namaFile}
                              </p>
                              {d.ukuran && (
                                <p className="mt-0.5 text-sm text-slate-500">
                                  {(d.ukuran / 1024).toFixed(1)} KB
                                </p>
                              )}
                            </div>

                            <a
                              href={d.url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary btn-sm shrink-0"
                            >
                              Lihat Dokumen
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Footer aksi: menempel di dasar dialog agar tombol simpan selalu terlihat */}
              <footer className="sticky bottom-0 -mx-6 -mb-6 flex flex-col-reverse gap-2.5 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCloseStatusModal}
                  className="btn btn-secondary"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={savingStatus}
                  className="btn btn-primary"
                >
                  {savingStatus ? 'Menyimpan Perubahan...' : 'Simpan Perubahan'}
                </button>
              </footer>
            </form>
          )}
        </Modal>
      )}
    </>
  )
}
