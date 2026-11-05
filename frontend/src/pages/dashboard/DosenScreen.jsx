import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  Check,
  ChevronRight,
  DollarSign,
  HeartHandshake,
  Microscope,
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
// data dosen), 6. Statistik Dosen (Penelitian, Pengabdian, Nilai Kepercayaan).
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
  kepercayaan: BadgeCheck,
}

const show = (value) => (value === null || value === undefined ? '—' : value)

// ── Kartu dokumen (4 warna, ToneCard dari HaloLayout) ──────────────────────
function DocCards({ cards, luaran }) {
  return (
    <ToneCardGrid label="Ringkasan dokumen">
        <ToneCard
          tone="green"
          label="Diterima"
          value={cards.diterima}
          hint={cards.total !== null ? `dari ${cards.total} proposal` : null}
          icon={ICONS.check}
          to="/kegiatan/penelitian?status=disetujui"
        />
        <ToneCard
          tone="red"
          label="Ditolak"
          value={cards.ditolak}
          hint="Tidak lolos seleksi"
          icon={ICONS.cross}
          to="/kegiatan/penelitian?status=ditolak"
        />
        <ToneCard
          tone="yellow"
          label="Diproses"
          value={cards.diproses}
          hint={cards.revisi ? `${cards.revisi} perlu revisi` : 'Diajukan & direview'}
          icon={ICONS.timer}
          to="/kegiatan/penelitian"
        />
        <ToneCard
          tone="blue"
          label="Luaran Diklaim"
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
          {/* Jenis tidak diulang bila nama periode sudah memuatnya ("Penelitian Ganjil 2026"). */}
          {[latest.periode && latest.jenis && latest.periode.toLowerCase().includes(latest.jenis.toLowerCase()) ? null : latest.jenis, latest.periode]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div
          className="mt-6 sm:mt-8"
          role="img"
          aria-label={`Tahap ${stage + 1} dari ${STAGES.length}: Tahapan ${STAGES[stage]}`}
        >
          <div className="relative h-6 sm:h-10">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200 sm:h-1.5" />
            <div
              className={`absolute left-0 top-1/2 h-1 -translate-y-1/2 sm:h-1.5 rounded-full ${rejected ? 'bg-red-500' : 'bg-navy-700'}`}
              style={{ width: `${fill}%` }}
            />
            <div className="absolute inset-0 grid grid-cols-4">
              {STAGES.map((label, i) => (
                <div key={label} className="grid place-items-center">
                  <span
                    className={`rounded-full ${
                      i === stage
                        ? `size-6 sm:size-10 ${rejected ? 'bg-red-500' : 'bg-navy-700'}`
                        : i < stage
                          ? 'size-3.5 bg-navy-700 sm:size-6'
                          : 'size-5 bg-slate-200 sm:size-10'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
          {/* Ponsel: hanya label tahap aktif (posisi tetap di bawah titiknya). */}
          <ol className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs leading-snug text-slate-700 sm:mt-4 sm:gap-2">
            {STAGES.map((label, i) => (
              <li key={label} className={i === stage ? 'font-semibold text-navy-900' : 'max-sm:invisible'}>
                <span className="max-sm:hidden">Tahapan </span>
                {label.replace('/', '/\u200b')}
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 max-sm:hidden">
            Tahap saat ini: <span className="font-semibold text-navy-800">{latest.stageLabel || STAGES[stage]}</span>
            {rejected ? ' · proposal ditolak' : ''}
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 group-hover:text-navy-900">
            Lihat detail kegiatan
            <ChevronRight className="size-4 transition-[translate] duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </>
    )
  }

  return (
    <section aria-labelledby="usulan-terakhir" className="space-y-3">
      <SectionTitle id="usulan-terakhir">Usulan Terakhir</SectionTitle>
      {latest?.to && !unavailable ? (
        // Seluruh kartu = tautan ke Detail Kegiatan usulan terakhir.
        <Link
          to={latest.to}
          aria-label={`Buka detail kegiatan: ${latest.judul}`}
          className="group block rounded-xl border border-transparent bg-white px-6 py-6 shadow-md transition-[border-color,box-shadow] duration-200 hover:border-navy-200 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 sm:px-8"
        >
          {content}
        </Link>
      ) : (
        <div className="rounded-xl bg-white px-6 py-6 shadow-md sm:px-8">{content}</div>
      )}
    </section>
  )
}

// ── Profil capaian ──────────────────────────────────────────────────────────
// Ponsel: kartu ringkas 2 kolom tanpa ikon; kartu yang API-nya belum ada disembunyikan.
function MetricCard({ label, value, icon: IconCmp, pending, hint, className = '' }) {
  return (
    <li className={`rounded-xl bg-white px-4 py-3.5 sm:px-6 sm:py-5 ${pending ? 'max-sm:hidden' : ''} ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-700 sm:text-xl sm:text-slate-900">{label}</p>
          <p className="mt-1 text-lg font-medium tabular-nums lining-nums text-slate-900 sm:mt-2 sm:text-xl">{show(value)}</p>
          {pending ? <ApiPending className="mt-1.5" /> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className="hidden size-[4.5rem] shrink-0 place-items-center rounded-full bg-navy-800 text-white sm:grid">
          <IconCmp className="size-9" aria-hidden="true" />
        </span>
      </div>
    </li>
  )
}

// Statistik Dosen: hanya Penelitian, Pengabdian (proposal disetujui) dan Nilai Kepercayaan.
function ProfileMetrics({ penelitian, pengabdian, kepercayaan }) {
  const nilai = kepercayaan?.nilai
  const skala = kepercayaan?.skala || 5
  return (
    <section aria-labelledby="profil-capaian" className="space-y-3">
      <SectionTitle id="profil-capaian">Statistik Dosen</SectionTitle>
      <ul className="grid grid-cols-2 items-start gap-3 sm:gap-4 xl:grid-cols-3">
        <MetricCard label="Penelitian" value={penelitian} icon={ICONS.penelitian} hint="Proposal disetujui" />
        <MetricCard label="Pengabdian" value={pengabdian} icon={ICONS.pengabdian} hint="Proposal disetujui" />
        <MetricCard
          label="Nilai Kepercayaan"
          icon={ICONS.kepercayaan}
          className="max-xl:col-span-2"
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

// Isian yang API-nya belum ada disembunyikan di ponsel (penanda "API belum ada" tetap di desktop).
function ProfileField({ label, field }) {
  return (
    <div className={field.pending ? 'max-sm:hidden' : undefined}>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-navy-900">
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

function DosenStats({ user }) {
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
      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-100 p-3 lg:grid-cols-2">
        {/* Kartu identitas: isi di tengah secara vertikal (tanpa ruang kosong), foto mengisi tinggi kartu di layar lebar. */}
        <article className="flex items-center rounded-xl bg-white p-4 sm:p-6">
          <div className="flex w-full flex-col items-center gap-5 text-center sm:flex-row sm:gap-7 sm:text-left">
            {/* Foto = tautan ke Pengaturan akun (/profil). */}
            <Link
              to="/profil"
              title="Buka pengaturan akun"
              aria-label="Buka pengaturan akun"
              className="shrink-0 rounded-2xl transition-[box-shadow,opacity] duration-200 hover:opacity-90 hover:ring-4 hover:ring-navy-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
            >
              <UserAvatar user={user} className="size-28 text-4xl sm:size-32 sm:text-5xl" rounded="rounded-2xl" fallbackClassName="bg-navy-100 font-serif font-normal text-navy-800" alt={`Foto ${name}`} />
            </Link>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy-600">
                {jabatan.pending ? (
                  <span className="inline-flex items-center gap-2">
                    Jabatan fungsional <ApiPending />
                  </span>
                ) : (
                  jabatan.value
                )}
              </p>
              <h3 className="mt-1 break-words font-serif text-2xl font-medium leading-tight text-navy-950 lg:text-[2rem]">{name}</h3>
              <div className="mt-3 space-y-1 text-sm text-slate-600 lg:mt-4 lg:text-base">
                <p className={`tabular-nums ${phone.pending ? 'max-sm:hidden' : ''}`}>
                  {phone.pending ? (
                    <span className="inline-flex items-center gap-2">
                      No. HP <ApiPending />
                    </span>
                  ) : (
                    phone.value
                  )}
                </p>
                <p className="break-all">{user?.email || '—'}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-xl bg-white p-4 sm:p-6">
          <h3 className="font-serif text-xl font-medium text-navy-950">Data Dosen</h3>
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
        <hr className="pemisah max-sm:hidden" />
        <PintasanSection shortcuts={model.shortcuts}>
          <DocCards cards={dosen.cards} luaran={dosen.luaran} />
        </PintasanSection>
        <hr className="pemisah max-sm:hidden" />
        <LatestProposal latest={dosen.latest} unavailable={dosen.latestUnavailable} />
        <hr className="pemisah max-sm:hidden" />
        <DashboardBody model={model} />
        <hr className="pemisah max-sm:hidden" />
        <DosenStats user={user} />
        <hr className="pemisah max-sm:hidden" />
        <ProfileMetrics penelitian={dosen.penelitian} pengabdian={dosen.pengabdian} kepercayaan={dosen.kepercayaan} />
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
