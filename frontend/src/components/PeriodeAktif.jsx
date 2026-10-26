import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { FILTERS_MASUK } from '../hooks/useDokumenMasuk'
import Breadcrumb from './Breadcrumb'

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
      <section className="card flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-3">
          <p className="text-base leading-relaxed text-slate-600">{desc}</p>
          {aksi}
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-3 lg:w-[30rem]">
          {stats.map((k) => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-medium text-slate-500 sm:text-sm">{k.label}</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{k.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}

const JENIS_FILTER = [
  { key: '', label: 'Semua jenis' },
  { key: 'penelitian', label: 'Penelitian' },
  { key: 'pengabdian', label: 'Pengabdian' },
]

function Pilihan({ items, value, onChange, label }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={value === f.key}
            onClick={() => onChange(f.key)}
            className={`inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
              value === f.key ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

// Cari + Filter dalam satu kartu. Status bawaan "perlu"; tombol Filter menunjukkan jumlah
// filter yang menyimpang dari bawaan, dan ringkasannya tampil saat panel tertutup.
export function CariFilterMasuk({ id, search, onSearch, onSubmit, placeholder, filter, onFilter, jenis, onJenis }) {
  const [buka, setBuka] = useState(false)
  const statusLabel = FILTERS_MASUK.find((f) => f.key === filter)?.label
  const jenisLabel = JENIS_FILTER.find((f) => f.key === jenis)?.label
  const ubah = (filter !== 'perlu' ? 1 : 0) + (jenis ? 1 : 0)
  return (
    <section className="card p-4 sm:p-5" aria-label="Pencarian dan filter">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor={`${id}-cari`} className="sr-only">
          Cari
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id={`${id}-cari`} type="search" className="input pl-9" placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-expanded={buka}
            aria-controls={`${id}-filter`}
            onClick={() => setBuka((v) => !v)}
            className={`btn flex-1 sm:flex-none ${buka ? 'btn-primary' : 'btn-secondary'}`}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filter
            {ubah ? <span className={`rounded-full px-1.5 text-xs tabular-nums ${buka ? 'bg-white text-navy-800' : 'bg-navy-800 text-white'}`}>{ubah}</span> : null}
          </button>
          <button type="submit" className="btn btn-primary flex-1 sm:flex-none">
            Cari
          </button>
        </div>
      </form>

      {buka ? (
        <div id={`${id}-filter`} className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Pilihan label="Status" items={FILTERS_MASUK} value={filter} onChange={onFilter} />
          <Pilihan label="Jenis kegiatan" items={JENIS_FILTER} value={jenis} onChange={onJenis} />
        </div>
      ) : ubah ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          Filter aktif: <span className="badge badge-tag">{statusLabel}</span>
          {jenis ? <span className="badge badge-tag">{jenisLabel}</span> : null}
          <button
            type="button"
            onClick={() => {
              onFilter('perlu')
              onJenis('')
            }}
            className="inline-flex items-center gap-1 font-medium text-navy-600 hover:text-navy-800"
          >
            <X className="size-3.5" aria-hidden="true" />
            Atur ulang
          </button>
        </p>
      ) : null}
    </section>
  )
}
