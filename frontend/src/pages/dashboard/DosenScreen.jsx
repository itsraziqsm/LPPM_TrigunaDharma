import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  BadgeCheck,
  Check,
  DollarSign,
  HeartHandshake,
  Microscope,
  NotebookText,
  RefreshCw,
  Star,
  Timer,
  X,
} from 'lucide-react'
import ApiPending from '../../components/ApiPending'
import { API_BASE_URL } from '../../api/axios'
import { ADAPTERS } from './adapters'
import { DashboardBody, DashboardSkeleton, LoadError, Notice } from './components'
import { ROLE_LABEL, formatClock, formatDay, formatLongDate } from './format'

// ---------------------------------------------------------------------------
// Dashboard dosen (revamp sesuai desain "Halo, Dosen"): kartu dokumen, usulan
// terakhir dengan tahapan, profil capaian, dan statistik dosen — lalu blok
// dashboard bersama (perlu perhatian, proposal terbaru, notifikasi, sebaran
// status, periode, pintasan) tetap dipertahankan di bawahnya.
//
// Bagian yang belum punya endpoint ditampilkan sebagai placeholder dengan
// penanda "API belum ada". Daftarnya: docs/waitingApi-list.md (root repo).
// ---------------------------------------------------------------------------

// Label tanpa awalan "Tahapan" (awalan disembunyikan di layar sempit).
const STAGES = ['Seleksi/Usulan', 'Pelaksanaan Kegiatan', 'Seleksi/Lanjutan', 'Pasca Pelaksanaan Kegiatan']

// ── Ikon (lucide-react) ─────────────────────────────────────────────────────
const ICONS = {
  check: Check,
  cross: X,
  timer: Timer,
  dollar: DollarSign,
  pengabdian: HeartHandshake,
  penelitian: Microscope,
  jurnal: NotebookText,
  sinta: (props) => <Star {...props} fill="currentColor" />,
  sertifikasi: Award,
  kepercayaan: BadgeCheck,
  refresh: RefreshCw,
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className="text-xl font-semibold text-navy-950">
      {children}
    </h2>
  )
}

const show = (value) => (value === null || value === undefined ? '—' : value)

// ── Kepala halaman ──────────────────────────────────────────────────────────
function DosenHeader({ now, name, roleLabel, summary, actions, loading, refreshing, updatedAt, onReload }) {
  const firstName = String(name || '').split(/[\s,]+/)[0] || name
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
          <p className="text-[2rem] font-bold leading-tight text-navy-950">
            <span aria-hidden="true">👋 </span>Halo {firstName}!
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-600">
            <span>{formatLongDate(now)}</span>
            {roleLabel ? <span className="badge badge-tag">{roleLabel}</span> : null}
          </p>
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
            {updatedAt ? <span>Diperbarui pukul {formatClock(updatedAt)}</span> : null}
            <button type="button" onClick={onReload} disabled={loading || refreshing} className="btn btn-ghost btn-sm">
              {refreshing ? <span className="spinner" aria-hidden="true" /> : <ICONS.refresh className="size-4" aria-hidden="true" />}
              {refreshing ? 'Memuat ulang' : 'Muat ulang'}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

// ── Kartu dokumen (4 warna) ─────────────────────────────────────────────────
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
}

function DocCard({ tone, label, value, hint, icon: IconCmp, pending, to }) {
  const t = CARD_TONES[tone]
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

function DocCards({ cards, luaran }) {
  return (
    <section aria-label="Ringkasan dokumen">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DocCard
          tone="green"
          label="Dokumen Diterima"
          value={cards.diterima}
          hint={cards.total !== null ? `dari ${cards.total} proposal` : null}
          icon={ICONS.check}
          to="/kegiatan/penelitian?status=disetujui"
        />
        <DocCard
          tone="red"
          label="Dokumen Ditolak"
          value={cards.ditolak}
          hint="Tidak lolos seleksi"
          icon={ICONS.cross}
          to="/kegiatan/penelitian?status=ditolak"
        />
        <DocCard
          tone="yellow"
          label="Dokumen Diproses"
          value={cards.diproses}
          hint={cards.revisi ? `${cards.revisi} perlu revisi` : 'Diajukan & direview'}
          icon={ICONS.timer}
          to="/kegiatan/penelitian"
        />
        <DocCard
          tone="blue"
          label="Luaran Dapat Diklaim"
          value={luaran ? luaran.dapatDiklaim : null}
          hint={luaran ? `${luaran.tercapai} tercapai dari ${luaran.total} target` : 'Data belum termuat'}
          icon={ICONS.dollar}
          to="/kegiatan/penelitian"
        />
      </ul>
    </section>
  )
}

// ── Usulan terakhir + tahapan ───────────────────────────────────────────────
function LatestProposal({ latest, unavailable }) {
  let content
  if (unavailable) {
    content = <p className="text-base text-slate-500">Usulan terakhir belum dapat dimuat.</p>
  } else if (!latest) {
    content = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base text-slate-500">Anda belum memiliki usulan.</p>
        <Link to="/kegiatan/penelitian/usulan" className="btn btn-secondary btn-sm">
          Buat proposal
        </Link>
      </div>
    )
  } else {
    const stage = latest.stage
    const rejected = latest.status.key === 'ditolak'
    // Garis terisi sampai titik tahap aktif (titik berada di tengah kolom).
    const fill = ((stage + 0.5) / STAGES.length) * 100
    content = (
      <>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <h3 className="break-words text-lg font-bold uppercase leading-snug text-slate-950">{latest.judul}</h3>
          <span className={`badge shrink-0 self-start ${latest.status.className}`}>{latest.status.label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {[latest.jenis, latest.periode].filter(Boolean).join(' · ')}
        </p>

        <div
          className="mt-8"
          role="img"
          aria-label={`Tahap ${stage + 1} dari ${STAGES.length}: Tahapan ${STAGES[stage]}`}
        >
          <div className="relative h-10">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
            <div
              className={`absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full ${rejected ? 'bg-red-500' : 'bg-navy-700'}`}
              style={{ width: `${fill}%` }}
            />
            <div className="absolute inset-0 grid grid-cols-4">
              {STAGES.map((label, i) => (
                <div key={label} className="grid place-items-center">
                  <span
                    className={`rounded-full ${
                      i === stage
                        ? `size-10 ${rejected ? 'bg-red-500' : 'bg-navy-700'}`
                        : i < stage
                          ? 'size-6 bg-navy-700'
                          : 'size-10 bg-slate-200'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
          <ol className="mt-4 grid grid-cols-4 gap-1.5 text-center text-[0.6875rem] leading-snug text-slate-700 sm:gap-2 sm:text-xs">
            {STAGES.map((label, i) => (
              <li key={label} className={i === stage ? 'font-semibold text-navy-900' : undefined}>
                <span className="max-sm:hidden">Tahapan </span>
                {label.replace('/', '/\u200b')}
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-5 text-xs text-slate-500">
          Tahap saat ini: <span className="font-semibold text-navy-800">{latest.stageLabel || STAGES[stage]}</span>
          {rejected ? ' · proposal ditolak' : ''}
        </p>
      </>
    )
  }

  return (
    <section aria-labelledby="usulan-terakhir" className="space-y-3">
      <SectionTitle id="usulan-terakhir">Usulan Terakhir</SectionTitle>
      <div className="rounded-xl bg-white px-6 py-6 shadow-md sm:px-8">{content}</div>
    </section>
  )
}

// ── Profil capaian ──────────────────────────────────────────────────────────
function MetricCard({ label, value, icon: IconCmp, pending, hint }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl bg-white px-6 py-5">
      <div className="min-w-0">
        <p className="text-xl text-slate-900">{label}</p>
        <p className="mt-2 text-xl font-medium tabular-nums lining-nums text-slate-900">{show(value)}</p>
        {pending ? <ApiPending className="mt-1.5" /> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <span className="grid size-[4.5rem] shrink-0 place-items-center rounded-full bg-navy-800 text-white">
        <IconCmp className="size-9" aria-hidden="true" />
      </span>
    </li>
  )
}

function ProfileMetrics({ user, penelitian, pengabdian, luaran, kepercayaan }) {
  const nilai = kepercayaan?.nilai
  const skala = kepercayaan?.skala || 5
  const hasSinta = user && Object.prototype.hasOwnProperty.call(user, 'sintaScore')
  return (
    <section aria-labelledby="profil-capaian" className="space-y-3">
      <SectionTitle id="profil-capaian">Profil</SectionTitle>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Pengabdian" value={pengabdian} icon={ICONS.pengabdian} hint="Proposal disetujui" />
        <MetricCard label="Jurnal" icon={ICONS.jurnal} value={luaran ? luaran.jurnal : null} hint="Luaran jurnal yang dapat diklaim" />
        <MetricCard
          label="Nilai Sinta"
          icon={ICONS.sinta}
          value={hasSinta ? (user.sintaScore ?? 'Belum diisi') : null}
          pending={!hasSinta}
          hint={hasSinta ? (user.sintaId ? `SINTA ID ${user.sintaId}` : 'Isi di Pengaturan') : null}
        />
        <MetricCard label="Penelitian" value={penelitian} icon={ICONS.penelitian} hint="Proposal disetujui" />
        <MetricCard label="Sertifikasi" icon={ICONS.sertifikasi} pending />
        <MetricCard
          label="Nilai Kepercayaan"
          icon={ICONS.kepercayaan}
          value={kepercayaan ? (nilai == null ? 'Belum ada data' : `${Number(nilai).toFixed(1)}/${skala}.0`) : null}
          hint={
            kepercayaan?.komponen
              ? `${kepercayaan.komponen.filter((k) => k.nilai != null).length} dari ${kepercayaan.komponen.length} komponen terhitung`
              : null
          }
        />
      </ul>
    </section>
  )
}

// ── Statistik dosen ─────────────────────────────────────────────────────────
// /auth/me kini mengirim field profil (Grup A/B). Bila suatu key tidak ada
// (backend lama), tampil placeholder "API belum ada".
function profileValue(user, keys, format = (v) => v) {
  const present = keys.filter((k) => user && Object.prototype.hasOwnProperty.call(user, k))
  if (present.length === 0) return { pending: true }
  const raw = present.map((k) => user[k]).find((v) => v !== null && v !== undefined && v !== '')
  return { value: raw ? format(raw) : 'Belum diisi' }
}

function ProfileField({ label, field }) {
  return (
    <div>
      <dt className="text-base text-slate-900">{label}</dt>
      <dd className="mt-1 pl-3 text-base text-navy-600">
        {field.pending ? (
          <span className="inline-flex items-center gap-2">
            —<ApiPending />
          </span>
        ) : (
          field.value
        )}
      </dd>
    </div>
  )
}

function StatChip({ icon: IconCmp, value, label, pending }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-yellow-400 text-white">
        <IconCmp className="size-6" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-semibold tabular-nums lining-nums text-slate-950">{show(value)}</span>
        <span className="block text-xs text-slate-700">{label}</span>
        {pending ? <ApiPending className="mt-1" /> : null}
      </span>
    </li>
  )
}

function DosenStats({ user, penelitian, pengabdian, luaran }) {
  const name = user?.fullName || user?.name || '—'
  const initials = String(user?.name || name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  const phone = profileValue(user, ['noHp', 'kontak'])
  const jabatan = profileValue(user, ['jabatanFungsional'], (v) => v)
  const tempat = profileValue(user, ['tempatLahir'])
  const tanggal = profileValue(user, ['tanggalLahir'], (v) => formatDay(v))
  const ttl =
    tempat.pending && tanggal.pending
      ? { pending: true }
      : { value: [tempat.value, tanggal.value].filter((v) => v && v !== 'Belum diisi').join(', ') || 'Belum diisi' }

  return (
    <section aria-labelledby="statistik-dosen" className="space-y-3">
      <SectionTitle id="statistik-dosen">Statistik Dosen</SectionTitle>
      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-100 p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="rounded-xl bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-5 sm:flex-row">
            {user?.fotoUrl ? (
              <img src={`${API_BASE_URL}${user.fotoUrl}`} alt={`Foto ${name}`} className="size-28 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="grid size-28 shrink-0 place-items-center rounded-xl bg-navy-100 font-serif text-4xl text-navy-800" aria-hidden="true">
                {initials || '?'}
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <h3 className="break-words text-xl font-semibold text-navy-700">{name}</h3>
              <p className="text-base text-slate-900">
                {jabatan.pending ? (
                  <span className="inline-flex items-center gap-2">
                    Jabatan fungsional <ApiPending />
                  </span>
                ) : (
                  jabatan.value
                )}
              </p>
              <p className="text-base text-slate-900">
                {phone.pending ? (
                  <span className="inline-flex items-center gap-2">
                    No. HP <ApiPending />
                  </span>
                ) : (
                  phone.value
                )}
              </p>
              <p className="break-all text-base text-slate-900">{user?.email || '—'}</p>
            </div>
          </div>

          <ul className="mt-5 grid grid-cols-1 gap-4 rounded-xl bg-slate-100 px-5 py-4 sm:flex sm:flex-wrap sm:justify-around sm:gap-x-6">
            <StatChip icon={ICONS.pengabdian} value={pengabdian} label="Pengabdian" />
            <StatChip icon={ICONS.penelitian} value={penelitian} label="Penelitian" />
            <StatChip icon={ICONS.jurnal} value={luaran ? luaran.jurnal : null} label="Jurnal Diterbitkan" />
          </ul>
        </article>

        <article className="rounded-xl bg-white p-4 sm:p-5">
          <h3 className="text-xl font-semibold text-navy-700">Data Dosen</h3>
          <dl className="mt-3 space-y-3">
            <ProfileField label="NIDN/NIDK" field={profileValue(user, ['nidn'])} />
            <ProfileField label="Institusi" field={profileValue(user, ['institusi'])} />
            <ProfileField label="Tempat Tanggal Lahir" field={ttl} />
            <ProfileField label="Program Studi" field={profileValue(user, ['programStudi', 'prodi'])} />
          </dl>
        </article>
      </div>
    </section>
  )
}

// ── Halaman ─────────────────────────────────────────────────────────────────
export default function DosenScreen({ role, adapterKey, user, loading, refreshing, model, failed, updatedAt, onReload }) {
  const [openedAt] = useState(() => new Date())
  const now = updatedAt || openedAt
  const name = user?.name || user?.fullName || ROLE_LABEL[role] || ''
  const actions = ADAPTERS[adapterKey]?.actions ?? []
  const dosen = model?.dosen

  let body
  if (loading) body = <DashboardSkeleton />
  else if (!model) body = <LoadError busy={refreshing} onRetry={onReload} />
  else
    body = (
      <>
        <DocCards cards={dosen.cards} luaran={dosen.luaran} />
        <LatestProposal latest={dosen.latest} unavailable={dosen.latestUnavailable} />
        <ProfileMetrics user={user} penelitian={dosen.penelitian} pengabdian={dosen.pengabdian} luaran={dosen.luaran} kepercayaan={dosen.kepercayaan} />
        <DosenStats user={user} penelitian={dosen.penelitian} pengabdian={dosen.pengabdian} luaran={dosen.luaran} />
        <DashboardBody model={model} hideKpis />
      </>
    )

  return (
    <div className="page rise space-y-8">
      <DosenHeader
        now={now}
        name={name}
        roleLabel={ROLE_LABEL[role]}
        summary={model?.summary}
        actions={actions}
        loading={loading}
        refreshing={refreshing}
        updatedAt={updatedAt}
        onReload={onReload}
      />

      {model && failed.length > 0 ? <Notice failed={failed} busy={refreshing} onRetry={onReload} /> : null}

      {body}
    </div>
  )
}
