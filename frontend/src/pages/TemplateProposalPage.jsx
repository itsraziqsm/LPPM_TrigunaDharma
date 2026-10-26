import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CloudUpload, Download, FileText, Trash2 } from 'lucide-react'
import { templateProposalApi } from '../api/templateProposal'
import { alertDialog, confirmDialog } from '../utils/dialog'
import { simpanBlob } from '../utils/unduhBlob'
import Breadcrumb from '../components/Breadcrumb'
import UserAvatar from '../components/UserAvatar'

// ---------------------------------------------------------------------------
// Template Proposal (admin, /template-proposal) — W-36, new-api.md bagian 21.
// Unggah versi baru (DOCX/PDF ≤ 10 MB) → langsung aktif untuk jenisnya; versi lama
// tetap sebagai riwayat (Aktifkan lagi / Hapus). Dosen mengunduh template aktif di
// wizard Usulan (components/TemplateProposalLink); jenis tanpa template → template umum.
// ---------------------------------------------------------------------------

const JENIS = [
  { value: 'umum', label: 'Umum' },
  { value: 'penelitian', label: 'Penelitian' },
  { value: 'pengabdian', label: 'Pengabdian' },
]
const JENIS_LABEL = Object.fromEntries(JENIS.map((j) => [j.value, j.label]))
const MAX = 10 * 1024 * 1024
const OK_EXT = /\.(docx|pdf)$/i

const waktu = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const ukuran = (b) => (b == null ? '—' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)
const nama = (u) => u?.fullName || u?.name || '—'

function pesan(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}

function UnggahForm({ onDone }) {
  const [form, setForm] = useState({ jenis: 'umum', tahun: String(new Date().getFullYear()), keterangan: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const pilih = (f) => {
    setError('')
    if (!f) return
    if (!OK_EXT.test(f.name)) return setError('Template harus berupa file DOCX atau PDF.')
    if (f.size > MAX) return setError('Ukuran template maksimal 10 MB.')
    setFile(f)
  }

  const kirim = async (e) => {
    e.preventDefault()
    if (!file) return setError('Pilih file template terlebih dahulu.')
    const tahun = form.tahun.trim()
    if (tahun && !/^\d{4}$/.test(tahun)) return setError('Tahun harus 4 digit (2000–2100).')
    setBusy(true)
    setError('')
    try {
      await templateProposalApi.upload({ file, jenis: form.jenis, tahun: tahun || undefined, keterangan: form.keterangan.trim() || undefined })
      setFile(null)
      setForm((f) => ({ ...f, keterangan: '' }))
      onDone(form.jenis)
    } catch (err) {
      setError(pesan(err, 'Template gagal diunggah.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={kirim} className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-navy-950">Unggah template baru</h2>
        <p className="mt-0.5 text-sm text-slate-500">Versi baru langsung aktif untuk jenisnya; versi lama tetap tersimpan sebagai riwayat.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="tpl-jenis" className="label">
            Jenis
          </label>
          <select id="tpl-jenis" className="input" value={form.jenis} onChange={set('jenis')}>
            {JENIS.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tpl-tahun" className="label">
            Tahun
          </label>
          <input id="tpl-tahun" className="input" inputMode="numeric" value={form.tahun} onChange={set('tahun')} placeholder="2027" />
        </div>
        <div>
          <label htmlFor="tpl-ket" className="label">
            Keterangan
          </label>
          <input id="tpl-ket" className="input" maxLength={191} value={form.keterangan} onChange={set('keterangan')} placeholder="Template penelitian 2027" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-secondary">
          <CloudUpload className="size-4" aria-hidden="true" />
          Pilih file (DOCX/PDF)
        </button>
        <span className="min-w-0 truncate text-sm text-slate-600">{file ? `${file.name} · ${ukuran(file.size)}` : 'Belum ada file dipilih'}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(e) => {
            pilih(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={busy || !file}>
          {busy ? 'Mengunggah…' : 'Unggah & aktifkan'}
        </button>
      </div>
    </form>
  )
}

export default function TemplateProposalPage() {
  const [jenis, setJenis] = useState('')
  const [state, setState] = useState({ loading: true, items: [], failed: false })
  const [busyId, setBusyId] = useState(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    templateProposalApi
      .getAll(jenis ? { jenis } : {})
      .then((r) => alive && setState({ loading: false, items: r.data.data || [], failed: false }))
      .catch(() => alive && setState({ loading: false, items: [], failed: true }))
    return () => {
      alive = false
    }
  }, [jenis, tick])

  const aksi = async (t, fn, gagal) => {
    setBusyId(t.id)
    try {
      await fn()
      reload()
    } catch (e) {
      alertDialog({ title: gagal, message: pesan(e, 'Coba lagi.') })
    } finally {
      setBusyId(null)
    }
  }

  const unduh = (t) =>
    aksi(
      t,
      async () => simpanBlob(await templateProposalApi.download(t.id), t.namaFile || 'template-proposal'),
      'Gagal mengunduh template',
    )
  const aktifkan = async (t) => {
    const ok = await confirmDialog({
      tone: 'primary',
      title: 'Aktifkan versi ini?',
      message: `"${t.keterangan || t.namaFile}" menjadi template ${JENIS_LABEL[t.jenis]?.toLowerCase()} yang diunduh dosen.`,
      confirmText: 'Aktifkan',
    })
    if (ok) aksi(t, () => templateProposalApi.aktifkan(t.id), 'Gagal mengaktifkan template')
  }
  const hapus = async (t) => {
    const ok = await confirmDialog({
      tone: 'danger',
      title: 'Hapus versi template?',
      message: `"${t.keterangan || t.namaFile}" dihapus permanen dari riwayat.`,
      confirmText: 'Hapus',
    })
    if (ok) aksi(t, () => templateProposalApi.remove(t.id), 'Gagal menghapus template')
  }

  const aktif = JENIS.map((j) => ({ ...j, item: state.items.find((t) => t.jenis === j.value && t.isAktif) }))

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Template Proposal</h1>
          <p className="page-desc">Template yang diunduh dosen saat menyusun usulan. Jenis tanpa template sendiri memakai template umum.</p>
        </div>
        <Breadcrumb items={[{ label: 'Template Proposal' }]} />
      </header>

      {!jenis && !state.loading && !state.failed ? (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Template aktif">
          {aktif.map((a) => (
            <div key={a.value} className="card p-4">
              <p className="text-sm text-slate-500">Aktif · {a.label}</p>
              {a.item ? (
                <p className="mt-1 truncate font-semibold text-slate-900" title={a.item.namaFile}>
                  {a.item.keterangan || a.item.namaFile}
                  {a.item.tahun ? <span className="font-normal text-slate-500"> · {a.item.tahun}</span> : null}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">{a.value === 'umum' ? 'Belum ada — dosen memakai file bawaan.' : 'Belum ada — memakai template umum.'}</p>
              )}
            </div>
          ))}
        </section>
      ) : null}

      <UnggahForm onDone={reload} />

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-navy-950">Semua versi</h2>
          <select aria-label="Saring jenis" className="input w-auto" value={jenis} onChange={(e) => setJenis(e.target.value)}>
            <option value="">Semua jenis</option>
            {JENIS.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </select>
        </header>
        {state.loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Memuat template…</p>
        ) : state.failed ? (
          <p className="px-5 py-10 text-center text-sm text-red-700">Daftar template gagal dimuat.</p>
        ) : state.items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Belum ada template yang diunggah.</p>
        ) : (
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Jenis</th>
                  <th scope="col">Ukuran</th>
                  <th scope="col">Diunggah</th>
                  <th scope="col" className="text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="flex items-start gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0 text-navy-600" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-900">
                            {t.keterangan || t.namaFile}
                            {t.isAktif ? (
                              <span className="badge badge-success ml-2 align-middle">
                                <CheckCircle2 className="size-3" aria-hidden="true" />
                                Aktif
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {t.namaFile}
                            {t.tahun ? ` · ${t.tahun}` : ''}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>{JENIS_LABEL[t.jenis] || t.jenis}</td>
                    <td className="tabular-nums">{ukuran(t.ukuran)}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <UserAvatar user={t.diunggahOleh} className="size-6 text-[10px]" fallbackClassName="bg-navy-50 text-navy-700" />
                        <span className="text-sm">
                          {nama(t.diunggahOleh)}
                          <span className="block text-xs text-slate-500">{waktu(t.createdAt)}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="flex justify-end gap-1">
                        <button type="button" onClick={() => unduh(t)} disabled={busyId === t.id} className="btn btn-ghost btn-sm">
                          <Download className="size-4" aria-hidden="true" />
                          Unduh
                        </button>
                        {t.isAktif ? null : (
                          <>
                            <button type="button" onClick={() => aktifkan(t)} disabled={busyId === t.id} className="btn btn-ghost btn-sm">
                              Aktifkan
                            </button>
                            <button type="button" onClick={() => hapus(t)} disabled={busyId === t.id} className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50">
                              <Trash2 className="size-4" aria-hidden="true" />
                              Hapus
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
