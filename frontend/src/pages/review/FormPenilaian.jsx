import { useState } from 'react'
import { Check } from 'lucide-react'
import { confirmDialog } from '../../utils/dialog'

// Form penilaian reviewer (proposal & laporan) — nilai bertipe teks (TEXT di backend),
// rekomendasi disetujui|revisi|ditolak, catatan. onSave(payload) = simpan draft;
// onFinalize(payload) = simpan lalu finalisasi. `locked` = tidak bisa diubah (mis. bukan
// tahap review); `done` = review sudah final → mode baca.

const REKOMENDASI_OPTIONS = [
  { value: 'disetujui', label: 'Disetujui' },
  { value: 'revisi', label: 'Perlu Revisi' },
  { value: 'ditolak', label: 'Ditolak' },
]

const NILAI = [
  ['nilaiRelevansi', 'Relevansi'],
  ['nilaiMetodologi', 'Metodologi'],
  ['nilaiAnggaran', 'Anggaran'],
  ['nilaiLuaran', 'Luaran'],
]

const rekomendasiClass = (v) => (v === 'disetujui' ? 'badge-success' : v === 'ditolak' ? 'badge-danger' : 'badge-warning')

export default function FormPenilaian({ review, done, locked = false, lockedNote, noun = 'proposal', onSave, onFinalize }) {
  const [form, setForm] = useState({
    nilaiRelevansi: review?.nilaiRelevansi ?? '',
    nilaiMetodologi: review?.nilaiMetodologi ?? '',
    nilaiAnggaran: review?.nilaiAnggaran ?? '',
    nilaiLuaran: review?.nilaiLuaran ?? '',
    catatan: review?.catatan ?? '',
    rekomendasi: review?.rekomendasi ?? '',
  })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const payload = () =>
    Object.fromEntries(
      Object.entries(form)
        .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
        .filter(([, v]) => v !== ''),
    )

  const jalankan = async (final) => {
    if (final && !(await confirmDialog({ title: `Selesaikan review ${noun}?`, message: 'Penilaian tidak dapat diubah lagi setelah review diselesaikan.', confirmText: 'Ya, selesaikan' }))) return
    setBusy(final ? 'final' : 'save')
    setMsg(null)
    try {
      await (final ? onFinalize(payload()) : onSave(payload()))
      setMsg({ ok: true, text: final ? 'Review telah diselesaikan.' : 'Penilaian disimpan.' })
    } catch (e) {
      const errs = e.response?.data?.errors
      setMsg({ ok: false, text: errs ? Object.values(errs).flat().join(' ') : e.response?.data?.message || 'Gagal menyimpan penilaian.' })
    } finally {
      setBusy('')
    }
  }

  if (done) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3.5">
          <Check className="mt-0.5 size-5 shrink-0 text-green-700" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold text-green-800">Review telah diselesaikan</p>
            <p className="mt-0.5 text-sm text-green-800">Hasil penilaian ditampilkan dalam mode baca.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {NILAI.filter(([k]) => review?.[k]).map(([k, l]) => (
            <div key={k} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-sm font-semibold text-navy-950">{l}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{review[k]}</p>
            </div>
          ))}
        </div>
        {review?.rekomendasi ? (
          <p className="flex items-center gap-2.5 text-sm text-slate-500">
            Rekomendasi
            <span className={`badge ${rekomendasiClass(review.rekomendasi)}`}>
              {REKOMENDASI_OPTIONS.find((o) => o.value === review.rekomendasi)?.label || review.rekomendasi}
            </span>
          </p>
        ) : null}
        {review?.catatan ? (
          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-800">Catatan</p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{review.catatan}</p>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {locked && lockedNote ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{lockedNote}</p> : null}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {NILAI.map(([k, l]) => (
          <div key={k}>
            <label htmlFor={`fp-${k}`} className="label">
              {l}
            </label>
            <textarea
              id={`fp-${k}`}
              rows={4}
              className="input resize-y leading-relaxed"
              value={form[k]}
              disabled={locked}
              onChange={set(k)}
              placeholder={`Uraikan penilaian ${l.toLowerCase()}…`}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <label htmlFor="fp-rekomendasi" className="label">
            Rekomendasi
          </label>
          <select id="fp-rekomendasi" className="input" value={form.rekomendasi} disabled={locked} onChange={set('rekomendasi')}>
            <option value="">-- Pilih rekomendasi --</option>
            {REKOMENDASI_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-sm text-slate-500">Hasil akhir yang paling sesuai dengan keseluruhan penilaian.</p>
        </div>
        <div>
          <label htmlFor="fp-catatan" className="label">
            Catatan
          </label>
          <textarea
            id="fp-catatan"
            rows={5}
            className="input resize-y leading-relaxed"
            value={form.catatan}
            disabled={locked}
            onChange={set('catatan')}
            placeholder="Catatan untuk pengusul (opsional)…"
          />
        </div>
      </div>
      {msg ? (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-3.5 py-2.5 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {msg.text}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">Simpan draft untuk melanjutkan nanti, atau selesaikan bila penilaian sudah final.</p>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:shrink-0">
          <button type="button" className="btn btn-secondary" disabled={locked || Boolean(busy)} onClick={() => jalankan(false)}>
            {busy === 'save' ? 'Menyimpan…' : 'Simpan draft penilaian'}
          </button>
          <button type="button" className="btn btn-primary" disabled={locked || Boolean(busy)} onClick={() => jalankan(true)}>
            {busy === 'final' ? 'Memproses…' : 'Selesaikan review'}
          </button>
        </div>
      </div>
    </div>
  )
}
