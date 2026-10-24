import { useId } from 'react'
import { Link } from 'react-router-dom'
import { TONE } from './format'

// ---------------------------------------------------------------------------
// Blok tampilan dashboard. Semua peran memakai blok yang sama; yang berbeda
// hanya data yang diisikan adapter. Berkas ini hanya mengekspor komponen.
// ---------------------------------------------------------------------------

// ── Ikon ────────────────────────────────────────────────────────────────────
function Chevron({ className = 'size-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

// ── Kepala halaman ──────────────────────────────────────────────────────────
export function Masthead({
  dateLabel,
  roleLabel,
  greeting,
  name,
  summary,
  actions,
  loading,
  refreshing,
  updatedLabel,
  onReload,
}) {
  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-2xl">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-600">
          <span>{dateLabel}</span>
          {roleLabel ? <span className="badge badge-tag">{roleLabel}</span> : null}
        </p>
        <h1 className="page-title mt-2 break-words">
          {greeting}, {name}
        </h1>
        {loading ? (
          <div className="mt-3 h-5 w-full max-w-md animate-pulse rounded bg-slate-200/70" aria-hidden="true" />
        ) : summary ? (
          <p className="page-desc text-slate-600">{summary}</p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2.5 lg:w-auto lg:items-end">
        {actions.length > 0 ? (
          <nav aria-label="Aksi utama" className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            {actions.map((action) => (
              <Link
                key={action.label}
                to={action.to}
                className={`btn ${action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}`}
              >
                {action.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-slate-600 lg:justify-end">
          {updatedLabel ? <span>Diperbarui pukul {updatedLabel}</span> : null}
          <button
            type="button"
            onClick={onReload}
            disabled={loading || refreshing}
            className="btn btn-ghost btn-sm"
          >
            {refreshing ? <span className="spinner" aria-hidden="true" /> : <RefreshIcon />}
            {refreshing ? 'Memuat ulang' : 'Muat ulang'}
          </button>
        </div>
      </div>
    </header>
  )
}

// ── Ledger angka: satu strip berisi empat angka ─────────────────────────────
export function KpiLedger({ items }) {
  return (
    <section aria-label="Ringkasan angka" className="card overflow-hidden">
      <dl className="grid grid-cols-2 gap-px bg-slate-200 lg:grid-cols-4">
        {items.map((item) => {
          const missing = item.value === null || item.value === undefined
          const alert = item.tone === 'warning' && Number(item.value) > 0
          return (
            <div
              key={item.key}
              className="row-span-3 grid grid-rows-subgrid bg-white px-5 py-4 sm:px-6 sm:py-5"
            >
              <dt className="flex items-center gap-2 text-sm text-slate-500">
                {alert ? (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TONE.warning.hex }}
                    aria-hidden="true"
                  />
                ) : null}
                {item.label}
              </dt>
              <dd
                className={`mt-2.5 font-serif text-[2.25rem] font-medium leading-none tracking-tight tabular-nums ${
                  alert ? 'text-amber-700' : 'text-navy-950'
                }`}
              >
                {missing ? '—' : item.value}
              </dd>
              {item.hint ? <dd className="mt-2.5 text-sm leading-snug text-slate-500">{item.hint}</dd> : null}
            </div>
          )
        })}
      </dl>
    </section>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────
export function Panel({ title, subtitle, aside, footer, children }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="card overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold text-navy-950">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {aside ? <div className="shrink-0 pt-0.5 text-sm text-slate-500 tabular-nums">{aside}</div> : null}
      </header>
      {children}
      {footer}
    </section>
  )
}

export function PanelLink({ to, children }) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-sm font-semibold text-navy-700 transition-colors hover:bg-slate-50 hover:text-navy-900 sm:px-6"
    >
      {children}
      <Chevron className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

export function EmptyState({ title, desc, action }) {
  return (
    <div className="px-5 py-8 text-center sm:px-6">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {desc ? <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{desc}</p> : null}
      {action ? (
        <div className="mt-4">
          <Link to={action.to} className="btn btn-secondary btn-sm">
            {action.label}
          </Link>
        </div>
      ) : null}
    </div>
  )
}

// ── Perlu perhatian ─────────────────────────────────────────────────────────
export function ActionQueue({ items, emptyDesc }) {
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-4 px-5 py-6 sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-green-50 text-green-700">
          <CheckIcon />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">Tidak ada yang perlu diperhatikan</h3>
          {emptyDesc ? <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{emptyDesc}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const tone = TONE[item.tone] || TONE.neutral
        return (
          <li key={item.key}>
            <Link
              to={item.to}
              className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50 sm:px-6"
            >
              <span
                className="mt-[7px] size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tone.hex }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="sr-only">{tone.label}: </span>
                <span className="block text-base font-semibold leading-snug text-slate-900">{item.title}</span>
                {item.detail ? (
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{item.detail}</span>
                ) : null}
              </span>
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-navy-700 group-hover:text-navy-900">
                <span className="max-sm:sr-only">{item.cta}</span>
                <Chevron className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// ── Sebaran status: satu bilah bersegmen + legenda berangka ─────────────────
export function StatusPipeline({ pipeline }) {
  const visible = pipeline.segments.filter((s) => s.value > 0)
  const total = visible.reduce((sum, s) => sum + s.value, 0)

  if (total === 0) return <EmptyState title={pipeline.emptyTitle} desc={pipeline.emptyDesc} />

  const summary = visible.map((s) => `${s.label} ${s.value}`).join(', ')

  return (
    <div className="px-5 py-5 sm:px-6">
      <div
        role="img"
        aria-label={`Sebaran ${pipeline.unit}: ${summary}`}
        className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100"
      >
        {visible.map((s) => (
          <span
            key={s.key}
            className="min-w-1.5"
            style={{ flex: `${s.value} 1 0%`, backgroundColor: s.hex }}
          />
        ))}
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {pipeline.segments.map((s) => {
          const share = Math.round((s.value / total) * 100)
          const muted = s.value === 0
          return (
            <li key={s.key} className="flex items-center gap-3 py-2.5 text-base">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.hex, opacity: muted ? 0.35 : 1 }}
                aria-hidden="true"
              />
              <span className={`min-w-0 flex-1 ${muted ? 'text-slate-500' : 'text-slate-700'}`}>{s.label}</span>
              <span className={`tabular-nums ${muted ? 'font-normal text-slate-500' : 'font-semibold text-slate-900'}`}>
                {s.value}
              </span>
              <span className="w-10 text-right text-sm text-slate-500 tabular-nums">{share}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Daftar utama (proposal / tugasan) ───────────────────────────────────────
export function ItemList({ items }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex flex-col gap-2.5 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:px-6"
        >
          <div className="min-w-0">
            <h3 className="line-clamp-2 break-words text-base font-semibold leading-snug text-slate-900">
              {item.title}
            </h3>
            <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {item.meta.map((entry) => (
                <div key={entry.label} className="flex min-w-0 gap-1.5">
                  <dt className="shrink-0 text-slate-500">{entry.label}</dt>
                  <dd className="min-w-0 truncate text-slate-600">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-col sm:items-end sm:gap-1.5">
            <span className={`badge ${item.status.className}`}>{item.status.label}</span>
            {item.note ? <span className="text-sm text-slate-500 tabular-nums">{item.note}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Baris berkemajuan (periode / rekomendasi) ───────────────────────────────
export function ProgressRows({ rows, emptyTitle, emptyDesc }) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} desc={emptyDesc} />

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.key} className="px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-900" title={row.label}>
                {row.label}
              </h3>
              {row.sub ? <p className="mt-0.5 text-sm text-slate-500">{row.sub}</p> : null}
            </div>
            {row.badge ? <span className="badge badge-tag shrink-0">{row.badge}</span> : null}
          </div>

          {row.progress !== null && row.progress !== undefined ? (
            <div className="mt-3">
              <div
                role="progressbar"
                aria-label={row.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={row.progress}
                className="h-1.5 overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${row.progress}%`,
                    backgroundColor: row.urgent ? TONE.warning.hex : row.hex || '#355190',
                  }}
                />
              </div>
              {row.progressLabel ? (
                <p className={`mt-1.5 text-sm ${row.urgent ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
                  {row.progressLabel}
                </p>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

// ── Umpan aktivitas (garis waktu) ───────────────────────────────────────────
export function Feed({ items, emptyTitle, emptyDesc }) {
  if (items.length === 0) return <EmptyState title={emptyTitle} desc={emptyDesc} />

  return (
    <ol className="px-5 py-5 sm:px-6">
      {items.map((item, index) => (
        <li key={item.key} className="relative flex gap-3.5 pb-5 last:pb-0">
          {index < items.length - 1 ? (
            <span aria-hidden="true" className="absolute bottom-0 left-1 top-4 w-px bg-slate-200" />
          ) : null}
          <span
            aria-hidden="true"
            className={`relative mt-[7px] size-[9px] shrink-0 rounded-full ring-4 ring-white ${
              item.unread ? 'bg-navy-600' : 'bg-slate-300'
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="break-words text-base leading-snug text-slate-900">
              {item.unread ? <span className="sr-only">Belum dibaca. </span> : null}
              <span className="font-semibold">{item.lead}</span>
              {item.rest ? <span className="text-slate-600"> {item.rest}</span> : null}
            </p>
            {item.detail ? (
              <p className="mt-0.5 line-clamp-2 break-words text-sm leading-relaxed text-slate-500">{item.detail}</p>
            ) : null}
            {item.when ? <p className="mt-1 text-xs text-slate-500">{item.when}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── Pintasan ────────────────────────────────────────────────────────────────
export function Shortcuts({ items }) {
  return (
    <nav aria-label="Pintasan">
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={`${item.to}-${item.label}`}>
            <Link
              to={item.to}
              className="group flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 sm:px-6"
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold text-slate-900">{item.label}</span>
                <span className="mt-0.5 block text-sm leading-snug text-slate-500">{item.desc}</span>
              </span>
              <Chevron className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-navy-700" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// ── Pemberitahuan & keadaan memuat ──────────────────────────────────────────
export function Notice({ failed, busy, onRetry }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm leading-relaxed text-amber-800">
        <span className="font-semibold">Sebagian data belum termuat.</span> {failed.join(', ')} tidak dapat
        diambil dari server.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="btn btn-secondary btn-sm shrink-0 self-start sm:self-auto"
      >
        Coba lagi
      </button>
    </div>
  )
}

export function LoadError({ busy, onRetry }) {
  return (
    <section className="card px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-navy-950">Dashboard belum dapat dimuat</h2>
      <p className="mx-auto mt-1.5 max-w-md text-base leading-relaxed text-slate-500">
        Data dashboard gagal diambil dari server. Periksa koneksi Anda, lalu coba lagi.
      </p>
      <div className="mt-5">
        <button type="button" onClick={onRetry} disabled={busy} className="btn btn-primary">
          Coba lagi
        </button>
      </div>
    </section>
  )
}

function Bar({ className }) {
  return <div className={`rounded bg-slate-100 ${className}`} />
}

function PanelSkeleton({ rows }) {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
        <Bar className="h-5 w-40" />
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-4 w-3/4" />
            <Bar className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse space-y-6">
      <p role="status" className="sr-only">
        Memuat dashboard
      </p>
      <div className="card overflow-hidden" aria-hidden="true">
        <div className="grid grid-cols-2 gap-px bg-slate-200 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 bg-white px-5 py-5 sm:px-6">
              <Bar className="h-3.5 w-24" />
              <Bar className="h-9 w-16" />
              <Bar className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={4} />
        </div>
        <div className="space-y-6">
          <PanelSkeleton rows={4} />
          <PanelSkeleton rows={2} />
        </div>
      </div>
    </div>
  )
}

// Bagian yang sumber datanya gagal dimuat tidak boleh tampil seolah-olah kosong.
function Unavailable() {
  return (
    <EmptyState
      title="Belum dapat dimuat"
      desc="Bagian ini gagal diambil dari server. Gunakan Coba lagi di atas."
    />
  )
}

// ── Isi dashboard: susunan yang sama untuk setiap peran ─────────────────────
export function DashboardBody({ model, hideKpis = false }) {
  const { kpis, attention, pipeline, list, side, feed, shortcuts } = model
  const pipelineTotal = pipeline.segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <>
      {hideKpis ? null : <KpiLedger items={kpis} />}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel
            title="Perlu perhatian"
            subtitle={attention.items.length > 1 ? 'Diurutkan dari yang paling mendesak' : undefined}
          >
            <ActionQueue items={attention.items} emptyDesc={attention.emptyDesc} />
          </Panel>

          <Panel
            title={list.title}
            footer={list.to ? <PanelLink to={list.to}>{list.toLabel}</PanelLink> : null}
          >
            {list.unavailable ? (
              <Unavailable />
            ) : list.items.length === 0 ? (
              <EmptyState title={list.emptyTitle} desc={list.emptyDesc} action={list.emptyAction} />
            ) : (
              <ItemList items={list.items} />
            )}
          </Panel>

          <Panel
            title={feed.title}
            footer={feed.to ? <PanelLink to={feed.to}>{feed.toLabel}</PanelLink> : null}
          >
            {feed.unavailable ? (
              <Unavailable />
            ) : (
              <Feed items={feed.items} emptyTitle={feed.emptyTitle} emptyDesc={feed.emptyDesc} />
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title={pipeline.title}
            subtitle={pipeline.subtitle}
            aside={!pipeline.unavailable && pipelineTotal > 0 ? `${pipelineTotal} ${pipeline.unit}` : null}
          >
            {pipeline.unavailable ? <Unavailable /> : <StatusPipeline pipeline={pipeline} />}
          </Panel>

          <Panel
            title={side.title}
            subtitle={side.subtitle}
            footer={side.to && side.rows.length > 0 ? <PanelLink to={side.to}>{side.toLabel}</PanelLink> : null}
          >
            {side.unavailable ? (
              <Unavailable />
            ) : (
              <ProgressRows rows={side.rows} emptyTitle={side.emptyTitle} emptyDesc={side.emptyDesc} />
            )}
          </Panel>

          <Panel title="Pintasan">
            <Shortcuts items={shortcuts} />
          </Panel>
        </div>
      </div>
    </>
  )
}
