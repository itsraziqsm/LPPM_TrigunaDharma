import { Link } from 'react-router-dom'
import { FILTERS_MASUK } from '../hooks/useDokumenMasuk'
import Breadcrumb from './Breadcrumb'
import PanelCari, { PilihanFilter } from './PanelCari'

// Blok bersama Dokumen Masuk (Proposal & Laporan Kegiatan, lihat hooks/useDokumenMasuk):
//   KepalaMasuk      — judul + breadcrumb, lalu kartu ringkasan (teks [+ aksi] + 3 kotak angka; gaya Undangan)
//   PeriodeAktif     — kartu periode aktif selebar halaman + jumlah perlu ditangani (klik = saring)
//   TanpaPeriodeAktif— keadaan kosong bila tidak ada periode aktif
//   CariFilterMasuk  — kolom cari + tombol Filter; panel filter (status, jenis) hanya tampil saat dibuka

const JENIS = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }
const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

export function PeriodeAktif({ periodes, counts, selected, onSelect, noun }) {
  if (periodes === null) return <div className="h-20 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
  return (
    <section aria-labelledby="periode-aktif" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="periode-aktif" className="text-lg font-semibold text-navy-950">
          Periode aktif
        </h2>
        <Link to="/periode" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          {noun} periode sebelumnya ada di menu Periode
        </Link>
      </div>
      <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {periodes.map((p) => {
          const active = selected === String(p.id)
          const n = counts[p.id]
          return (
            <li key={p.id} className="min-w-0 sm:min-w-[18rem] sm:flex-1">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? '' : String(p.id))}
                className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-navy-800 bg-navy-50 ring-1 ring-navy-800' : 'border-slate-200 bg-white hover:border-navy-300'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900">{p.nama}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {JENIS[p.jenis] || p.jenis}
                    {p.tanggalMulai ? ` · ${hari(p.tanggalMulai)} – ${hari(p.tanggalSelesai)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-2xl font-bold leading-none tabular-nums ${n ? 'text-amber-700' : 'text-slate-400'}`}>
                    {n === undefined ? '…' : n === null ? '—' : n}
                  </span>
                  <span className="text-xs text-slate-500">perlu ditangani</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function TanpaPeriodeAktif({ failed, noun }) {
  return (
    <section className="card px-6 py-8 text-center">
      <h2 className="text-lg font-semibold text-navy-950">{failed ? 'Periode gagal dimuat' : 'Tidak ada periode aktif'}</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
        {failed
          ? 'Daftar periode tidak dapat dimuat. Muat ulang halaman untuk mencoba lagi.'
          : `Halaman ini hanya menampilkan ${noun.toLowerCase()} dari periode aktif. ${noun} periode sebelumnya dapat dilihat di menu Periode.`}
      </p>
      <Link to="/periode" className="btn btn-secondary btn-sm mt-4">
        Buka Periode
      </Link>
    </section>
  )
}

export function KepalaMasuk({ judul, desc, crumbs, stats, aksi = null }) {
  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">{judul}</h1>
        <Breadcrumb items={crumbs} />
      </header>
      {/* Container query (bukan lebar layar): di Pengguna area daftar menyempit saat panel detail terbuka. */}
      <div className="@container">
        <section className="card flex flex-col gap-5 p-5 @4xl:flex-row @4xl:items-center @4xl:justify-between">
          <div className="max-w-xl space-y-3">
            <p className="text-base leading-relaxed text-slate-600">{desc}</p>
            {aksi}
          </div>
          <dl className="grid min-w-0 shrink-0 grid-cols-1 gap-3 @md:grid-cols-3 @4xl:w-[30rem]">
            {stats.map((k) => (
              <div key={k.label} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <dt className="text-xs font-medium text-slate-500 @lg:text-sm">{k.label}</dt>
                <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{k.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  )
}

const JENIS_FILTER = [
  ['', 'Semua jenis'],
  ['penelitian', 'Penelitian'],
  ['pengabdian', 'Pengabdian'],
]

// Cari + Filter memakai panel cari standar (components/PanelCari). Status bawaan "perlu"; filter
// aktif = yang menyimpang dari bawaan.
export function CariFilterMasuk({ id, search, onSearch, onSubmit, placeholder, filter, onFilter, jenis, onJenis }) {
  const statusLabel = FILTERS_MASUK.find((f) => f.key === filter)?.label
  const jenisLabel = JENIS_FILTER.find(([k]) => k === jenis)?.[1]
  const aktif = [
    filter !== 'perlu' ? { key: 'status', label: `Status: ${statusLabel}`, onRemove: () => onFilter('perlu') } : null,
    jenis ? { key: 'jenis', label: `Jenis: ${jenisLabel}`, onRemove: () => onJenis('') } : null,
  ].filter(Boolean)
  return (
    <PanelCari
      id={id}
      value={search}
      onChange={onSearch}
      onSubmit={onSubmit}
      placeholder={placeholder}
      aktif={aktif}
      onReset={() => {
        onFilter('perlu')
        onJenis('')
      }}
    >
      <div className="grid gap-4 @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PilihanFilter label="Status" items={FILTERS_MASUK.map((f) => [f.key, f.label])} value={filter} onChange={onFilter} />
        <PilihanFilter label="Jenis kegiatan" items={JENIS_FILTER} value={jenis} onChange={onJenis} />
      </div>
    </PanelCari>
  )
}
