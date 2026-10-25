import { Link } from 'react-router-dom'
import { FILTERS_MASUK } from '../hooks/useDokumenMasuk'

// Blok bersama Dokumen Masuk (Proposal & Laporan Kegiatan, lihat hooks/useDokumenMasuk):
//   PeriodeAktif     — kartu periode aktif + jumlah perlu ditangani (klik = saring)
//   TanpaPeriodeAktif— keadaan kosong bila tidak ada periode aktif
//   FilterMasuk      — tombol filter status (Perlu ditangani, Revisi, …)

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
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {periodes.map((p) => {
          const active = selected === String(p.id)
          const n = counts[p.id]
          return (
            <li key={p.id}>
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

export function FilterMasuk({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Filter status">
      {FILTERS_MASUK.map((f) => (
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
  )
}
