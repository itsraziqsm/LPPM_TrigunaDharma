import { useCallback, useEffect, useState } from 'react'
import { Download, Pencil } from 'lucide-react'
import { LUARAN_JENIS, luaranApi } from '../../api/luaran'
import { hari } from './format'

// Daftar item luaran proposal (GET /luaran/proposal/:proposalId) beserta
// capaiannya. `editable` = pengusul mengisi capaian (PATCH /luaran/:id/capaian
// + POST /luaran/:id/bukti) — hanya saat proposal disetujui dan laporan belum
// diajukan (draft/revisi). Selain itu tampil baca saja.

const BUKTI_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]

function errorText(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}

function Bukti({ item }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try {
      const res = await luaranApi.downloadBukti(item.id)
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {item.buktiNama ? (
        <button type="button" onClick={open} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-navy-700 hover:text-navy-900">
          <Download className="size-3.5" aria-hidden="true" />
          {busy ? 'Membuka…' : item.buktiNama}
        </button>
      ) : null}
      {item.buktiUrl ? (
        <a href={item.buktiUrl} target="_blank" rel="noreferrer" className="break-all font-semibold text-navy-700 hover:text-navy-900">
          Tautan bukti
        </a>
      ) : null}
      {!item.buktiNama && !item.buktiUrl ? <span className="text-slate-500">Belum ada bukti</span> : null}
    </span>
  )
}

function CapaianForm({ item, onDone, onCancel }) {
  const [form, setForm] = useState({
    status: item.status || 'belum',
    judulCapaian: item.judulCapaian || '',
    keterangan: item.keterangan || '',
    tercapaiAt: item.tercapaiAt ? String(item.tercapaiAt).slice(0, 10) : '',
    buktiUrl: item.buktiUrl || '',
  })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setError('')
    if (form.buktiUrl.trim() && !/^https?:\/\/\S+$/i.test(form.buktiUrl.trim())) return setError('URL bukti tidak valid.')
    if (file && (file.size > 10 * 1024 * 1024 || !BUKTI_MIME.includes(file.type))) {
      return setError('Bukti harus PDF, DOCX, JPG, PNG, atau WebP, maksimal 10 MB.')
    }
    setBusy(true)
    try {
      const tercapai = form.status === 'tercapai'
      await luaranApi.saveCapaian(item.id, {
        status: form.status,
        judulCapaian: form.judulCapaian.trim() || null,
        keterangan: form.keterangan.trim() || null,
        // Kosong saat tercapai → backend mengisi hari ini; saat belum → dikosongkan backend.
        ...(tercapai && form.tercapaiAt ? { tercapaiAt: form.tercapaiAt } : {}),
        buktiUrl: form.buktiUrl.trim() || null,
      })
      if (file) await luaranApi.uploadBukti(item.id, file)
      onDone()
    } catch (err) {
      setError(errorText(err, 'Capaian gagal disimpan.'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`lc-status-${item.id}`} className="label">
            Status
          </label>
          <select id={`lc-status-${item.id}`} className="input" value={form.status} onChange={set('status')}>
            <option value="belum">Belum tercapai</option>
            <option value="tercapai">Tercapai</option>
          </select>
        </div>
        <div>
          <label htmlFor={`lc-tgl-${item.id}`} className="label">
            Tanggal tercapai
          </label>
          <input
            id={`lc-tgl-${item.id}`}
            type="date"
            className="input"
            value={form.tercapaiAt}
            onChange={set('tercapaiAt')}
            disabled={form.status !== 'tercapai'}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`lc-judul-${item.id}`} className="label">
            Judul / bentuk capaian
          </label>
          <input id={`lc-judul-${item.id}`} className="input" value={form.judulCapaian} onChange={set('judulCapaian')} placeholder="mis. Artikel di Jurnal X Vol 3 No 2" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`lc-ket-${item.id}`} className="label">
            Keterangan
          </label>
          <textarea id={`lc-ket-${item.id}`} rows={2} className="input resize-y" value={form.keterangan} onChange={set('keterangan')} />
        </div>
        <div>
          <label htmlFor={`lc-url-${item.id}`} className="label">
            URL bukti
          </label>
          <input id={`lc-url-${item.id}`} type="url" className="input" value={form.buktiUrl} onChange={set('buktiUrl')} placeholder="https://…" />
        </div>
        <div>
          <span className="label">File bukti (PDF/DOCX/JPG/PNG/WebP)</span>
          <label className="btn btn-secondary btn-sm cursor-pointer">
            {file ? file.name : item.buktiNama ? 'Ganti file' : 'Pilih file'}
            <input
              type="file"
              accept=".pdf,.docx,image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan capaian'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Batal
        </button>
      </div>
    </form>
  )
}

export default function LuaranCapaian({ proposalId, editable = false }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    luaranApi
      .byProposal(proposalId)
      .then((r) => alive && setItems(r.data.data || []))
      .catch((e) => alive && setError(errorText(e, 'Daftar luaran gagal dimuat.')))
    return () => {
      alive = false
    }
  }, [proposalId, tick])

  const reload = useCallback(() => {
    setEditingId(null)
    setTick((t) => t + 1)
  }, [])

  if (error) return <p className="text-sm text-red-700">{error}</p>
  if (!items) return <span className="spinner block text-navy-600" aria-hidden="true" />
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada target luaran. Target luaran diisi saat mengusulkan proposal.</p>
  }

  const tercapai = items.filter((i) => i.status === 'tercapai').length

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {tercapai} dari {items.length} target tercapai
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">{LUARAN_JENIS[item.jenis] || item.jenis}</p>
                <p className="font-semibold text-slate-900">{item.target}</p>
                {item.targetTanggal ? <p className="text-xs text-slate-500">Target: {hari(item.targetTanggal)}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {item.status === 'tercapai' ? (
                  <span className="badge badge-success">Tercapai{item.tercapaiAt ? ` ${hari(item.tercapaiAt)}` : ''}</span>
                ) : (
                  <span className="badge badge-neutral">Belum tercapai</span>
                )}
                {item.tepatWaktu === true ? <span className="badge badge-info">Tepat waktu</span> : null}
                {item.tepatWaktu === false ? <span className="badge badge-warning">Terlambat</span> : null}
                {editable && editingId !== item.id ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(item.id)}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Isi capaian
                  </button>
                ) : null}
              </div>
            </div>
            {item.judulCapaian || item.keterangan ? (
              <div className="mt-2 text-sm text-slate-700">
                {item.judulCapaian ? <p className="font-medium">{item.judulCapaian}</p> : null}
                {item.keterangan ? <p className="whitespace-pre-line text-slate-600">{item.keterangan}</p> : null}
              </div>
            ) : null}
            <div className="mt-2 text-sm">
              <Bukti item={item} />
            </div>
            {editingId === item.id ? <CapaianForm item={item} onDone={reload} onCancel={() => setEditingId(null)} /> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
