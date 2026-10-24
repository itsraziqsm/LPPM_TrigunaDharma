import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { laporanApi } from '../../api/laporan'
import { JENIS_LABEL } from '../ProposalDosen/constants'
import { DokumenLaporan, InfoTable, Message, StatusBadge } from './shared'
import LuaranCapaian from './LuaranCapaian'
import { rupiah, tanggal } from './format'
import { confirmDialog } from '../../utils/dialog'

// Tugasan review LAPORAN untuk reviewer (GET /laporan/tugasan) beserta form
// penilaian (POST /laporan/:id/reviews, /finalize). Dipakai sebagai tab
// "Laporan" di halaman Penugasan Review.

const NILAI = [
  ['nilaiRelevansi', 'Relevansi'],
  ['nilaiMetodologi', 'Metodologi'],
  ['nilaiAnggaran', 'Anggaran'],
  ['nilaiLuaran', 'Luaran'],
]

function errorText(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}

function ReviewLaporanModal({ tugasan, onClose, onUpdated }) {
  const [laporan, setLaporan] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  const r = tugasan.myReview
  const [form, setForm] = useState({
    nilaiRelevansi: r?.nilaiRelevansi ?? '',
    nilaiMetodologi: r?.nilaiMetodologi ?? '',
    nilaiAnggaran: r?.nilaiAnggaran ?? '',
    nilaiLuaran: r?.nilaiLuaran ?? '',
    catatan: r?.catatan ?? '',
    rekomendasi: r?.rekomendasi ?? '',
  })
  const [done, setDone] = useState(r?.isDone === true)

  useEffect(() => {
    laporanApi
      .getById(tugasan.laporanId)
      .then((res) => setLaporan(res.data.data))
      .catch((e) => setMsg({ type: 'error', text: errorText(e, 'Laporan gagal dimuat.') }))
  }, [tugasan.laporanId])

  const isReview = (laporan?.status || tugasan.laporan?.status) === 'review'
  const locked = done || !isReview
  const payload = () =>
    Object.fromEntries(
      Object.entries(form)
        .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
        .filter(([, v]) => v !== ''),
    )

  const save = async (finalize) => {
    if (finalize && !(await confirmDialog({ title: 'Selesaikan review laporan?', message: 'Nilai tidak dapat diubah lagi setelah review diselesaikan.', confirmText: 'Ya, selesaikan' }))) return
    setBusy(finalize ? 'final' : 'save')
    setMsg(null)
    try {
      await laporanApi.submitReview(tugasan.laporanId, payload())
      if (finalize) {
        await laporanApi.finalizeReview(tugasan.laporanId)
        setDone(true)
      }
      setMsg({ type: 'success', text: finalize ? 'Review laporan diselesaikan.' : 'Penilaian disimpan.' })
      onUpdated()
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Gagal menyimpan review.') })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label="Review laporan" className="dialog flex max-h-full max-w-4xl flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              Review laporan {JENIS_LABEL[tugasan.laporan?.jenis] || ''} <StatusBadge status={laporan?.status || tugasan.laporan?.status} />
            </p>
            <h2 className="mt-1 break-words text-lg font-semibold text-navy-950">{tugasan.laporan?.judul}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Tutup">
            <X className="size-[18px]" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5" data-lenis-prevent>
          <Message msg={msg} />
          {laporan ? (
            <InfoTable
              rows={[
                ['Pengusul', laporan.pengusul?.fullName || laporan.pengusul?.name],
                ['Periode', laporan.periode?.nama],
                ['Abstrak', laporan.abstrak],
                ['Target luaran', laporan.luaran || '—'],
                ['Luaran tercapai', laporan.luaranTercapai || '—'],
                ['Ringkasan hasil', laporan.ringkasanHasil || '—'],
                ['Anggaran / realisasi', `${rupiah(laporan.anggaran)} / ${rupiah(laporan.realisasiAnggaran)}`],
                ['Dokumen', <DokumenLaporan key="d" laporan={laporan} />],
              ]}
            />
          ) : (
            <span className="spinner mx-auto block text-navy-600" aria-hidden="true" />
          )}

          {laporan ? (
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">Capaian luaran</h3>
              <LuaranCapaian proposalId={laporan.proposalId} />
            </section>
          ) : null}

          <section className="space-y-4">
            <h3 className="text-base font-semibold text-navy-950">Penilaian</h3>
            {!isReview && !done ? (
              <p className="text-sm text-amber-700">Laporan tidak sedang dalam tahap review, penilaian tidak dapat diubah.</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-4">
              {NILAI.map(([k, l]) => (
                <div key={k}>
                  <label htmlFor={`rl-${k}`} className="label">
                    {l}
                  </label>
                  <input
                    id={`rl-${k}`}
                    className="input"
                    value={form[k]}
                    disabled={locked}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    placeholder="0–100"
                  />
                </div>
              ))}
            </div>
            <div>
              <label htmlFor="rl-rekomendasi" className="label">
                Rekomendasi
              </label>
              <select
                id="rl-rekomendasi"
                className="input sm:max-w-xs"
                value={form.rekomendasi}
                disabled={locked}
                onChange={(e) => setForm((f) => ({ ...f, rekomendasi: e.target.value }))}
              >
                <option value="">-- Pilih --</option>
                <option value="disetujui">Disetujui</option>
                <option value="revisi">Revisi</option>
                <option value="ditolak">Ditolak</option>
              </select>
            </div>
            <div>
              <label htmlFor="rl-catatan" className="label">
                Catatan
              </label>
              <textarea
                id="rl-catatan"
                rows={4}
                className="input resize-y"
                value={form.catatan}
                disabled={locked}
                onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
              />
            </div>
            {done ? (
              <p className="text-sm font-semibold text-green-700">Review ini sudah diselesaikan.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary" disabled={locked || Boolean(busy)} onClick={() => save(false)}>
                  {busy === 'save' ? 'Menyimpan…' : 'Simpan penilaian'}
                </button>
                <button type="button" className="btn btn-primary" disabled={locked || Boolean(busy)} onClick={() => save(true)}>
                  {busy === 'final' ? 'Menyelesaikan…' : 'Simpan & selesaikan'}
                </button>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}

export default function LaporanTugasan() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState(null)
  const [tick, setTick] = useState(0)
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
  }, [page, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const pages = Math.max(1, Math.ceil(total / limit))

  // Spinner hanya saat pemuatan pertama; muat ulang (setelah menilai) tidak
  // mengganti tampilan supaya modal penilaian tetap terbuka.
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
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSelected(t)}>
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
      {selected ? <ReviewLaporanModal tugasan={selected} onClose={() => setSelected(null)} onUpdated={refresh} /> : null}
    </div>
  )
}
