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
  Star,
  Timer,
  X,
} from 'lucide-react'
import ApiPending from '../../components/ApiPending'
import { DashboardBody, DashboardSkeleton, LoadError, Notice } from './components'
import { HaloHeader, PintasanSection, SectionTitle, ToneCard, ToneCardGrid } from './HaloLayout'
import { ROLE_LABEL, formatDay } from './format'
import UserAvatar from '../../components/UserAvatar'

// ---------------------------------------------------------------------------
// Dashboard dosen (desain "Halo, Dosen"). Urutan bagian: 1. Halo, 2. Pintasan
// (pintasan horizontal + kartu dokumen & luaran), 3. Usulan Terakhir (tahapan),
// 4. Informasi (perlu perhatian, status proposal, proposal terbaru, periode
// berjalan diminimalkan; notifikasi terbaru dihapus), 5. Profil Dosen (identitas &
// data dosen), 6. Statistik Dosen (angka capaian).
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
}

const show = (value) => (value === null || value === undefined ? '—' : value)

// ── Kartu dokumen (4 warna, ToneCard dari HaloLayout) ──────────────────────
function DocCards({ cards, luaran }) {
  return (
    <ToneCardGrid label="Ringkasan dokumen">
        <ToneCard
          tone="green"
          label="Dokumen Diterima"
          value={cards.diterima}
          hint={cards.total !== null ? `dari ${cards.total} proposal` : null}
          icon={ICONS.check}
          to="/kegiatan/penelitian?status=disetujui"
        />
        <ToneCard
          tone="red"
          label="Dokumen Ditolak"
          value={cards.ditolak}
          hint="Tidak lolos seleksi"
          icon={ICONS.cross}
          to="/kegiatan/penelitian?status=ditolak"
        />
        <ToneCard
          tone="yellow"
          label="Dokumen Diproses"
          value={cards.diproses}
          hint={cards.revisi ? `${cards.revisi} perlu revisi` : 'Diajukan & direview'}
          icon={ICONS.timer}
          to="/kegiatan/penelitian"
        />
        <ToneCard
          tone="blue"
          label="Luaran Dapat Diklaim"
          value={luaran ? luaran.dapatDiklaim : null}
          hint={luaran?.total != null ? `${luaran.tercapai} tercapai dari ${luaran.total} target` : 'Data belum termuat'}
          icon={ICONS.dollar}
          to="/kegiatan/penelitian"
        />
    </ToneCardGrid>
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
      <SectionTitle id="profil-capaian">Statistik Dosen</SectionTitle>
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
      <SectionTitle id="statistik-dosen">Profil Dosen</SectionTitle>
      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-100 p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="rounded-xl bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-5 sm:flex-row">
            <UserAvatar user={user} className="size-28 text-4xl" rounded="rounded-xl" fallbackClassName="bg-navy-100 font-serif font-normal text-navy-800" alt={`Foto ${name}`} />
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
  const name = user?.fullName || user?.name || ROLE_LABEL[role] || ''
  const dosen = model?.dosen

  let body
  if (loading) body = <DashboardSkeleton />
  else if (!model) body = <LoadError busy={refreshing} onRetry={onReload} />
  else
    // Urutan: Halo → Pintasan (pintasan + info dokumen & luaran) → Usulan Terakhir →
    // Informasi → Profil Dosen → Statistik Dosen.
    body = (
      <>
        <PintasanSection shortcuts={model.shortcuts}>
          <DocCards cards={dosen.cards} luaran={dosen.luaran} />
        </PintasanSection>
        <LatestProposal latest={dosen.latest} unavailable={dosen.latestUnavailable} />
        <DashboardBody model={model} />
        <DosenStats user={user} penelitian={dosen.penelitian} pengabdian={dosen.pengabdian} luaran={dosen.luaran} />
        <ProfileMetrics user={user} penelitian={dosen.penelitian} pengabdian={dosen.pengabdian} luaran={dosen.luaran} kepercayaan={dosen.kepercayaan} />
      </>
    )

  return (
    <div className="page rise space-y-8">
      <HaloHeader
        now={now}
        name={name}
        roleLabel={ROLE_LABEL[role]}
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
