import { useState } from 'react'
import { Download } from 'lucide-react'
import { laporanApi } from '../../api/laporan'
import UserAvatar from '../../components/UserAvatar'
import { KOMPONEN, angkaId, hitungSkor, kelayakan, labelRekomendasi, petaSkor, rupiahId } from '../../utils/rubrikReview'
import { STATUS_COLOR, STATUS_LABEL } from '../ProposalDosen/constants'

// Blok tampilan bersama untuk halaman laporan (dosen, Ketua/Admin, reviewer).

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_COLOR[status] || 'badge-neutral'}`}>{STATUS_LABEL[status] || status || '—'}</span>
}

export function InfoTable({ rows }) {
  return (
    <dl className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm font-medium text-slate-600">{label}</dt>
          <dd className="min-w-0 whitespace-pre-line break-words text-sm text-slate-900">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Message({ msg }) {
  if (!msg) return null
  const tone =
    msg.type === 'success'
      ? 'border-green-200 bg-green-50 text-green-800'
      : msg.type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-red-200 bg-red-50 text-red-700'
  return (
    <div role={msg.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      {msg.text}
    </div>
  )
}

// Tombol unduh/buka file laporan (GET /laporan/:id/dokumen, blob) atau tautan URL.
export function DokumenLaporan({ laporan }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (laporan.dokumenNama) {
    const open = async () => {
      setBusy(true)
      setError('')
      try {
        const res = await laporanApi.downloadDokumen(laporan.id)
        const url = URL.createObjectURL(res.data)
        window.open(url, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      } catch {
        setError('Dokumen gagal diunduh.')
      } finally {
        setBusy(false)
      }
    }
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={open} disabled={busy} className="btn btn-secondary btn-sm">
          <Download className="size-4" aria-hidden="true" />
          {busy ? 'Membuka…' : laporan.dokumenNama}
        </button>
        {error ? <span className="text-xs text-red-700">{error}</span> : null}
      </span>
    )
  }
  if (laporan.dokumenUrl) {
    return (
      <a href={laporan.dokumenUrl} target="_blank" rel="noreferrer" className="break-all font-semibold text-navy-700 hover:text-navy-900">
        {laporan.dokumenUrl}
      </a>
    )
  }
  return <span className="text-slate-500">Belum ada dokumen</span>
}

// Daftar review (dari GET /laporan/:id → reviews). `onlyDone` untuk pengusul.
// Hasil review (Ketua, pengusul, anggota): skor rubrik + rata-rata & kelayakan, rekomendasi, dana disetujui (proposal),
// catatan (W-54). Review lama tanpa skor tetap menampilkan nilai teks lama (nilaiRelevansi/…).
export function ReviewList({ reviews, onlyDone = false }) {
  const list = (reviews || []).filter((r) => !onlyDone || r.isDone)
  if (list.length === 0) return <p className="text-sm text-slate-500">Belum ada hasil review.</p>
  return (
    <ul className="space-y-3">
      {list.map((r) => {
        const skor = Array.isArray(r.skor) ? r.skor : []
        const rata = r.rataSkor != null ? Math.round(Number(r.rataSkor) * 10) / 10 : hitungSkor(petaSkor(r)).rata
        const layak = kelayakan(rata)
        const lama = [
          ['Relevansi', r.nilaiRelevansi],
          ['Metodologi', r.nilaiMetodologi],
          ['Anggaran', r.nilaiAnggaran],
          ['Luaran', r.nilaiLuaran],
        ].filter(([, v]) => v)
        return (
          <li key={r.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-slate-900"><UserAvatar user={r.reviewer || { id: r.reviewerId }} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />{r.reviewer?.fullName || r.reviewer?.name || 'Reviewer'}</p>
              <span className={`badge ${r.isDone ? 'badge-success' : 'badge-warning'}`}>{r.isDone ? 'Selesai' : 'Draft review'}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {rata != null ? (
                <span className="flex items-baseline gap-1.5">
                  <span className="font-serif text-2xl text-navy-950">{angkaId(rata)}</span>
                  <span className="text-slate-500">rata-rata{r.totalSkor != null ? ` · total ${r.totalSkor}` : ''}</span>
                </span>
              ) : null}
              {layak ? <span className={`badge ${layak.tone === 'success' ? 'badge-success' : layak.tone === 'danger' ? 'badge-danger' : 'badge-warning'}`}>{layak.label}</span> : null}
              {r.rekomendasi ? (
                <span className="text-slate-600">
                  Rekomendasi: <span className="font-medium text-navy-900">{labelRekomendasi(r.rekomendasi)}</span>
                </span>
              ) : null}
              {r.danaDisetujui != null ? (
                <span className="text-slate-600">
                  Dana disetujui: <span className="font-medium text-navy-900">{rupiahId(r.danaDisetujui)}</span>
                </span>
              ) : null}
            </div>
            {skor.length ? (
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
                {KOMPONEN.map((k) => {
                  const x = skor.find((y) => y.kode === k.kode)
                  return (
                    <div key={k.kode} className="flex items-start justify-between gap-3">
                      <dt className="min-w-0 text-slate-600">
                        {k.label}
                        {x?.catatan ? <span className="block text-xs text-slate-400">{x.catatan}</span> : null}
                      </dt>
                      <dd className="shrink-0 font-semibold tabular-nums text-navy-950">{x ? x.skor : '—'}</dd>
                    </div>
                  )
                })}
              </dl>
            ) : lama.length ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {lama.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-slate-500">{k}</dt>
                    <dd className="text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {r.catatan ? <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-sm text-slate-700">{r.catatan}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}
