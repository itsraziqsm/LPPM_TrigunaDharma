import { Check, CircleAlert } from 'lucide-react'

// Komponen bersama wizard formulir (Usulan proposal, Isi laporan): penanda
// wajib, pesan galat, stepper berprogres, kartu langkah, dan tabel pratinjau.

export function Required() {
  return (
    <span className="text-red-600" aria-hidden="true">
      {' '}*
    </span>
  )
}

export function FieldError({ message }) {
  if (!message) return null
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700" role="alert">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}

export function Stepper({ steps, step, maxReached, onGo }) {
  const pct = (step / (steps.length - 1)) * 100
  return (
    <nav aria-label="Langkah pengisian" className="space-y-5">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full rounded-full bg-navy-700 transition-all duration-300" style={{ width: `${Math.max(pct, 6)}%` }} />
      </div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const Icon = s.icon
          const done = i <= step
          const reachable = i <= maxReached
          return (
            <li key={s.key} className="flex justify-center">
              <button
                type="button"
                onClick={() => reachable && onGo(i)}
                disabled={!reachable}
                aria-current={i === step ? 'step' : undefined}
                className="group flex flex-col items-center gap-2 disabled:cursor-not-allowed"
              >
                <span
                  className={`grid size-11 place-items-center rounded-full border-2 transition-colors ${
                    done ? 'border-navy-700 bg-navy-700 text-white' : 'border-slate-300 bg-white text-slate-500 group-enabled:group-hover:border-navy-400'
                  }`}
                >
                  {i < step ? <Check className="size-5" aria-hidden="true" /> : <Icon className="size-5" aria-hidden="true" />}
                </span>
                <span className={`text-xs sm:text-base ${done ? 'font-semibold text-navy-700' : 'text-slate-600'}`}>{s.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function StepCard({ title, desc, children }) {
  return (
    <section className="card">
      <header className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-xl font-semibold text-navy-950">{title}</h2>
        {desc ? <p className="mt-0.5 text-sm text-slate-500">{desc}</p> : null}
      </header>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}

export function PreviewTable({ rows }) {
  return (
    <dl className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm font-medium text-slate-600">{label}</dt>
          <dd className="min-w-0 whitespace-pre-line break-words text-sm text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
