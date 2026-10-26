import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ExternalLink, Search, SlidersHorizontal, X } from 'lucide-react'
import { luaranApi } from '../api/luaran'
import { periodeApi } from '../api/periode'
import { alertDialog } from '../utils/dialog'
import { simpanBlob } from '../utils/unduhBlob'
import { pesanBlob } from './cetak/cetakLuaran'
import Breadcrumb from '../components/Breadcrumb'
import UserAvatar from '../components/UserAvatar'

// ---------------------------------------------------------------------------
// Luaran Dosen (admin, /luaran-dosen) — W-38, new-api.md bagian 25.2.
// Tabel GET /luaran (filter + paginasi; prioritas jurnal & poster di atas), unduh satu
// bukti (GET /luaran/:id/bukti, blob). Unduh CSV & semua bukti (ZIP) dipindah ke Cetak Dokumen
// → Luaran Dosen (pages/cetak/CetakLuaranPage).
// ---------------------------------------------------------------------------

const LIMIT = 6
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


// Label filter (selain kata kunci) untuk baris "Filter aktif".
const LABEL_FILTER = {
  jenis: 'Jenis',
  prioritas: 'Prioritas',
  status: 'Status',
  dapatDiklaim: 'Dapat diklaim',
  adaBukti: 'Bukti',
  jenisKegiatan: 'Kegiatan',
  periodeId: 'Periode',
}
const NILAI_FILTER = {
  prioritas: { true: 'Prioritas', false: 'Selain prioritas' },
  status: { tercapai: 'Tercapai', belum: 'Belum' },
  dapatDiklaim: { true: 'Ya', false: 'Tidak' },
  adaBukti: { true: 'Ada bukti', false: 'Tanpa bukti' },
  jenisKegiatan: { penelitian: 'Penelitian', pengabdian: 'Pengabdian' },
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
  const [busy, setBusy] = useState(null) // id luaran yang buktinya sedang diunduh
  const [bukaFilter, setBukaFilter] = useState(false)

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
  // Filter aktif = filter terapan selain kata kunci; baris ringkasannya hanya tampil bila ada.
  const aktif = Object.keys(LABEL_FILTER).filter((k) => filter[k] !== '')
  const nilaiFilter = (k) =>
    k === 'jenis'
      ? JENIS.find(([v]) => v === filter.jenis)?.[1] || filter.jenis
      : k === 'periodeId'
        ? periodes.find((p) => String(p.id) === filter.periodeId)?.nama || `#${filter.periodeId}`
        : NILAI_FILTER[k]?.[filter[k]] || filter[k]
  const hapusFilter = (k) => {
    setForm((f) => ({ ...f, [k]: '' }))
    setFilter((f) => ({ ...f, [k]: '' }))
    setPage(1)
  }

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
      <Breadcrumb className="flex justify-end" items={[{ label: 'Akademik' }, { label: 'Luaran' }]} />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Luaran Dosen</h1>
          <p className="page-desc">Semua target & capaian luaran kegiatan. Luaran prioritas (jurnal & poster) selalu di atas.</p>
        </div>
      </header>

      {/* Panel cari: kolom cari · Filter · Cari; panel filter hanya saat dibuka */}
      <section className="card p-4 sm:p-5" aria-label="Pencarian dan filter luaran">
        <form role="search" onSubmit={terapkan} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="ld-search" className="sr-only">
            Cari
          </label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="ld-search"
              type="search"
              className="input pl-9"
              value={form.search}
              onChange={set('search')}
              placeholder="Cari target, judul capaian, judul proposal, nama/NIDN dosen"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-expanded={bukaFilter}
              aria-controls="ld-filter"
              onClick={() => setBukaFilter((v) => !v)}
              className={`btn flex-1 sm:flex-none ${bukaFilter ? 'btn-primary' : 'btn-secondary'}`}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filter
              {aktif.length ? (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${bukaFilter ? 'bg-white text-navy-800' : 'bg-navy-800 text-white'}`}>{aktif.length}</span>
              ) : null}
            </button>
            <button type="submit" className="btn btn-primary flex-1 sm:flex-none">
              Cari
            </button>
          </div>
        </form>

        {bukaFilter ? (
          <form id="ld-filter" onSubmit={terapkan} className="mt-4 space-y-3 border-t border-slate-100 pt-4" aria-label="Saring luaran">
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
          </form>
        ) : null}

        {aktif.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            Filter aktif:
            {aktif.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => hapusFilter(k)}
                aria-label={`Hapus filter ${LABEL_FILTER[k]}`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:border-navy-300"
              >
                {LABEL_FILTER[k]}: {nilaiFilter(k)}
                <X className="size-3" aria-hidden="true" />
              </button>
            ))}
            <button type="button" onClick={reset} className="font-medium text-navy-600 hover:text-navy-800">
              Hapus semua
            </button>
          </div>
        ) : null}
      </section>

      {/* Desain disamakan dengan tabel Riwayat dosen (KegiatanPage): bingkai navy, kepala gelap */}
      <section aria-labelledby="daftar-luaran" className="overflow-hidden rounded-2xl border-2 border-navy-800 bg-white shadow-md">
        <header className="bg-navy-800 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="daftar-luaran" className="font-serif text-2xl font-medium text-white">
                Daftar luaran
              </h2>
              <p className="mt-1 text-sm text-white/75">Target & capaian luaran seluruh kegiatan; prioritas (jurnal & poster) di atas.</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white tabular-nums">
              {state.loading ? '…' : `${state.total} luaran`}
            </span>
          </div>
        </header>
        <div className="space-y-4 p-4 sm:p-5">
        {state.loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Memuat luaran…</p>
        ) : state.failed ? (
          <p className="px-5 py-10 text-center text-sm text-red-700">Daftar luaran gagal dimuat.</p>
        ) : state.items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{adaFilter ? 'Tidak ada luaran yang cocok dengan filter.' : 'Belum ada luaran.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="table table-tight">
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
                        <Link to={`/proposals/detail/${l.proposal.id}`} className="block font-medium text-navy-700 hover:text-navy-900">
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
          <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span className="tabular-nums">
              Halaman {page} dari {pages} · {state.total} luaran
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Sebelumnya
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Berikutnya
              </button>
            </span>
          </nav>
        ) : null}
        </div>
      </section>
    </div>
  )
}
