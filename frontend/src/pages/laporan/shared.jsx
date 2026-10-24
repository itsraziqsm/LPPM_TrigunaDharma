import { useState } from 'react'
import { Download } from 'lucide-react'
import { laporanApi } from '../../api/laporan'
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
export function ReviewList({ reviews, onlyDone = false }) {
  const list = (reviews || []).filter((r) => !onlyDone || r.isDone)
  if (list.length === 0) return <p className="text-sm text-slate-500">Belum ada hasil review.</p>
  return (
    <ul className="space-y-3">
      {list.map((r) => (
        <li key={r.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">{r.reviewer?.fullName || r.reviewer?.name || 'Reviewer'}</p>
            <span className={`badge ${r.isDone ? 'badge-success' : 'badge-warning'}`}>{r.isDone ? 'Selesai' : 'Draft review'}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {[
              ['Relevansi', r.nilaiRelevansi],
              ['Metodologi', r.nilaiMetodologi],
              ['Anggaran', r.nilaiAnggaran],
              ['Luaran', r.nilaiLuaran],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-slate-900">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {r.rekomendasi ? (
            <p className="mt-2 text-sm">
              Rekomendasi: <StatusBadge status={r.rekomendasi} />
            </p>
          ) : null}
          {r.catatan ? <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.catatan}</p> : null}
        </li>
      ))}
    </ul>
  )
}
