import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ExternalLink, FileArchive, FileSpreadsheet, Search } from 'lucide-react'
import { luaranApi } from '../api/luaran'
import { periodeApi } from '../api/periode'
import { alertDialog } from '../utils/dialog'
import { simpanBlob } from '../utils/unduhBlob'
import UserAvatar from '../components/UserAvatar'

// ---------------------------------------------------------------------------
// Luaran Dosen (admin, /luaran-dosen) — W-38, new-api.md bagian 25.2.
// Tabel GET /luaran (filter + paginasi; prioritas jurnal & poster di atas), unduh satu
// bukti (GET /luaran/:id/bukti, blob), Unduh CSV & Unduh semua bukti (ZIP) dengan filter
// yang sama (GET /luaran/unduh-csv|unduh-zip, maks 1000 item per unduhan).
// ---------------------------------------------------------------------------

const LIMIT = 20
const KOSONG = { search: '', jenis: '', prioritas: '', status: '', dapatDiklaim: '', adaBukti: '', jenisKegiatan: '', periodeId: '' }
const JENIS = [
  ['jurnal', 'Artikel jurnal'],
  ['poster', 'Poster'],
  ['prosiding', 'Prosiding'],
  ['hki', 'HKI'],
  ['buku', 'Buku'],
  ['produk', 'Produk / TTG'],
  ['media_massa', 'Video / media massa'],
  ['lainnya', 'Lainnya'],
]
const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const nama = (u) => u?.fullName || u?.name || '—'

// Galat respons blob (CSV/ZIP) → teks pesan.
async function pesanBlob(e, fallback) {
  const data = e.response?.data
  if (data instanceof Blob) {
    try {
      const j = JSON.parse(await data.text())
      if (j.errors) return Object.values(j.errors).flat().join(' ')
      return j.message || fallback
    } catch {
      return fallback
    }
  }
  return e.response?.data?.message || fallback
}

function bersihkan(f) {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''))
}

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

export default function LuaranDosenPage() {
  const [form, setForm] = useState(KOSONG)
  const [filter, setFilter] = useState(KOSONG) // filter yang diterapkan
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ loading: true, items: [], total: 0, failed: false })
  const [periodes, setPeriodes] = useState([])
  const [busy, setBusy] = useState(null) // 'csv' | 'zip' | id luaran

  useEffect(() => {
    periodeApi
      .getAll({ limit: 100 })
      .then((r) => setPeriodes(r.data.data || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    luaranApi
      .getAll({ ...bersihkan(filter), page, limit: LIMIT })
      .then((r) => alive && setState({ loading: false, items: r.data.data || [], total: Number(r.data.meta?.total) || 0, failed: false }))
      .catch(() => alive && setState({ loading: false, items: [], total: 0, failed: true }))
    return () => {
      alive = false
    }
  }, [filter, page])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const terapkan = (e) => {
    e?.preventDefault()
    setFilter(form)
    setPage(1)
  }
  const reset = () => {
    setForm(KOSONG)
    setFilter(KOSONG)
    setPage(1)
  }
  const adaFilter = Object.values(filter).some((v) => v !== '')

  const unduh = useCallback(
    async (jenis) => {
      setBusy(jenis)
      try {
        const params = { ...bersihkan(filter), ...(jenis === 'csv' ? { pemisah: 'titikkoma' } : {}) }
        const res = jenis === 'csv' ? await luaranApi.unduhCsv(params) : await luaranApi.unduhZip(params)
        simpanBlob(res, jenis === 'csv' ? 'rekap-luaran.csv' : 'luaran.zip')
      } catch (e) {
        alertDialog({ title: 'Unduhan gagal', message: await pesanBlob(e, 'File tidak dapat diunduh. Coba lagi.') })
      } finally {
        setBusy(null)
      }
    },
    [filter],
  )

  const unduhBukti = async (item) => {
    setBusy(item.id)
    try {
      simpanBlob(await luaranApi.downloadBukti(item.id), item.buktiFile?.nama || `bukti-${item.id}`)
    } catch (e) {
      alertDialog({ title: 'Bukti gagal diunduh', message: await pesanBlob(e, 'Coba lagi.') })
    } finally {
      setBusy(null)
    }
  }

  const pages = Math.max(1, Math.ceil(state.total / LIMIT))

  return (
    <div className="page space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Luaran Dosen</h1>
          <p className="page-desc">Semua target & capaian luaran kegiatan. Luaran prioritas (jurnal & poster) selalu di atas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => unduh('csv')} disabled={busy === 'csv'} className="btn btn-secondary">
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            {busy === 'csv' ? 'Menyiapkan…' : 'Unduh CSV'}
          </button>
          <button type="button" onClick={() => unduh('zip')} disabled={busy === 'zip'} className="btn btn-primary">
            <FileArchive className="size-4" aria-hidden="true" />
            {busy === 'zip' ? 'Menyiapkan…' : 'Unduh semua bukti (ZIP)'}
          </button>
        </div>
      </header>

      <form onSubmit={terapkan} className="card space-y-4 p-5" aria-label="Saring luaran">
        <div className="flex gap-2">
          <label htmlFor="ld-search" className="sr-only">
            Cari
          </label>
          <input
            id="ld-search"
            className="input"
            value={form.search}
            onChange={set('search')}
            placeholder="Cari target, judul capaian, judul proposal, nama/NIDN dosen"
          />
          <button type="submit" className="btn btn-primary shrink-0">
            <Search className="size-4" aria-hidden="true" />
            Cari
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Pilih id="ld-jenis" label="Jenis luaran" value={form.jenis} onChange={set('jenis')} options={[['', 'Semua jenis'], ...JENIS]} />
          <Pilih id="ld-prioritas" label="Prioritas" value={form.prioritas} onChange={set('prioritas')} options={[['', 'Semua'], ['true', 'Prioritas (jurnal & poster)'], ['false', 'Selain prioritas']]} />
          <Pilih id="ld-status" label="Status capaian" value={form.status} onChange={set('status')} options={[['', 'Semua'], ['tercapai', 'Tercapai'], ['belum', 'Belum']]} />
          <Pilih id="ld-klaim" label="Dapat diklaim" value={form.dapatDiklaim} onChange={set('dapatDiklaim')} options={[['', 'Semua'], ['true', 'Ya'], ['false', 'Tidak']]} />
          <Pilih id="ld-bukti" label="Bukti" value={form.adaBukti} onChange={set('adaBukti')} options={[['', 'Semua'], ['true', 'Ada bukti'], ['false', 'Tanpa bukti']]} />
          <Pilih id="ld-kegiatan" label="Jenis kegiatan" value={form.jenisKegiatan} onChange={set('jenisKegiatan')} options={[['', 'Semua'], ['penelitian', 'Penelitian'], ['pengabdian', 'Pengabdian']]} />
          <Pilih
            id="ld-periode"
            label="Periode"
            value={form.periodeId}
            onChange={set('periodeId')}
            options={[['', 'Semua periode'], ...periodes.map((p) => [String(p.id), `${p.nama}${p.tahun ? ` (${p.tahun})` : ''}`])]}
          />
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-secondary flex-1">
              Terapkan
            </button>
            {adaFilter ? (
              <button type="button" onClick={reset} className="btn btn-ghost">
                Hapus filter
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-slate-500">Unduh CSV/ZIP memakai filter yang sedang diterapkan (maksimal 1000 luaran per unduhan).</p>
      </form>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-navy-950">Daftar luaran</h2>
          <span className="text-sm text-slate-500 tabular-nums">{state.loading ? '…' : `${state.total} luaran`}</span>
        </header>
        {state.loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Memuat luaran…</p>
        ) : state.failed ? (
          <p className="px-5 py-10 text-center text-sm text-red-700">Daftar luaran gagal dimuat.</p>
        ) : state.items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{adaFilter ? 'Tidak ada luaran yang cocok dengan filter.' : 'Belum ada luaran.'}</p>
        ) : (
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Luaran</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dosen</th>
                  <th scope="col">Kegiatan</th>
                  <th scope="col">Bukti</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((l) => (
                  <tr key={l.id}>
                    <td className="min-w-56">
                      <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
                        {l.jenisLabel || l.jenis}
                        {l.prioritas ? <span className="badge badge-warning">Prioritas</span> : null}
                      </span>
                      <span className="block font-semibold text-slate-900">{l.target}</span>
                      {l.judulCapaian ? <span className="block text-xs text-slate-600">{l.judulCapaian}</span> : null}
                      {l.targetTanggal ? <span className="block text-xs text-slate-500">Target {hari(l.targetTanggal)}</span> : null}
                    </td>
                    <td>
                      <span className={`badge ${l.status === 'tercapai' ? 'badge-success' : 'badge-neutral'}`}>{l.status === 'tercapai' ? 'Tercapai' : 'Belum'}</span>
                      {l.dapatDiklaim ? <span className="mt-1 block text-xs font-medium text-green-700">Dapat diklaim</span> : null}
                      {l.tepatWaktu === false ? <span className="mt-1 block text-xs text-amber-700">Lewat target</span> : null}
                      {l.tercapaiAt ? <span className="block text-xs text-slate-500">{hari(l.tercapaiAt)}</span> : null}
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <UserAvatar user={l.pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium text-slate-900">{nama(l.pengusul)}</span>
                          <span className="block text-xs text-slate-500">{[l.pengusul?.nidn, l.pengusul?.programStudi].filter(Boolean).join(' · ') || '—'}</span>
                        </span>
                      </span>
                    </td>
                    <td className="min-w-48">
                      {l.proposal ? (
                        <Link to={`/proposals?detail=${l.proposal.id}`} className="block font-medium text-navy-700 hover:text-navy-900">
                          {l.proposal.judul}
                        </Link>
                      ) : (
                        '—'
                      )}
                      <span className="block text-xs capitalize text-slate-500">
                        {[l.proposal?.jenis, l.proposal?.periode?.nama].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td>
                      <span className="flex flex-col items-start gap-1">
                        {l.buktiFile ? (
                          <button type="button" onClick={() => unduhBukti(l)} disabled={busy === l.id} className="btn btn-ghost btn-sm px-2">
                            <Download className="size-4" aria-hidden="true" />
                            {busy === l.id ? 'Mengunduh…' : 'File'}
                          </button>
                        ) : null}
                        {l.buktiUrl ? (
                          <a href={l.buktiUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm px-2">
                            <ExternalLink className="size-4" aria-hidden="true" />
                            Link
                          </a>
                        ) : null}
                        {!l.buktiFile && !l.buktiUrl ? <span className="text-sm text-slate-400">—</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm">
            <span className="text-slate-500">
              Halaman {page} dari {pages}
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Sebelumnya
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Berikutnya
              </button>
            </span>
          </footer>
        ) : null}
      </section>
    </div>
  )
}
