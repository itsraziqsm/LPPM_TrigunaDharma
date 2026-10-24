import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import LaporanTugasan from './laporan/LaporanTugasan'
import { reviewerApi } from '../api/reviewer'
import { proposalApi } from '../api/proposal'
import { Check, FileText, X } from 'lucide-react'

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

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay">
      <section
        aria-modal="true"
        role="dialog"
        aria-label={title}
        className={`dialog flex max-h-full flex-col ${wide ? 'max-w-4xl' : 'max-w-xl'}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-3">
          <h3 className="line-clamp-2 min-w-0 text-lg font-semibold leading-snug text-navy-950">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            title="Tutup"
            className="icon-btn"
          >
            <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        {/* Penggulir tanpa padding agar footer lengket menempel di dasar dialog */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-6">{children}</div>
        </div>
      </section>
    </div>
  )
}

function NilaiInput({ label, value, onChange, disabled }) {
  const id = `rv-nilai-${label.toLowerCase()}`
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder={`Uraikan penilaian ${label.toLowerCase()}...`}
        className="input resize-none leading-relaxed"
      />
    </div>
  )
}

function NilaiText({ label, nilai }) {
  if (!nilai) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-sm font-semibold text-navy-950">{label}</p>
      <p className="mt-1.5 text-base leading-relaxed whitespace-pre-wrap text-slate-700">{nilai}</p>
    </div>
  )
}

// ── Modal Review ──────────────────────────────────────────────────────────────

function ReviewModal({ tugasan, onClose, onUpdated }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [msg, setMsg] = useState({ text: '', ok: false })

  const r = tugasan.myReview
  const isDone = r?.isDone === true

  const [form, setForm] = useState({
    nilaiRelevansi: r?.nilaiRelevansi ?? '',
    nilaiMetodologi: r?.nilaiMetodologi ?? '',
    nilaiAnggaran: r?.nilaiAnggaran ?? '',
    nilaiLuaran: r?.nilaiLuaran ?? '',
    catatan: r?.catatan ?? '',
    rekomendasi: r?.rekomendasi ?? '',
  })

  useEffect(() => {
    proposalApi.getById(tugasan.proposalId)
      .then(res => setDetail(res.data.data))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [tugasan.proposalId])

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setMsg({ text: '', ok: false })
    try {
      const payload = {
        ...(form.nilaiRelevansi?.trim() && { nilaiRelevansi: form.nilaiRelevansi.trim() }),
        ...(form.nilaiMetodologi?.trim() && { nilaiMetodologi: form.nilaiMetodologi.trim() }),
        ...(form.nilaiAnggaran?.trim() && { nilaiAnggaran: form.nilaiAnggaran.trim() }),
        ...(form.nilaiLuaran?.trim() && { nilaiLuaran: form.nilaiLuaran.trim() }),
        ...(form.catatan && { catatan: form.catatan }),
        ...(form.rekomendasi && { rekomendasi: form.rekomendasi }),
      }
      await reviewerApi.submitReview(tugasan.proposalId, payload)
      setMsg({ text: 'Penilaian disimpan.', ok: true })
      onUpdated()
    } catch (e) {
      setMsg({ text: e.response?.data?.message || 'Gagal menyimpan.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!confirm('Tandai review ini sebagai selesai? Tindakan ini tidak dapat dibatalkan.')) return
    setFinalizing(true)
    setMsg({ text: '', ok: false })
    try {
      const payload = {
        ...(form.nilaiRelevansi?.trim() && { nilaiRelevansi: form.nilaiRelevansi.trim() }),
        ...(form.nilaiMetodologi?.trim() && { nilaiMetodologi: form.nilaiMetodologi.trim() }),
        ...(form.nilaiAnggaran?.trim() && { nilaiAnggaran: form.nilaiAnggaran.trim() }),
        ...(form.nilaiLuaran?.trim() && { nilaiLuaran: form.nilaiLuaran.trim() }),
        ...(form.catatan && { catatan: form.catatan }),
        ...(form.rekomendasi && { rekomendasi: form.rekomendasi }),
      }
      await reviewerApi.submitReview(tugasan.proposalId, payload)
      await reviewerApi.finalizeReview(tugasan.proposalId)
      setMsg({ text: 'Review telah diselesaikan.', ok: true })
      onUpdated()
      setTimeout(onClose, 1200)
    } catch (e) {
      setMsg({ text: e.response?.data?.message || 'Gagal finalisasi.', ok: false })
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <Modal title="Form Penilaian Proposal" onClose={onClose} wide>
      {loading ? (
        <p className="flex items-center justify-center gap-3 py-16 text-base text-slate-500">
          <span className="spinner text-navy-600" aria-hidden="true" />
          Memuat data proposal...
        </p>
      ) : (
        <div className="space-y-6">
          {/* Ringkasan proposal */}
          <section>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">Informasi proposal</p>
                <h2 className="mt-1.5 font-serif text-2xl font-medium leading-snug text-navy-950">
                  {detail?.judul || `Proposal #${tugasan.proposalId}`}
                </h2>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge
                    label={JENIS_LABEL[detail?.jenis] || detail?.jenis || '—'}
                    className="badge-tag"
                  />
                  <Badge
                    label={STATUS_LABEL[detail?.status] || detail?.status || '—'}
                    className={STATUS_COLOR[detail?.status] || 'badge-neutral'}
                  />
                  {isDone ? (
                    <Badge label="Review Selesai" className="badge-success" />
                  ) : (
                    <Badge label="Masih Dalam Proses" className="badge-warning" />
                  )}
                </div>
              </div>

              <dl className="grid shrink-0 gap-4 sm:grid-cols-2 lg:w-60 lg:grid-cols-1 lg:border-l lg:border-slate-200 lg:pl-6">
                <div>
                  <dt className="text-sm text-slate-500">Pengusul</dt>
                  <dd className="mt-0.5 text-base font-medium text-slate-800">
                    {detail?.pengusul?.fullName || detail?.pengusul?.name || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">ID Proposal</dt>
                  <dd className="mt-0.5 text-base font-medium text-slate-800">#{tugasan.proposalId}</dd>
                </div>
              </dl>
            </div>

            {detail?.abstrak && (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-navy-950">Abstrak Singkat</p>
                <p className="mt-1.5 text-base leading-relaxed whitespace-pre-wrap text-slate-700">
                  {detail.abstrak}
                </p>
              </div>
            )}
          </section>

          {isDone ? (
            <section className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3.5">
                <Check className="mt-0.5 size-5 shrink-0 text-green-700" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-green-800">Review telah diselesaikan</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-green-800">
                    Seluruh hasil penilaian ditampilkan dalam mode baca.
                  </p>
                </div>
              </div>

              {/* Hasil evaluasi */}
              <div className="grid grid-cols-1 gap-4 empty:hidden md:grid-cols-2">
                <NilaiText label="Relevansi" nilai={r?.nilaiRelevansi} />
                <NilaiText label="Metodologi" nilai={r?.nilaiMetodologi} />
                <NilaiText label="Anggaran" nilai={r?.nilaiAnggaran} />
                <NilaiText label="Luaran" nilai={r?.nilaiLuaran} />
              </div>

              {(r?.rekomendasi || r?.catatan) && (
                <section className="rounded-xl border border-slate-200 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-navy-950">Ringkasan Keputusan</h4>

                    {r?.rekomendasi && (
                      <p className="flex items-center gap-2.5 text-sm text-slate-500">
                        Rekomendasi Reviewer
                        <span className={`badge ${r.rekomendasi === 'disetujui'
                          ? 'badge-success'
                          : r.rekomendasi === 'ditolak'
                            ? 'badge-danger'
                            : 'badge-warning'
                          }`}>
                          {REKOMENDASI_OPTIONS.find(o => o.value === r.rekomendasi)?.label || r.rekomendasi}
                        </span>
                      </p>
                    )}
                  </div>

                  {r?.catatan && (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <p className="text-sm font-semibold text-slate-800">Catatan Reviewer</p>
                      <p className="mt-1.5 text-base leading-relaxed whitespace-pre-wrap text-slate-700">{r.catatan}</p>
                    </div>
                  )}
                </section>
              )}
            </section>
          ) : (
            <>
              <section className="space-y-6">
                <header>
                  <h3 className="text-lg font-semibold text-navy-950">Isi penilaian setiap aspek proposal</h3>
                  <p className="mt-1 text-base text-slate-500">
                    Tulis penilaian secara jelas, sistematis, dan mudah dipahami oleh pengusul maupun pengelola.
                  </p>
                </header>

                {/* Area input penilaian */}
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <NilaiInput label="Relevansi" value={form.nilaiRelevansi} onChange={set('nilaiRelevansi')} />
                  <NilaiInput label="Metodologi" value={form.nilaiMetodologi} onChange={set('nilaiMetodologi')} />
                  <NilaiInput label="Anggaran" value={form.nilaiAnggaran} onChange={set('nilaiAnggaran')} />
                  <NilaiInput label="Luaran" value={form.nilaiLuaran} onChange={set('nilaiLuaran')} />
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <div>
                    <label htmlFor="rv-rekomendasi" className="label">Rekomendasi</label>
                    <select
                      id="rv-rekomendasi"
                      value={form.rekomendasi}
                      onChange={e => set('rekomendasi')(e.target.value)}
                      className="input"
                    >
                      <option value="">-- Pilih Rekomendasi --</option>
                      {REKOMENDASI_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-sm text-slate-500">
                      Pilih hasil akhir yang paling sesuai dengan keseluruhan penilaian.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="rv-catatan" className="label">Catatan</label>
                    <textarea
                      id="rv-catatan"
                      value={form.catatan}
                      onChange={e => set('catatan')(e.target.value)}
                      rows={5}
                      placeholder="Catatan untuk pengusul (opsional)..."
                      className="input resize-none leading-relaxed"
                    />
                    <p className="mt-1.5 text-sm text-slate-500">
                      Gunakan catatan untuk penjelasan tambahan, arahan revisi, atau penekanan evaluasi.
                    </p>
                  </div>
                </div>
              </section>

              {/* Area aksi: lengket di dasar dialog; pesan hasil ikut tampil di sini agar selalu terlihat */}
              <footer className="sticky bottom-0 -mx-6 -mb-6 border-t border-slate-200 bg-white px-6 py-4">
                {msg.text && (
                  <div
                    role={msg.ok ? 'status' : 'alert'}
                    className={`mb-3 rounded-lg border px-3.5 py-2.5 text-sm ${msg.ok
                      ? 'border-green-200 bg-green-50 text-green-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                  >
                    {msg.text}
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="hidden max-w-sm text-sm text-slate-500 sm:block">
                    Simpan draft untuk melanjutkan nanti, atau selesaikan review jika penilaian sudah final.
                  </p>

                  <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:shrink-0">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="btn btn-secondary"
                    >
                      {saving ? 'Menyimpan...' : 'Simpan Draft Penilaian'}
                    </button>

                    <button
                      onClick={handleFinalize}
                      disabled={finalizing || saving}
                      className="btn btn-primary"
                    >
                      {finalizing ? 'Memproses...' : 'Selesaikan Review'}
                    </button>
                  </div>
                </div>
              </footer>
            </>
          )}
        </div>
      )}
    </Modal>
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
  const [selectedTugasan, setSelectedTugasan] = useState(null)
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

  return (
    <div className="page space-y-6">
      {/* Header halaman */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="page-title">Penugasan Review</h1>
          <p className="page-desc">
            Proposal yang ditugaskan kepada Anda untuk ditinjau, dinilai, dan diselesaikan proses review-nya.
            Pilih salah satu untuk melihat detail dan melanjutkan penilaian.
          </p>
        </div>

        {/* Ringkasan */}
        {tab === 'proposal' && !loading && tugasan.length > 0 && (
          <dl className="grid shrink-0 grid-cols-3 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-10">
            <div>
              <dt className="text-sm text-slate-500">Total Penugasan</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{total}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Belum Selesai</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{belum}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Selesai Direview</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{selesai}</dd>
            </div>
          </dl>
        )}
      </header>

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
        <LaporanTugasan />
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
            <TugasanCard key={t.id} tugasan={t} onBuka={setSelectedTugasan} />
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

      {/* Modal review */}
      {selectedTugasan && (
        <ReviewModal
          tugasan={selectedTugasan}
          onClose={() => setSelectedTugasan(null)}
          onUpdated={fetchTugasan}
        />
      )}
        </>
      )}
    </div>
  )
}
