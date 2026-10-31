import { Link } from 'react-router-dom'
import Breadcrumb from './Breadcrumb'

// ---------------------------------------------------------------------------
// Kepala halaman gaya "Status Penelitian" dosen (KegiatanPage): judul + deskripsi di kiri,
// breadcrumb di kanan, aksi opsional, lalu 3 StatusCard (ikon berubin + angka besar + label).
// Dipakai Kegiatan, Project Saya, dan semua halaman Periode/Arsip (Periode admin & ketua, Arsip
// Kegiatan, Arsip Project, Arsip Periode Ketua STMIK).
//   kartu: [{ icon, tone: { tile, text }, value, label, to? }]
// ---------------------------------------------------------------------------

export function StatusCard({ icon: Icon, tone, value, label, to }) {
  const body = (
    <>
      <span className={`grid size-10 place-items-center rounded-lg sm:size-16 sm:rounded-xl ${tone.tile}`}>
        <Icon className="size-5 sm:size-8" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className={`mt-2 font-serif text-2xl font-medium leading-none tabular-nums lining-nums sm:mt-3 sm:text-[2rem] ${tone.text}`}>
        {value === null || value === undefined ? '—' : value}
      </span>
      <span className="mt-1.5 text-xs leading-tight text-slate-500 sm:text-sm">{label}</span>
    </>
  )
  const cls = 'card flex flex-col items-center px-2 py-3 text-center sm:px-5 sm:py-6'
  return <li>{to ? <Link to={to} className={`${cls} transition-shadow hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
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
