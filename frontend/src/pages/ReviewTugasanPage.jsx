import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LaporanTugasan from './laporan/LaporanTugasan'
import { reviewerApi } from '../api/reviewer'
import { FileText } from 'lucide-react'

// Penugasan Review: daftar tugasan; detail & form penilaian di halaman sendiri
// (/proposals/detail/:id dan /laporan-masuk/detail/:id, pages/review/).

// ── Konstanta ─────────────────────────────────────────────────────────────────

const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

const STATUS_LABEL = {
  draft: 'Draft', diajukan: 'Diajukan', review: 'Review',
  revisi: 'Revisi', disetujui: 'Disetujui', ditolak: 'Ditolak',
}

const STATUS_COLOR = {
  draft: 'badge-neutral',
  diajukan: 'badge-info',
  review: 'badge-review',
  revisi: 'badge-warning',
  disetujui: 'badge-success',
  ditolak: 'badge-danger',
}

const REKOMENDASI_OPTIONS = [
  { value: 'disetujui', label: 'Disetujui' },
  { value: 'revisi', label: 'Perlu Revisi' },
  { value: 'ditolak', label: 'Ditolak' },
]

// ── Komponen kecil ────────────────────────────────────────────────────────────

function Badge({ label, className }) {
  return (
    <span className={`badge ${className}`}>
      {label}
    </span>
  )
}

// ── Kartu Tugasan ─────────────────────────────────────────────────────────────

function TugasanCard({ tugasan: t, onBuka }) {
  const r = t.myReview
  const isDone = r?.isDone === true
  const hasDraft = r && !isDone

  return (
    <article className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {isDone ? (
          <Badge label="Selesai" className="badge-success" />
        ) : hasDraft ? (
          <Badge label="Draft Tersimpan" className="badge-warning" />
        ) : (
          <Badge label="Belum Direview" className="badge-neutral" />
        )}

        <Badge
          label={JENIS_LABEL[t.proposal.jenis] || t.proposal.jenis}
          className="badge-tag"
        />

        <Badge
          label={STATUS_LABEL[t.proposal.status] || t.proposal.status}
          className={STATUS_COLOR[t.proposal.status] || 'badge-neutral'}
        />
      </div>

      <h2 className="mt-3 text-lg font-semibold leading-snug text-navy-950">
        {t.proposal.judul}
      </h2>

      <div className="mt-4 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="text-sm text-slate-500">Pengusul</dt>
            <dd className="mt-0.5 text-base text-slate-800">
              {t.proposal.pengusul?.fullName || t.proposal.pengusul?.name || '—'}
            </dd>
          </div>

          <div>
            <dt className="text-sm text-slate-500">Tanggal Penugasan</dt>
            <dd className="mt-0.5 text-base text-slate-800">
              {new Date(t.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
            </dd>
          </div>

          {isDone && r?.rekomendasi && (
            <div>
              <dt className="text-sm text-slate-500">Rekomendasi Akhir</dt>
              <dd className={`mt-0.5 text-base font-semibold ${r.rekomendasi === 'disetujui'
                ? 'text-green-700'
                : r.rekomendasi === 'ditolak'
                  ? 'text-red-700'
                  : 'text-yellow-700'
                }`}>
                {REKOMENDASI_OPTIONS.find(o => o.value === r.rekomendasi)?.label || r.rekomendasi}
              </dd>
            </div>
          )}
        </dl>

        <button
          onClick={() => onBuka(t)}
          className={`btn shrink-0 ${isDone ? 'btn-secondary' : 'btn-primary'}`}
        >
          {isDone ? 'Lihat Hasil Review' : hasDraft ? 'Lanjutkan Review' : 'Mulai Review'}
        </button>
      </div>
    </article>
  )
}

// ── Halaman Utama ─────────────────────────────────────────────────────────────

export default function ReviewTugasanPage() {
  // ?tab=laporan → tugasan review laporan (GET /laporan/tugasan)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'laporan' ? 'laporan' : 'proposal'
  const [tugasan, setTugasan] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const navigate = useNavigate()
  const limit = 10

  const fetchTugasan = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reviewerApi.getMyTugasan({ page, limit })
      setTugasan(res.data.data || [])
      setTotal(res.data.meta?.total || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchTugasan() }, [fetchTugasan])

  const totalPages = Math.ceil(total / limit)
  const selesai = tugasan.filter(t => t.myReview?.isDone).length
  const belum = tugasan.filter(t => !t.myReview?.isDone).length
  // Ringkasan tab Laporan dilaporkan oleh LaporanTugasan (onRingkasan).
  const [ringkasanLaporan, setRingkasanLaporan] = useState(null)
  const ringkasan = tab === 'laporan' ? ringkasanLaporan : loading ? null : { total, belum, selesai }

  return (
    <div className="page space-y-6">
      <h1 className="page-title">Penugasan Review</h1>

      {/* Ringkasan: teks + 3 kotak angka sejajar dalam satu wadah (tata letak sama dengan Undangan Kerja Sama) */}
      <section className="card flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-base leading-relaxed text-slate-600">
          {tab === 'laporan'
            ? 'Laporan kegiatan yang ditugaskan kepada Anda untuk dinilai. Pilih salah satu untuk membuka detail dan mengisi penilaian.'
            : 'Proposal yang ditugaskan kepada Anda untuk ditinjau, dinilai, dan diselesaikan proses review-nya. Pilih salah satu untuk melihat detail dan melanjutkan penilaian.'}
        </p>
        <dl className="grid shrink-0 grid-cols-3 gap-3 lg:w-[30rem]">
          {[
            { label: 'Total Penugasan', value: ringkasan?.total },
            { label: 'Belum Selesai', value: ringkasan?.belum },
            { label: 'Selesai Direview', value: ringkasan?.selesai },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-medium text-slate-500 sm:text-sm">{k.label}</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{k.value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div role="tablist" aria-label="Jenis tugasan" className="flex gap-7 border-b border-slate-200">
        {[
          ['proposal', 'Proposal'],
          ['laporan', 'Laporan'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'laporan' ? { tab: 'laporan' } : {})}
            className={`-mb-px border-b-2 px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${
              tab === key ? 'border-navy-800 text-navy-950' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-navy-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'laporan' ? (
        <LaporanTugasan onRingkasan={setRingkasanLaporan} />
      ) : (
        <>
      {/* Daftar penugasan */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse p-6">
              <div className="mb-4 h-4 w-40 rounded bg-slate-100" />
              <div className="mb-3 h-6 w-3/4 rounded bg-slate-100" />
              <div className="mb-2 h-4 w-1/2 rounded bg-slate-100" />
              <div className="h-4 w-2/3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : tugasan.length === 0 ? (
        <section className="card flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-navy-50 text-navy-700">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </div>

          <h2 className="text-lg font-semibold text-navy-950">Belum ada penugasan review</h2>
          <p className="mt-2 max-w-lg text-base leading-relaxed text-slate-500">
            Anda akan menerima informasi pada halaman ini saat Ketua LPPM memberikan tugas review proposal kepada Anda.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {tugasan.map(t => (
            <TugasanCard key={t.id} tugasan={t} onBuka={(x) => navigate(`/proposals/detail/${x.proposalId ?? x.proposal?.id}`)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Navigasi halaman penugasan"
        >
          <p className="text-sm text-slate-500">
            Halaman <span className="font-semibold text-navy-950">{page}</span> dari <span className="font-semibold text-navy-950">{totalPages}</span>
          </p>

          <div className="flex gap-2.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-secondary flex-1 sm:flex-none"
            >
              Halaman Sebelumnya
            </button>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn btn-secondary flex-1 sm:flex-none"
            >
              Halaman Selanjutnya
            </button>
          </div>
        </nav>
      )}

        </>
      )}
    </div>
  )
}
