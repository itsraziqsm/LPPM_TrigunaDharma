import { Link } from 'react-router-dom'
import { Check, FilePen, Files, NotebookText, RefreshCw, Timer, UserPlus } from 'lucide-react'
import ApiPending from '../../components/ApiPending'
import { ShortcutStrip } from './components'
import { formatClock, formatLongDate } from './format'

// ---------------------------------------------------------------------------
// Layout dashboard bergaya "Halo, Dosen" yang dipakai SEMUA peran. Urutan bagian
// Beranda (semua peran): 1. Halo → 2. Pintasan (kartu pintasan horizontal + kartu
// angka) → [dosen: Usulan Terakhir] → 3. Informasi (DashboardBody) → [dosen:
// Profil Dosen, Statistik Dosen].
//   HaloHeader      — judul "Dashboard" + breadcrumb, salam "Halo {nama}!", tanggal,
//                     peran, ringkasan, aksi utama, muat ulang.
//   PintasanSection — judul "Pintasan", baris pintasan, lalu kartu angka (children).
//   ToneCards       — kartu angka berwarna dengan ikon bulat (4 kolom).
//   SectionTitle    — judul bagian.
// Isi tiap peran tetap dari adapter masing-masing (model.kpis, model.shortcuts, …);
// dosen menambah bagian khususnya sendiri di DosenScreen.
// ---------------------------------------------------------------------------

export function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className="text-xl font-semibold text-navy-950">
      {children}
    </h2>
  )
}

const show = (value) => (value === null || value === undefined ? '—' : value)

// ── Kepala halaman ──────────────────────────────────────────────────────────
// Nama untuk sapaan: buang gelar di belakang koma ("…, M.Kom") dan gelar di depan
// ("Dr.", "Prof.", "Ir.", "H.", …) agar tidak tersisa "Halo Dr.!".
const GELAR_DEPAN = /^(prof|dr|drs|dra|ir|h|hj|kh|ns|apt|st|tn|ny)\.?$/i
function namaSapaan(name) {
  const tanpaGelarBelakang = String(name || '').split(',')[0].trim()
  const kata = tanpaGelarBelakang.split(/\s+/).filter(Boolean)
  while (kata.length > 1 && (GELAR_DEPAN.test(kata[0]) || kata[0].endsWith('.'))) kata.shift()
  return kata.join(' ') || String(name || '')
}

export function HaloHeader({ now, name, roleLabel, loading, refreshing, updatedAt, onReload }) {
  const sapaan = namaSapaan(name)
  return (
    <header className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">Dashboard</h1>
        <nav aria-label="Breadcrumb" className="text-base">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">
              /
            </li>
            <li aria-current="page" className="text-slate-500">
              Dashboard
            </li>
          </ol>
        </nav>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="break-words text-[2rem] font-bold leading-tight text-navy-950">
            <span aria-hidden="true">👋 </span>Halo {sapaan}!
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-600">
            <span>{formatLongDate(now)}</span>
            {roleLabel ? <span className="badge badge-tag">{roleLabel}</span> : null}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 lg:w-auto lg:items-end">
          <div className="flex items-center gap-2 text-xs text-slate-600 lg:justify-end">
            {updatedAt ? <span>Diperbarui pukul {formatClock(updatedAt)}</span> : null}
            <button type="button" onClick={onReload} disabled={loading || refreshing} className="btn btn-ghost btn-sm">
              {refreshing ? <span className="spinner" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              {refreshing ? 'Memuat ulang' : 'Muat ulang'}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

// ── Bagian 2: Pintasan (baris kartu horizontal) + kartu angka ───────────────
export function PintasanSection({ shortcuts, children }) {
  if ((!shortcuts || shortcuts.length === 0) && !children) return null
  return (
    <section aria-labelledby="pintasan" className="space-y-3">
      <SectionTitle id="pintasan">Pintasan</SectionTitle>
      <ShortcutStrip items={shortcuts} />
      {children}
    </section>
  )
}

// ── Kartu angka berwarna ────────────────────────────────────────────────────
const CARD_TONES = {
  green: {
    box: 'border-green-400 bg-green-50',
    label: 'text-green-700',
    value: 'text-green-700',
    badge: 'bg-green-600 text-white ring-4 ring-green-100',
  },
  red: {
    box: 'border-red-300 bg-red-50',
    label: 'text-red-700',
    value: 'text-red-600',
    badge: 'bg-red-500 text-white',
  },
  yellow: {
    box: 'border-slate-800 bg-yellow-50',
    label: 'text-slate-900',
    value: 'text-slate-900',
    badge: 'bg-yellow-400 text-white',
  },
  blue: {
    box: 'border-navy-400 bg-navy-100',
    label: 'text-navy-600',
    value: 'text-navy-600',
    badge: 'bg-white text-navy-600',
  },
  navy: {
    box: 'border-slate-300 bg-white',
    label: 'text-navy-700',
    value: 'text-navy-950',
    badge: 'bg-navy-800 text-white',
  },
}

export function ToneCard({ tone, label, value, hint, icon: IconCmp, pending, to }) {
  const t = CARD_TONES[tone] || CARD_TONES.navy
  const body = (
    <>
      <div className="min-w-0">
        <p className={`text-sm font-semibold leading-tight ${t.label}`}>{label}</p>
        <p className={`mt-2 text-[1.75rem] font-bold leading-none tabular-nums lining-nums ${t.value}`}>{show(value)}</p>
        {pending ? <ApiPending className="mt-2" /> : hint ? <p className="mt-2 text-xs text-slate-600">{hint}</p> : null}
      </div>
      <span className={`grid size-14 shrink-0 place-items-center rounded-full ${t.badge}`}>
        <IconCmp className="size-8" aria-hidden="true" />
      </span>
    </>
  )
  const cls = `flex h-full min-h-[7.25rem] items-center justify-between gap-3 rounded-xl border px-5 py-4 ${t.box}`
  return (
    <li>
      {to ? (
        <Link to={to} className={`${cls} transition-shadow hover:shadow-md`}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}

export function ToneCardGrid({ label = 'Ringkasan', children }) {
  return (
    <section aria-label={label}>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</ul>
    </section>
  )
}

// KPI adapter (model.kpis: { key, label, value, hint, tone }) → kartu berwarna.
// Warna & ikon mengikuti makna: total (biru), perlu tindakan (kuning, tone
// 'warning'), selesai/disetujui (hijau), lainnya (navy).
const KPI_ICONS = { total: Files, antre: Timer, belum: Timer, undangan: UserPlus, proses: FilePen, draft: FilePen, laporan: NotebookText, selesai: Check }

function kpiTone(kpi) {
  if (kpi.tone === 'warning') return 'yellow'
  if (kpi.key === 'total') return 'blue'
  if (kpi.key === 'selesai') return 'green'
  return 'navy'
}

export function KpiToneCards({ items }) {
  if (!items || items.length === 0) return null
  return (
    <ToneCardGrid label="Ringkasan angka">
      {items.map((kpi) => (
        <ToneCard
          key={kpi.key}
          tone={kpiTone(kpi)}
          label={kpi.label}
          value={kpi.value}
          hint={kpi.hint}
          icon={KPI_ICONS[kpi.key] || Files}
          to={kpi.to}
        />
      ))}
    </ToneCardGrid>
  )
}
