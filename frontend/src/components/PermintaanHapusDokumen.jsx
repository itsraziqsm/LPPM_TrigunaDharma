import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, X } from 'lucide-react'
import { dokumenHapusApi, pesanGalat } from '../api/dokumenHapus'
import { alertDialog } from '../utils/dialog'

// Ketua LPPM: permintaan hapus dokumen dari Admin yang menunggu (W-34).
// GET /dokumen/deletion-request?status=pending[&tipe=] → Setujui (password) / Tolak (catatan).
// Tidak merender apa pun bila tidak ada permintaan. `tipe` kosong = proposal & laporan.
const TIPE_LABEL = { proposal: 'Proposal', laporan: 'Laporan' }
const nama = (u) => u?.fullName || u?.name || '—'
const waktu = (v) => (v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export default function PermintaanHapusDokumen({ tipe, onChanged }) {
  const [items, setItems] = useState([])
  const [tick, setTick] = useState(0)
  const [aksi, setAksi] = useState(null) // { mode: 'approve'|'reject', item }

  useEffect(() => {
    let alive = true
    dokumenHapusApi
      .list({ status: 'pending', ...(tipe ? { tipe } : {}) })
      .then((r) => alive && setItems(r.data.data || []))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [tipe, tick])

  const selesai = useCallback(() => {
    setAksi(null)
    setTick((t) => t + 1)
    onChanged?.()
  }, [onChanged])

  if (items.length === 0) return null

  return (
    <section className="card overflow-hidden border-red-200" aria-labelledby="perm-hapus-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-5 py-3">
        <h2 id="perm-hapus-title" className="flex items-center gap-2 text-base font-semibold text-red-900">
          <Trash2 className="size-[18px]" aria-hidden="true" />
          Permintaan hapus dokumen menunggu persetujuan Anda
        </h2>
        <span className="badge badge-danger">{items.length}</span>
      </header>
      <ul className="divide-y divide-slate-100">
        {items.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="badge badge-plain">{TIPE_LABEL[r.tipe] || r.tipe}</span>
                <span className="font-semibold text-slate-900">{r.judul}</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Alasan: <span className="text-slate-900">{r.alasan}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Pengusul {nama(r.pengusul)} · diminta {nama(r.requester)} · {waktu(r.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setAksi({ mode: 'reject', item: r })} className="btn btn-secondary btn-sm">
                Tolak
              </button>
              <button type="button" onClick={() => setAksi({ mode: 'approve', item: r })} className="btn btn-danger btn-sm">
                Setujui &amp; Hapus
              </button>
            </div>
          </li>
        ))}
      </ul>
      {aksi ? <KeputusanDialog {...aksi} onClose={() => setAksi(null)} onDone={selesai} /> : null}
    </section>
  )
}

function KeputusanDialog({ mode, item, onClose, onDone }) {
  const approve = mode === 'approve'
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const kirim = async (e) => {
    e.preventDefault()
    if (approve && !value) return setError('Masukkan password login Anda.')
    setBusy(true)
    setError('')
    try {
      if (approve) await dokumenHapusApi.approve(item.id, value)
      else await dokumenHapusApi.cancel(item.id, value.trim() || undefined)
      onDone()
    } catch (err) {
      const msg = pesanGalat(err, approve ? 'Persetujuan gagal.' : 'Penolakan gagal.')
      if (err.response?.status === 409) {
        onDone()
        alertDialog({ title: 'Permintaan sudah diproses', message: msg })
      } else setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={kirim} className="dialog max-w-md" role="dialog" aria-modal="true" aria-labelledby="keputusan-hapus-title">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="keputusan-hapus-title" className="text-lg font-semibold text-navy-950">
              {approve ? 'Setujui & hapus dokumen' : 'Tolak permintaan hapus'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{item.judul}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Tutup" disabled={busy}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        <div className="space-y-3 px-5 py-4">
          {approve ? (
            <p className="text-sm text-slate-600">
              {item.tipe === 'proposal'
                ? 'Proposal dihapus permanen beserta laporannya dan semua relasinya. Tindakan ini tidak dapat dibatalkan.'
                : 'Laporan dihapus permanen. Tindakan ini tidak dapat dibatalkan.'}
            </p>
          ) : null}
          <div>
            <label htmlFor="keputusan-input" className="label">
              {approve ? 'Password Anda' : 'Catatan untuk Admin (opsional)'}
            </label>
            {approve ? (
              <input
                id="keputusan-input"
                type="password"
                className="input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="current-password"
                placeholder="Masukkan password login Anda"
              />
            ) : (
              <textarea id="keputusan-input" rows={3} className="input resize-y" value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={busy}>
            Batal
          </button>
          <button type="submit" className={`btn ${approve ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? 'Memproses…' : approve ? 'Setujui & Hapus' : 'Tolak permintaan'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
