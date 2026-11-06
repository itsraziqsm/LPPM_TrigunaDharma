import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { monitoringApi } from '../api/monitoring'
import { periodeApi } from '../api/periode'
import UserAvatar from '../components/UserAvatar'
import Breadcrumb from '../components/Breadcrumb'
import KartuNavy, { TabNavy } from '../components/KartuNavy'
import { barisKlik } from '../utils/barisKlik'
import PanelCari, { PilihanFilter } from '../components/PanelCari'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'
import StatistikVisual from './statistik/StatistikVisual'
import { danaFinal } from '../utils/danaKegiatan'

// ---------------------------------------------------------------------------
// Statistik (/statistik, dulu Pemantauan Proposal /pemantauan) — Ketua STMIK (juga bisa dibuka Ketua LPPM/Admin),
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

function Halaman({ page, pages, onPage }) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm text-slate-600">
      <span className="tabular-nums">
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
    </nav>
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
  // `tab` = tab pemilik `items`; selama memuat tab/halaman baru, tabel lama tetap tampil (pudar) agar tinggi kartu
  // tidak menciut dan posisi gulir tidak melompat.
  const [list, setList] = useState({ loading: true, items: [], total: 0, failed: false, tab: null })

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
      .then((r) => alive && setList({ loading: false, items: r.data.data || [], total: Number(r.data.meta?.total) || 0, failed: false, tab }))
      .catch(() => alive && setList({ loading: false, items: [], total: 0, failed: true, tab }))
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
    // replace: ganti tab tidak menambah riwayat (tombol Kembali langsung keluar halaman).
    setParams(t === 'dosen' ? { tab: 'dosen' } : {}, { replace: true })
    setPage(1)
  }
  const lihatDosen = (d) => {
    const q = d.nidn || d.fullName || d.name || ''
    setForm((f) => ({ ...f, search: q }))
    setFilter((f) => ({ ...f, search: q }))
    setParams({}, { replace: true })
    setPage(1)
  }
  const pages = Math.max(1, Math.ceil(list.total / LIMIT))
  // Tabel yang digambar mengikuti data yang ada (bisa tab lama selama tab baru dimuat).
  const tabData = list.tab || tab
  const memuatUlang = list.loading && list.items.length > 0
  const rk = ringkasan

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Statistik</h1>
          <p className="page-desc">Pemantauan proposal: dosen pengusul, progres tiap proposal, dan dana yang disetujui. Hanya baca.</p>
        </div>
        <Breadcrumb items={[{ label: 'Statistik' }]} />
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

      {/* Kartu angka + diagram (pages/statistik); klik status di diagram = saring tabel */}
      <StatistikVisual
        filter={filter}
        ringkasan={rk}
        status={status}
        onStatus={(st) => {
          gantiTab('proposal')
          setStatus(st)
          setPage(1)
        }}
      />

      {/* Tabel bingkai navy (M1) + tab di kepala gelap */}
      <KartuNavy
        id="daftar-pemantauan"
        judul={tab === 'dosen' ? 'Dosen Pengusul' : 'Daftar Proposal'}
        desc={tab === 'dosen' ? 'Urut jumlah proposal terbanyak. Klik baris untuk melihat proposal dosen itu.' : 'Klik baris untuk membuka detail kegiatan (baca saja).'}
        badge={
          list.loading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="spinner size-3.5" aria-hidden="true" />
              Memuat
            </span>
          ) : (
            `${list.total} ${tabData === 'dosen' ? 'dosen' : 'proposal'}`
          )
        }
        tab={<TabNavy label="Tampilan" value={tab} onChange={gantiTab} items={[['proposal', 'Proposal'], ['dosen', 'Dosen pengusul']]} />}
      >
        {/* Baris alat selalu ada (ruang tetap); di tab Dosen pengusul isinya disembunyikan. */}
        <div className={`flex flex-wrap items-center justify-end gap-2 ${tab === 'proposal' ? '' : 'invisible'}`} aria-hidden={tab !== 'proposal' || undefined}>
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
              <option value="anggaran">Dana diusulkan terbesar</option>
              <option value="judul">Judul</option>
              <option value="pengusul">Pengusul</option>
            </select>
          </div>

        {/* 1: memuat pertama kali = placeholder setinggi tabel; memuat ulang = tabel lama dipudarkan & tidak bisa diklik. */}
        <div aria-busy={list.loading || undefined} className={`min-h-64 transition-opacity duration-150 ${memuatUlang ? 'pointer-events-none opacity-50' : ''}`}>
        {list.loading && !memuatUlang ? (
          <p className="flex min-h-64 items-center justify-center text-sm text-slate-500">Memuat data…</p>
        ) : list.failed ? (
          <p className="py-10 text-center text-sm text-red-700">Data pemantauan gagal dimuat.</p>
        ) : list.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Tidak ada data untuk filter ini.</p>
        ) : tabData === 'proposal' ? (
          <div className="table-wrap">
            {/* Ringkas (pola Riwayat Kegiatan): Dana & Laporan satu kolom (< lg → sel Judul), Pengusul (< md) & Status (< sm) ke sel Judul. */}
            <table className="table table-tight table-fixed">
              <colgroup>
                <col />
                <col className="hidden w-52 md:table-column" />
                <col className="hidden w-40 sm:table-column" />
                <col className="hidden w-40 lg:table-column" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Proposal</th>
                  <th scope="col" className="hidden md:table-cell">
                    Pengusul
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    Status &amp; progres
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Dana &amp; laporan
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((p) => {
                  const dana = danaFinal(p) == null ? null : rupiah(danaFinal(p))
                  const laporan = p.laporan ? (
                    <>
                      <span className={`badge ${STATUS_COLOR[p.laporan.status] || 'badge-neutral'}`}>Laporan: {STATUS_LABEL[p.laporan.status] || p.laporan.status}</span>
                      {p.laporan.realisasiAnggaran != null ? <span className="mt-1 block text-xs text-slate-500">Realisasi {rupiah(p.laporan.realisasiAnggaran)}</span> : null}
                    </>
                  ) : (
                    <span className="block text-xs text-slate-400">Belum ada laporan</span>
                  )
                  return (
                  <tr key={p.id} {...barisKlik(() => navigate(`/kegiatan/${p.jenis}/detail/${p.id}`, { state: { dari: { to: '/statistik', label: 'Statistik' } } }), p.judul)}>
                    <td className="min-w-0">
                      <span className="line-clamp-2 break-words font-semibold text-slate-900" title={p.judul}>
                        {p.judul}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {[JENIS_LABEL[p.jenis], p.periode?.nama, p.submittedAt ? `diajukan ${hari(p.submittedAt)}` : null].filter(Boolean).join(' · ')}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500 md:hidden">
                        {nama(p.pengusul)} · {p.jumlahAnggota ?? 0} anggota
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
                        <span className={`badge ${STATUS_COLOR[p.status] || 'badge-neutral'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                        {p.tahapan ? <span className="text-xs text-slate-600">Tahap {p.tahapan.urutan}/4</span> : null}
                      </span>
                      <span className="mt-1 block lg:hidden">
                        <span className="block text-xs tabular-nums text-slate-600">Dana disetujui {dana || '—'}</span>
                        <span className="mt-1 block">{laporan}</span>
                      </span>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="flex items-center gap-2">
                        <UserAvatar user={p.pengusul} className="size-7 shrink-0 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
                        <span className="min-w-0 text-sm">
                          <span className="line-clamp-2 break-words font-medium text-slate-900">{nama(p.pengusul)}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {[p.pengusul?.nidn, `${p.jumlahAnggota ?? 0} anggota`].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className={`badge ${STATUS_COLOR[p.status] || 'badge-neutral'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                      {p.tahapan ? (
                        <span className="mt-1 block text-xs text-slate-600">
                          Tahap {p.tahapan.urutan}/4 · {p.tahapan.label}
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden lg:table-cell">
                      <span className="block text-sm tabular-nums">{dana || <span className="text-slate-400">—</span>}</span>
                      <span className="mt-1 block">{laporan}</span>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            {/* Ringkas: Dana & Terakhir diajukan satu kolom (< lg → sel Dosen), Status per jenis (< md) & jumlah (< sm) ke sel Dosen. */}
            <table className="table table-tight table-fixed">
              <colgroup>
                <col />
                <col className="hidden w-36 sm:table-column" />
                <col className="hidden w-56 md:table-column" />
                <col className="hidden w-40 lg:table-column" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Dosen</th>
                  <th scope="col" className="hidden sm:table-cell">
                    Proposal
                  </th>
                  <th scope="col" className="hidden md:table-cell">
                    Status
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Dana &amp; terakhir diajukan
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((r) => {
                  const perStatus = (
                    <span className="flex flex-wrap gap-1">
                      {STATUS_URUT.filter((k) => Number(r.perStatus?.[k]) > 0).map((k) => (
                        <span key={k} className={`badge ${STATUS_COLOR[k] || 'badge-neutral'}`}>
                          {STATUS_LABEL[k]} {r.perStatus[k]}
                        </span>
                      ))}
                    </span>
                  )
                  return (
                  <tr key={r.dosen?.id} title="Lihat proposal dosen ini" {...barisKlik(() => lihatDosen(r.dosen), nama(r.dosen))}>
                    <td className="min-w-0">
                      <span className="flex items-center gap-2">
                        <UserAvatar user={r.dosen} className="size-8 shrink-0 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
                        <span className="min-w-0 text-sm">
                          <span className="line-clamp-2 break-words font-medium text-slate-900">{nama(r.dosen)}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {[r.dosen?.nidn, r.dosen?.programStudi, r.dosen?.jabatanFungsional].filter(Boolean).join(' · ') || r.dosen?.email}
                          </span>
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-slate-500 sm:hidden">
                        {r.jumlahProposal} proposal · {r.perJenis?.penelitian ?? 0} penelitian · {r.perJenis?.pengabdian ?? 0} pengabdian
                      </span>
                      <span className="mt-1.5 block md:hidden">{perStatus}</span>
                      <span className="mt-1 block text-xs tabular-nums text-slate-500 lg:hidden">
                        Dana disetujui {rupiah(r.anggaranDisetujui)} · terakhir {hari(r.terakhirDiajukanAt)}
                      </span>
                    </td>
                    <td className="hidden text-sm sm:table-cell">
                      <strong className="tabular-nums">{r.jumlahProposal}</strong>
                      <span className="block text-xs text-slate-500">
                        {r.perJenis?.penelitian ?? 0} penelitian · {r.perJenis?.pengabdian ?? 0} pengabdian
                      </span>
                    </td>
                    <td className="hidden md:table-cell">{perStatus}</td>
                    <td className="hidden text-sm tabular-nums lg:table-cell">
                      {rupiah(r.anggaranDisetujui)}
                      <span className="block text-xs text-slate-500">dana disetujui</span>
                      <span className="mt-1 block text-xs text-slate-500">Terakhir {hari(r.terakhirDiajukanAt)}</span>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
        <Halaman page={page} pages={pages} onPage={setPage} />
      </KartuNavy>
    </div>
  )
}
