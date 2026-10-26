import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, RotateCcw, Save } from 'lucide-react'
import { periodeApi } from '../../api/periode'
import { FieldError } from '../../components/Wizard'
import { alertDialog } from '../../utils/dialog'
import { clearCetakConfig, loadCetakConfig, saveCetakConfig } from '../../utils/cetakConfig'
import CetakBreadcrumb from './CetakBreadcrumb'
import { LUARAN_FILTER, LUARAN_KEY } from './dokumen'
import { pesanBlob, unduhLuaran } from './cetakLuaran'

// ---------------------------------------------------------------------------
// Konfigurasi "Luaran Dosen" (Cetak Dokumen, admin): keluaran Unduh semua bukti (ZIP) &/atau
// Unduh CSV, dengan filter halaman Luaran Dosen kecuali jenis luaran & prioritas.
// Tombol unduh di halaman Luaran Dosen dipindah ke sini. Konfigurasi di peramban (W-42).
// ---------------------------------------------------------------------------

const KOSONG = { search: '', status: '', dapatDiklaim: '', adaBukti: '', jenisKegiatan: '', periodeId: '' }
const EMPTY = { zip: true, csv: true, filter: KOSONG, periodeNama: '' }

const opsi = (k, semua) => [['', semua], ...Object.entries(LUARAN_FILTER[k].nilai)]

function Pilih({ id, label, value, onChange, options }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={onChange}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function CetakLuaranPage() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(() => {
    const s = loadCetakConfig(LUARAN_KEY)
    return s ? { ...EMPTY, ...s, filter: { ...KOSONG, ...(s.filter || {}) } } : EMPTY
  })
  const [periodes, setPeriodes] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    periodeApi
      .getAll({ limit: 100 })
      .then((r) => setPeriodes(r.data.data || []))
      .catch(() => {})
  }, [])

  const setF = (k) => (e) => setCfg((c) => ({ ...c, filter: { ...c.filter, [k]: e.target.value } }))

  const simpan = async (cetak) => {
    if (!cfg.zip && !cfg.csv) {
      setError('Pilih minimal satu keluaran: bukti (ZIP) atau CSV.')
      return
    }
    setError('')
    const periode = periodes.find((p) => String(p.id) === cfg.filter.periodeId)
    const saved = saveCetakConfig(LUARAN_KEY, { ...cfg, periodeNama: periode?.nama || '' })
    if (cetak) {
      setBusy(true)
      try {
        await unduhLuaran(saved)
      } catch (e) {
        alertDialog({ title: 'Unduhan gagal', message: await pesanBlob(e, 'File tidak dapat diunduh. Coba lagi.') })
        return
      } finally {
        setBusy(false)
      }
    }
    navigate('/cetak-dokumen', { state: { flash: 'Konfigurasi Luaran Dosen disimpan.' } })
  }

  const reset = () => {
    clearCetakConfig(LUARAN_KEY)
    setCfg(EMPTY)
    setError('')
  }

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Konfigurasi Luaran Dosen</h1>
          <p className="page-desc">Pilih file yang diunduh dan saring luaran yang dimasukkan (maksimal 1000 luaran per unduhan).</p>
        </div>
        <CetakBreadcrumb last="Luaran Dosen" />
      </header>

      <section className="card">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">1. Keluaran</h2>
          <p className="text-sm text-slate-500">Minimal satu.</p>
        </header>
        <fieldset className="space-y-3 px-6 py-5">
          <legend className="sr-only">Keluaran</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800">
              <input type="checkbox" checked={cfg.zip} onChange={(e) => setCfg((c) => ({ ...c, zip: e.target.checked }))} />
              Unduh semua bukti (ZIP)
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800">
              <input type="checkbox" checked={cfg.csv} onChange={(e) => setCfg((c) => ({ ...c, csv: e.target.checked }))} />
              Unduh CSV (pemisah ;)
            </label>
          </div>
          <FieldError message={error} />
        </fieldset>
      </section>

      <section className="card">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">2. Filter</h2>
          <p className="text-sm text-slate-500">Kosongkan untuk semua luaran.</p>
        </header>
        <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="cl-search" className="label">
              Kata kunci
            </label>
            <input id="cl-search" className="input" value={cfg.filter.search} onChange={setF('search')} placeholder="Target, judul capaian, judul proposal, nama/NIDN dosen" />
          </div>
          <Pilih id="cl-status" label="Status capaian" value={cfg.filter.status} onChange={setF('status')} options={opsi('status', 'Semua')} />
          <Pilih id="cl-klaim" label="Dapat diklaim" value={cfg.filter.dapatDiklaim} onChange={setF('dapatDiklaim')} options={opsi('dapatDiklaim', 'Semua')} />
          <Pilih id="cl-bukti" label="Bukti" value={cfg.filter.adaBukti} onChange={setF('adaBukti')} options={opsi('adaBukti', 'Semua')} />
          <Pilih id="cl-kegiatan" label="Jenis kegiatan" value={cfg.filter.jenisKegiatan} onChange={setF('jenisKegiatan')} options={opsi('jenisKegiatan', 'Semua')} />
          <Pilih
            id="cl-periode"
            label="Periode"
            value={cfg.filter.periodeId}
            onChange={setF('periodeId')}
            options={[['', 'Semua periode'], ...periodes.map((p) => [String(p.id), `${p.nama}${p.tahun ? ` (${p.tahun})` : ''}`])]}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/cetak-dokumen" className="btn btn-secondary">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Kembali
        </Link>
        <button type="button" onClick={reset} className="btn btn-ghost text-red-700">
          <RotateCcw className="size-4" aria-hidden="true" />
          Atur ulang
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => simpan(false)} className="btn btn-secondary">
          <Save className="size-4" aria-hidden="true" />
          Simpan konfigurasi
        </button>
        <button type="button" onClick={() => simpan(true)} disabled={busy} className="btn btn-primary">
          <Download className="size-4" aria-hidden="true" />
          {busy ? 'Menyiapkan…' : 'Simpan & unduh'}
        </button>
      </div>
    </div>
  )
}
