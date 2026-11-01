import { Link } from 'react-router-dom'
import Breadcrumb from './Breadcrumb'

// ---------------------------------------------------------------------------
// Kepala halaman gaya "Status Penelitian" dosen (KegiatanPage): judul + deskripsi di kiri,
// breadcrumb di kanan, aksi opsional, lalu 3 StatusCard (ikon berubin + angka besar + label).
// Dipakai Kegiatan, Project Saya, dan semua halaman Periode/Arsip (Periode admin & ketua, Arsip
// Kegiatan, Arsip Project, Arsip Periode Ketua STMIK).
//   kartu: [{ icon, tone: { tile, text }, value, label, to? }]
// ---------------------------------------------------------------------------

// Ketiga kartu selalu sama tinggi (grid + h-full); nilai panjang (mis. "Rp 30 jt") diperkecil di ponsel dan
// tidak dipatah agar kartu tidak asimetris.
export function StatusCard({ icon: Icon, tone, value, label, to }) {
  const tampil = value === null || value === undefined ? '—' : value
  const panjang = String(tampil).length > 4
  const body = (
    <>
      <span className={`grid size-10 place-items-center rounded-lg sm:size-16 sm:rounded-xl ${tone.tile}`}>
        <Icon className="size-5 sm:size-8" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span
        className={`mt-2 flex h-7 items-center whitespace-nowrap font-serif font-medium leading-none tabular-nums lining-nums sm:mt-3 sm:h-9 sm:text-[2rem] ${panjang ? 'text-lg' : 'text-2xl'} ${tone.text}`}
      >
        {tampil}
      </span>
      <span className="mt-1.5 text-xs leading-tight text-slate-500 sm:text-sm">{label}</span>
    </>
  )
  const cls = 'card flex h-full flex-col items-center px-2 py-3 text-center sm:px-5 sm:py-6'
  return <li className="min-w-0">{to ? <Link to={to} className={`${cls} transition-shadow hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
}

export default function KepalaStatus({ judul, desc, crumbs, kartu, aksi = null, label }) {
  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{judul}</h1>
          {desc ? <div className="page-desc">{desc}</div> : null}
        </div>
        <Breadcrumb items={crumbs} />
      </header>
      {aksi ? <div className="flex flex-wrap gap-2">{aksi}</div> : null}
      <section aria-label={label || `Ringkasan ${judul.toLowerCase()}`}>
        <ul className="grid grid-cols-3 gap-2 sm:gap-4">
          {kartu.map((k) => (
            <StatusCard key={k.label} {...k} />
          ))}
        </ul>
      </section>
    </>
  )
}
