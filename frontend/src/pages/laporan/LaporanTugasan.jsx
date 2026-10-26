import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { laporanApi } from '../../api/laporan'
import { JENIS_LABEL } from '../ProposalDosen/constants'
import { StatusBadge } from './shared'
import { tanggal } from './format'

// Tugasan review LAPORAN untuk reviewer (GET /laporan/tugasan). Dipakai sebagai tab
// "Laporan" di halaman Penugasan Review; penilaian di halaman detail
// /laporan-masuk/detail/:id (pages/review/ReviewLaporanPage.jsx).

export default function LaporanTugasan() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const navigate = useNavigate()
  const limit = 10

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    laporanApi
      .getTugasan({ page, limit })
      .then((r) => {
        if (!alive) return
        setRows(r.data.data || [])
        setTotal(Number(r.data.meta?.total) || 0)
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [page])

  const pages = Math.max(1, Math.ceil(total / limit))

  if (loading && rows.length === 0) return <div className="card px-6 py-10 text-center"><span className="spinner mx-auto text-navy-600" aria-hidden="true" /></div>
  if (failed && rows.length === 0) return <div className="card px-6 py-10 text-center text-slate-600">Tugasan laporan gagal dimuat.</div>
  if (rows.length === 0) {
    return (
      <section className="card px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-navy-950">Belum ada tugasan review laporan</h2>
        <p className="mx-auto mt-2 max-w-lg text-base text-slate-500">Laporan yang ditugaskan Ketua LPPM untuk Anda review akan muncul di sini.</p>
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((t) => (
          <li key={t.id} className="card flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                {JENIS_LABEL[t.laporan?.jenis] || 'Laporan'} · ditugaskan {tanggal(t.createdAt)} <StatusBadge status={t.laporan?.status} />
              </p>
              <p className="mt-1 font-semibold text-slate-900">{t.laporan?.judul}</p>
              <p className="text-sm text-slate-500">Pengusul: {t.laporan?.pengusul?.name || '—'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`badge ${t.myReview?.isDone ? 'badge-success' : t.myReview ? 'badge-warning' : 'badge-neutral'}`}>
                {t.myReview?.isDone ? 'Selesai' : t.myReview ? 'Draft' : 'Belum dinilai'}
              </span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/laporan-masuk/detail/${t.laporanId ?? t.laporan?.id}`)}>
                {t.myReview?.isDone ? 'Lihat' : 'Nilai'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {total > limit ? (
        <nav aria-label="Halaman tugasan laporan" className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Halaman {page} dari {pages}
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
  )
}
