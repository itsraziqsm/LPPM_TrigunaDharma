import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, House, LogIn, RotateCw } from 'lucide-react'
import { errorFor } from '../utils/errorCodes'

const TONES = {
  info: { tile: 'bg-navy-50 text-navy-700 ring-navy-100', code: 'text-navy-100' },
  warning: { tile: 'bg-amber-50 text-amber-700 ring-amber-100', code: 'text-amber-100' },
  danger: { tile: 'bg-red-50 text-red-700 ring-red-100', code: 'text-red-100' },
}

// Tampilan galat seragam: angka kode besar sebagai latar, ubin ikon, judul,
// penjelasan, dan aksi. Dipakai halaman /error/:code, 404, galat router, dan
// halaman fitur yang belum tersedia (mis. Luaran → 501).
//   code      : kode HTTP (lihat utils/errorCodes.js)
//   title/desc: menimpa teks bawaan kode
//   note      : catatan tambahan kecil di bawah penjelasan
//   signedIn  : tentukan tombol utama (Dashboard vs Masuk)
//   actions   : tombol tambahan [{ to, label }]
//   detail    : teks teknis (mis. pesan galat) dalam <details>
//   as        : elemen judul ('h1' halaman mandiri, 'h2' bila halaman sudah punya h1)
export default function ErrorState({ code, title, desc, note, signedIn = true, actions = [], detail, as: Heading = 'h1' }) {
  const navigate = useNavigate()
  const meta = errorFor(code)
  const Icon = meta.icon
  const tone = TONES[meta.tone] || TONES.info
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  return (
    <section aria-labelledby="error-title" className="relative mx-auto w-full max-w-xl px-1 py-6 text-center">
      <p
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 -top-4 select-none font-serif text-[9rem] font-medium leading-none tracking-tight sm:text-[12rem] ${tone.code}`}
      >
        {code}
      </p>

      <div className="relative pt-16 sm:pt-24">
        <span className={`mx-auto grid size-16 place-items-center rounded-2xl ring-8 ${tone.tile}`}>
          <Icon className="size-8" strokeWidth={1.6} aria-hidden="true" />
        </span>

        <p className="mt-6 text-sm font-semibold tabular-nums text-slate-500">
          Kode {code} · {meta.name}
        </p>
        <Heading id="error-title" className="mt-2 font-serif text-3xl font-medium text-navy-950 sm:text-4xl">
          {title || meta.title}
        </Heading>
        <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-600">{desc || meta.desc}</p>
        {note ? <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500">{note}</p> : null}

        <div className="mt-8 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
          {meta.login || !signedIn ? (
            <Link to="/login" className="btn btn-primary">
              <LogIn className="size-4" aria-hidden="true" />
              Masuk
            </Link>
          ) : (
            <Link to="/dashboard" className="btn btn-primary">
              <House className="size-4" aria-hidden="true" />
              Ke Dashboard
            </Link>
          )}
          {meta.retry ? (
            <button type="button" onClick={() => window.location.reload()} className="btn btn-secondary">
              <RotateCw className="size-4" aria-hidden="true" />
              Coba lagi
            </button>
          ) : null}
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="btn btn-secondary">
              {a.label}
            </Link>
          ))}
          {canGoBack ? (
            <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Kembali
            </button>
          ) : null}
        </div>

        {detail ? (
          <details className="mx-auto mt-8 max-w-md rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700">Detail teknis</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">{detail}</pre>
          </details>
        ) : null}
      </div>
    </section>
  )
}
