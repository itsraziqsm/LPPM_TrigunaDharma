import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, Trash2, X } from 'lucide-react'
import { alertDialog, confirmDialog } from '../utils/dialog'
import { dokumenHapusApi, pesanGalat } from '../api/dokumenHapus'

// Hapus dokumen (proposal/laporan) oleh Admin di Dokumen Masuk — "hapus dengan izin".
//   draft            → hapus langsung (onDelete: DELETE /proposals/:id | /laporan/:id)
//   sudah diajukan   → permintaan ke Ketua LPPM (W-34): POST /:tipe/:id/deletion-request
//                      { password, alasan }; status menunggu dari GET .../deletion-request
//                      + tombol Batalkan. Ketua menyetujui di PermintaanHapusDokumen.
export default function HapusDokumen({ tipe = 'proposal', id, status, noun = 'dokumen', judul, onDelete, compact = false }) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(undefined) // undefined = memuat, null = tidak ada
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1)
  const isDraft = status === 'draft'

  useEffect(() => {
    if (isDraft || id == null) return undefined
    let alive = true
    dokumenHapusApi
      .pending(tipe, id)
      .then((r) => alive && setPending(r.data.data || null))
      .catch(() => alive && setPending(null))
    return () => {
      alive = false
    }
  }, [tipe, id, isDraft, tick])

  const batalkan = useCallback(async () => {
    const ok = await confirmDialog({
      tone: 'warning',
      title: 'Batalkan permintaan hapus?',
      message: `Permintaan hapus ${noun} "${judul}" ke Ketua LPPM akan dibatalkan.`,
      confirmText: 'Batalkan permintaan',
    })
    if (!ok) return
    setBusy(true)
    try {
      await dokumenHapusApi.cancel(pending.id)
      setTick((t) => t + 1)
    } catch (e) {
      await alertDialog({ title: 'Gagal membatalkan', message: pesanGalat(e, 'Permintaan tidak dapat dibatalkan.') })
    } finally {
      setBusy(false)
    }
  }, [pending, noun, judul])

  if (isDraft) {
    const hapus = async () => {
      const ok = await confirmDialog({
        tone: 'danger',
        title: `Hapus ${noun}?`,
        message: `${Noun} "${judul}" akan dihapus permanen beserta lampirannya.`,
        confirmText: 'Hapus',
      })
      if (!ok) return
      setBusy(true)
      try {
        await onDelete()
      } finally {
        setBusy(false)
      }
    }
    return (
      <button type="button" onClick={hapus} disabled={busy} className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50">
        <Trash2 className="size-4" aria-hidden="true" />
        {busy ? 'Menghapus…' : `Hapus ${noun}`}
      </button>
    )
  }

  if (pending === undefined) {
    return <span className="text-sm text-slate-400">Memeriksa permintaan hapus…</span>
  }

  if (pending) {
    return (
      <span className={`flex flex-wrap items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
          <Clock className="size-4" aria-hidden="true" />
          Menunggu izin Ketua untuk dihapus
        </span>
        <button type="button" onClick={batalkan} disabled={busy} className="btn btn-ghost btn-sm text-slate-600">
          {busy ? 'Membatalkan…' : 'Batalkan'}
        </button>
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${Noun} yang sudah diajukan hanya bisa dihapus dengan izin Ketua LPPM.`}
        className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Ajukan hapus (izin Ketua)
      </button>
      {open ? (
        <AjukanHapusDialog
          tipe={tipe}
          id={id}
          noun={noun}
          judul={judul}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false)
            setTick((t) => t + 1)
          }}
        />
      ) : null}
    </>
  )
}

function AjukanHapusDialog({ tipe, id, noun, judul, onClose, onDone }) {
  const [alasan, setAlasan] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alasanOk = alasan.trim().length >= 5 && alasan.trim().length <= 1000

  const kirim = async (e) => {
    e.preventDefault()
    if (!alasanOk) return setError('Alasan wajib diisi (5–1000 karakter).')
    if (!password) return setError('Masukkan password login Anda.')
    setBusy(true)
    setError('')
    try {
      await dokumenHapusApi.request(tipe, id, { password, alasan: alasan.trim() })
      onDone()
    } catch (err) {
      setError(pesanGalat(err, 'Permintaan hapus gagal dikirim.'))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={kirim} className="dialog max-w-md" role="dialog" aria-modal="true" aria-labelledby="ajukan-hapus-title">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="ajukan-hapus-title" className="text-lg font-semibold text-navy-950">
              Ajukan hapus {noun}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Dihapus setelah disetujui Ketua LPPM.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="Tutup" disabled={busy}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        <div className="space-y-4 px-5 py-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{judul}</span>
            {tipe === 'proposal' ? <span className="block text-xs text-slate-500">Laporan dari proposal ini ikut terhapus.</span> : null}
          </p>
          <div>
            <label htmlFor="hapus-alasan" className="label">
              Alasan
            </label>
            <textarea
              id="hapus-alasan"
              rows={3}
              className="input resize-y"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Mis. proposal duplikat"
              maxLength={1000}
            />
          </div>
          <div>
            <label htmlFor="hapus-password" className="label">
              Password Anda
            </label>
            <input
              id="hapus-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Masukkan password login Anda"
            />
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
          <button type="submit" className="btn btn-danger" disabled={busy}>
            {busy ? 'Mengirim…' : 'Kirim ke Ketua LPPM'}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
