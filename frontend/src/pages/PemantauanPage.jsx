import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { monitoringApi } from '../api/monitoring'
import { periodeApi } from '../api/periode'
import UserAvatar from '../components/UserAvatar'
import Breadcrumb from '../components/Breadcrumb'
import PanelCari, { PilihanFilter } from '../components/PanelCari'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Pemantauan Proposal (/pemantauan) — Ketua STMIK (juga bisa dibuka Ketua LPPM/Admin),
// hanya baca. W-37, new-api.md bagian 24: ringkasan (GET /monitoring/ringkasan),
// tab Proposal (GET /monitoring/proposals: pengusul, status/tahapan, anggaran, laporan)
// & Dosen (GET /monitoring/dosen: rekap per dosen). Filter bersama: periode, jenis,
// cari, termasuk draft. Baris proposal → Detail Kegiatan (GET /proposals/:id, baca saja).
// ---------------------------------------------------------------------------

const LIMIT = 20
const STATUS_URUT = ['draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak']
const rupiah = (v) => (v == null || v === '' ? '—' : `Rp ${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`)
const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const nama = (u) => u?.fullName || u?.name || '—'
const bersih = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== false))

function Kartu({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{value ?? '—'}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function Halaman({ page, pages, onPage }) {
  if (pages <= 1) return null
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm">
      <span className="text-slate-500">
        Halaman {page} dari {pages}
      </span>
      <span className="flex gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Sebelumnya
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Berikutnya
        </button>
      </span>
    </footer>
  )
}

export default function PemantauanPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'dosen' ? 'dosen' : 'proposal'
  const [periodes, setPeriodes] = useState([])
  const [form, setForm] = useState({ periodeId: '', jenis: '', search: '', termasukDraft: false })
  const [filter, setFilter] = useState(form)
  const [status, setStatus] = useState('')
  const [urut, setUrut] = useState('terbaru')
  const [page, setPage] = useState(1)
  const [ringkasan, setRingkasan] = useState(undefined)
  const [list, setList] = useState({ loading: true, items: [], total: 0, failed: false })

  useEffect(() => {
    periodeApi
      .getAll({ limit: 100 })
      .then((r) => setPeriodes(r.data.data || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setRingkasan(undefined)
    monitoringApi
      .ringkasan(bersih(filter))
      .then((r) => alive && setRingkasan(r.data.data))
      .catch(() => alive && setRingkasan(null))
    return () => {
      alive = false
    }
  }, [filter])

  useEffect(() => {
    let alive = true
    setList((s) => ({ ...s, loading: true }))
    const q = { ...bersih(filter), page, limit: LIMIT }
    const req = tab === 'dosen' ? monitoringApi.dosen(q) : monitoringApi.proposals({ ...q, ...(status ? { status } : {}), urut })
    req
      .then((r) => alive && setList({ loading: false, items: r.data.data || [], total: Number(r.data.meta?.total) || 0, failed: false }))
      .catch(() => alive && setList({ loading: false, items: [], total: 0, failed: true }))
    return () => {
      alive = false
    }
  }, [tab, filter, status, urut, page])

  // Filter di panel berlaku langsung; kata kunci berlaku saat Cari.
  const ubahFilter = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setFilter((f) => ({ ...f, [k]: v }))
    setPage(1)
  }
  const gantiTab = (t) => {
    setParams(t === 'dosen' ? { tab: 'dosen' } : {})
    setPage(1)
  }
  const lihatDosen = (d) => {
    const q = d.nidn || d.fullName || d.name || ''
    setForm((f) => ({ ...f, search: q }))
    setFilter((f) => ({ ...f, search: q }))
    setParams({})
    setPage(1)
  }
  const pages = Math.max(1, Math.ceil(list.total / LIMIT))
  const rk = ringkasan

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Pemantauan Proposal</h1>
          <p className="page-desc">Dosen pengusul, progres tiap proposal, dan besaran anggaran. Hanya baca.</p>
        </div>
        <Breadcrumb items={[{ label: 'Pemantauan Proposal' }]} />
      </header>

      {/* Panel cari standar (components/PanelCari): cari · Filter (periode, jenis, draft) · Cari */}
      <PanelCari
        id="pm"
        value={form.search}
        onChange={(v) => setForm((f) => ({ ...f, search: v }))}
        onSubmit={() => {
          setFilter((f) => ({ ...f, search: form.search.trim() }))
          setPage(1)
        }}
        placeholder="Cari judul, nama atau NIDN pengusul"
        aktif={[
          filter.periodeId ? { key: 'periode', label: `Periode: ${periodes.find((p) => String(p.id) === String(filter.periodeId))?.nama || filter.periodeId}`, onRemove: () => ubahFilter('periodeId', '') } : null,
          filter.jenis ? { key: 'jenis', label: `Jenis: ${filter.jenis === 'penelitian' ? 'Penelitian' : 'Pengabdian'}`, onRemove: () => ubahFilter('jenis', '') } : null,
          filter.termasukDraft ? { key: 'draft', label: 'Termasuk draft', onRemove: () => ubahFilter('termasukDraft', false) } : null,
        ].filter(Boolean)}
        onReset={() => {
          setForm((f) => ({ ...f, periodeId: '', jenis: '', termasukDraft: false }))
          setFilter((f) => ({ ...f, periodeId: '', jenis: '', termasukDraft: false }))
          setPage(1)
        }}
      >
        <div className="grid gap-4 @2xl:grid-cols-3">
          <div>
            <label htmlFor="pm-periode" className="mb-2 block text-sm font-medium text-slate-700">
              Periode
            </label>
            <select id="pm-periode" className="input" value={filter.periodeId} onChange={(e) => ubahFilter('periodeId', e.target.value)}>
              <option value="">Semua periode</option>
              {periodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                  {p.tahun ? ` (${p.tahun})` : ''}
                </option>
              ))}
            </select>
          </div>
          <PilihanFilter
            label="Jenis kegiatan"
            value={filter.jenis}
            onChange={(v) => ubahFilter('jenis', v)}
            items={[['', 'Semua jenis'], ['penelitian', 'Penelitian'], ['pengabdian', 'Pengabdian']]}
          />
          <PilihanFilter
            label="Draft"
            value={filter.termasukDraft ? 'ya' : ''}
            onChange={(v) => ubahFilter('termasukDraft', v === 'ya')}
            items={[['', 'Tanpa draft'], ['ya', 'Termasuk draft']]}
          />
        </div>
      </PanelCari>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan">
        <Kartu label="Jumlah proposal" value={rk === undefined ? '…' : rk?.jumlahProposal} hint={filter.termasukDraft ? 'Termasuk draft' : 'Sudah diajukan'} />
        <Kartu label="Dosen pengusul" value={rk === undefined ? '…' : rk?.jumlahDosenPengusul} />
        <Kartu label="Total anggaran" value={rk === undefined ? '…' : rk ? rupiah(rk.totalAnggaran) : null} />
        <Kartu label="Anggaran disetujui" value={rk === undefined ? '…' : rk ? rupiah(rk.anggaranDisetujui) : null} />
      </section>

      {rk ? (
        <section className="card flex flex-wrap gap-x-6 gap-y-2 px-5 py-3 text-sm" aria-label="Per status">
          {STATUS_URUT.filter((k) => rk.perStatus?.[k] != null).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                gantiTab('proposal')
                setStatus(status === k ? '' : k)
              }}
              className={`inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 ${status === k ? 'bg-navy-50 ring-1 ring-navy-200' : 'hover:bg-slate-50'}`}
              aria-pressed={status === k}
            >
              <span className={`badge ${STATUS_COLOR[k] || 'badge-neutral'}`}>{STATUS_LABEL[k] || k}</span>
              <strong className="tabular-nums text-slate-900">{rk.perStatus[k]}</strong>
            </button>
          ))}
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div role="tablist" aria-label="Tampilan" className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {[
              ['proposal', 'Proposal'],
              ['dosen', 'Dosen pengusul'],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => gantiTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {l}
              </button>
            ))}
          </div>
          {tab === 'proposal' ? (
            <span className="flex flex-wrap items-center gap-2">
              {status ? (
                <button type="button" onClick={() => setStatus('')} className="btn btn-ghost btn-sm">
                  Status: {STATUS_LABEL[status]} ×
                </button>
              ) : null}
              <label htmlFor="pm-urut" className="text-sm text-slate-500">
                Urutkan
              </label>
              <select id="pm-urut" className="input w-auto py-1.5" value={urut} onChange={(e) => setUrut(e.target.value)}>
                <option value="terbaru">Terbaru</option>
                <option value="anggaran">Anggaran terbesar</option>
                <option value="judul">Judul</option>
                <option value="pengusul">Pengusul</option>
              </select>
            </span>
          ) : (
            <span className="text-sm text-slate-500">Urut jumlah proposal terbanyak</span>
          )}
        </header>

        {list.loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Memuat data…</p>
        ) : list.failed ? (
          <p className="px-5 py-10 text-center text-sm text-red-700">Data pemantauan gagal dimuat.</p>
        ) : list.items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada data untuk filter ini.</p>
        ) : tab === 'proposal' ? (
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Proposal</th>
                  <th scope="col">Pengusul</th>
                  <th scope="col">Status &amp; progres</th>
                  <th scope="col" className="text-right">
                    Anggaran
                  </th>
                  <th scope="col">Laporan</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/kegiatan/${p.jenis}/detail/${p.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/kegiatan/${p.jenis}/detail/${p.id}`)}
                  >
                    <td className="min-w-56">
                      <span className="block font-semibold text-slate-900">{p.judul}</span>
                      <span className="block text-xs text-slate-500">
                        {[JENIS_LABEL[p.jenis], p.periode?.nama, p.submittedAt ? `diajukan ${hari(p.submittedAt)}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <UserAvatar user={p.pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium text-slate-900">{nama(p.pengusul)}</span>
                          <span className="block text-xs text-slate-500">
                            {[p.pengusul?.nidn, `${p.jumlahAnggota ?? 0} anggota`].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[p.status] || 'badge-neutral'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                      {p.tahapan ? (
                        <span className="mt-1 block text-xs text-slate-600">
                          Tahap {p.tahapan.urutan}/4 · {p.tahapan.label}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right tabular-nums">{rupiah(p.anggaran)}</td>
                    <td>
                      {p.laporan ? (
                        <>
                          <span className={`badge ${STATUS_COLOR[p.laporan.status] || 'badge-neutral'}`}>{STATUS_LABEL[p.laporan.status] || p.laporan.status}</span>
                          {p.laporan.realisasiAnggaran != null ? (
                            <span className="mt-1 block text-xs text-slate-500">Realisasi {rupiah(p.laporan.realisasiAnggaran)}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">Belum ada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Dosen</th>
                  <th scope="col">Proposal</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Anggaran
                  </th>
                  <th scope="col">Terakhir diajukan</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((r) => (
                  <tr
                    key={r.dosen?.id}
                    tabIndex={0}
                    className="cursor-pointer hover:bg-slate-50"
                    title="Lihat proposal dosen ini"
                    onClick={() => lihatDosen(r.dosen)}
                    onKeyDown={(e) => e.key === 'Enter' && lihatDosen(r.dosen)}
                  >
                    <td>
                      <span className="flex items-center gap-2">
                        <UserAvatar user={r.dosen} className="size-8 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium text-slate-900">{nama(r.dosen)}</span>
                          <span className="block text-xs text-slate-500">
                            {[r.dosen?.nidn, r.dosen?.programStudi, r.dosen?.jabatanFungsional].filter(Boolean).join(' · ') || r.dosen?.email}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="text-sm">
                      <strong className="tabular-nums">{r.jumlahProposal}</strong>
                      <span className="block text-xs text-slate-500">
                        {r.perJenis?.penelitian ?? 0} penelitian · {r.perJenis?.pengabdian ?? 0} pengabdian
                      </span>
                    </td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {STATUS_URUT.filter((k) => Number(r.perStatus?.[k]) > 0).map((k) => (
                          <span key={k} className={`badge ${STATUS_COLOR[k] || 'badge-neutral'}`}>
                            {STATUS_LABEL[k]} {r.perStatus[k]}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="text-right text-sm tabular-nums">
                      {rupiah(r.totalAnggaran)}
                      <span className="block text-xs text-green-700">Disetujui {rupiah(r.anggaranDisetujui)}</span>
                    </td>
                    <td className="text-sm">{hari(r.terakhirDiajukanAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Halaman page={page} pages={pages} onPage={setPage} />
      </section>
    </div>
  )
}
