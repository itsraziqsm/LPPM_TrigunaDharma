import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, Save } from 'lucide-react'
import { FieldError } from '../../components/Wizard'
import { alertDialog } from '../../utils/dialog'
import { clearCetakConfig, loadCetakConfig, saveCetakConfig } from '../../utils/cetakConfig'
import CetakBreadcrumb from './CetakBreadcrumb'
import { PENGGUNA_KEY, PERAN_LABEL, penggunaRingkas } from './dokumen'
import { ambilPengguna, penggunaPDF } from './cetakPengguna'

// ---------------------------------------------------------------------------
// Konfigurasi "Cetak Tabel Pengguna" (Cetak Dokumen): semua peran, atau pilih ≥ 1 peran.
// Data GET /users (per peran bila dipilih); PDF di frontend (cetakPengguna.js).
// Konfigurasi di peramban (utils/cetakConfig, W-42).
// ---------------------------------------------------------------------------

const PERAN = Object.keys(PERAN_LABEL)
const EMPTY = { semua: true, roles: [] }

export default function CetakPenggunaPage() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(() => ({ ...EMPTY, ...(loadCetakConfig(PENGGUNA_KEY) || {}) }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (r) =>
    setCfg((c) => ({ ...c, roles: c.roles.includes(r) ? c.roles.filter((x) => x !== r) : [...c.roles, r] }))

  const simpan = async (cetak) => {
    if (!cfg.semua && cfg.roles.length === 0) {
      setError('Pilih minimal satu peran, atau pilih "Semua peran".')
      return
    }
    setError('')
    const saved = saveCetakConfig(PENGGUNA_KEY, { semua: cfg.semua, roles: cfg.semua ? [] : cfg.roles })
    if (cetak) {
      setBusy(true)
      try {
        const users = await ambilPengguna(saved)
        if (!users.length) {
          alertDialog({ tone: 'info', title: 'Tidak ada data', message: 'Tidak ada pengguna dengan peran terpilih.' })
          return
        }
        penggunaPDF(users, penggunaRingkas(saved))
      } catch {
        alertDialog({ title: 'Gagal mencetak', message: 'Data pengguna tidak dapat dimuat. Coba lagi.' })
        return
      } finally {
        setBusy(false)
      }
    }
    navigate('/cetak-dokumen', { state: { flash: 'Konfigurasi Tabel Pengguna disimpan.' } })
  }

  const reset = () => {
    clearCetakConfig(PENGGUNA_KEY)
    setCfg(EMPTY)
    setError('')
  }

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Konfigurasi Tabel Pengguna</h1>
          <p className="page-desc">Pilih peran pengguna yang dimasukkan ke tabel cetak.</p>
        </div>
        <CetakBreadcrumb last="Tabel Pengguna" />
      </header>

      <section className="card">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">Peran</h2>
          <p className="text-sm text-slate-500">Semua peran, atau minimal satu peran tertentu.</p>
        </header>
        <fieldset className="space-y-4 px-6 py-5">
          <legend className="sr-only">Cakupan peran</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="radio" name="cakupan" checked={cfg.semua} onChange={() => setCfg((c) => ({ ...c, semua: true }))} />
              Semua peran
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="radio" name="cakupan" checked={!cfg.semua} onChange={() => setCfg((c) => ({ ...c, semua: false }))} />
              Pilih peran
            </label>
          </div>
          {!cfg.semua ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {PERAN.map((r) => (
                <label key={r} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800">
                  <input type="checkbox" checked={cfg.roles.includes(r)} onChange={() => toggle(r)} />
                  {PERAN_LABEL[r]}
                </label>
              ))}
            </div>
          ) : null}
          <FieldError message={error} />
        </fieldset>
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
          <Printer className="size-4" aria-hidden="true" />
          {busy ? 'Menyiapkan…' : 'Simpan & cetak'}
        </button>
      </div>
    </div>
  )
}
