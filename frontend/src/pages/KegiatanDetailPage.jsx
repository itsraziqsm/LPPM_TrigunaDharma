import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Download,
  FileText,
  Handshake,
  Send,
  Tag,
  Users,
} from 'lucide-react'
import api from '../api/axios'
import { proposalApi } from '../api/proposal'
import { proposalDosenApi } from '../api/Proposaldosen'
import { laporanApi } from '../api/laporan'
import useAuthStore from '../store/authStore'
import { getRoleNames } from '../utils/roles'
import { alertDialog, confirmDialog } from '../utils/dialog'
import { bukaDokumenUtama } from '../utils/dokumenUtama'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL, UNDANGAN_COLOR } from './ProposalDosen/constants'
import { ReviewList } from './laporan/shared'
import LuaranCapaian from './laporan/LuaranCapaian'
import { LaporanTab } from './ProposalDosen/LaporanTab'
import UserAvatar from '../components/UserAvatar'
import { DokumenTab } from './ProposalDosen/DokumenTab'

// ---------------------------------------------------------------------------
// Detail Kegiatan (/kegiatan/:jenis/detail/:id) — halaman, bukan modal. Dipakai
// semua peran terkait: dosen pengusul (GET /dosen/proposals/:id + aksi Lanjutkan,
// Ajukan, Laporan, lampiran), dosen/mahasiswa anggota tim dan admin/ketua
// (GET /proposals/:id, baca saja). Jenis di URL disesuaikan dengan jenis proposal.
// ---------------------------------------------------------------------------

const TAHAPAN = ['Seleksi usulan', 'Pelaksanaan', 'Seleksi lanjutan', 'Pasca pelaksanaan']
const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
const rupiah = (v) => (v || v === 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')
const nama = (u) => u?.fullName || u?.name || '—'

export function Section({ icon: Icon, title, action, children }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-navy-950">
          {Icon ? <Icon className="size-[18px] text-navy-600" aria-hidden="true" /> : null}
          {title}
        </h2>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function Fields({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items
        .filter((it) => it && !it.hidden)
        .map((it) => (
          <div key={it.label} className={it.wide ? 'sm:col-span-2' : undefined}>
            <dt className="text-xs font-semibold text-slate-500">{it.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-slate-900">{it.value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  )
}

function Tahapan({ tahapan, status }) {
  // Belum disetujui: tahap 1 (seleksi usulan) walau field tahapan tidak dikirim.
  const now = tahapan?.urutan || (status === 'disetujui' ? 2 : 1)
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Tahapan kegiatan">
      {TAHAPAN.map((label, i) => {
        const n = i + 1
        const done = n < now
        const active = n === now
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              active ? 'border-navy-800 bg-navy-50 font-semibold text-navy-900' : done ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                active ? 'bg-navy-800 text-white' : done ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : n}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

export default function KegiatanDetailPage({ jenis }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const roles = getRoleNames(user?.roles)
  const isDosen = roles[0] === 'dosen'
  const [state, setState] = useState({ status: 'loading', detail: null, sebagaiPengusul: false })
  const [laporan, setLaporan] = useState(undefined) // laporan kegiatan milik proposal ini (pengusul)
  const [submitting, setSubmitting] = useState(false)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    // Pengusul (dosen) memakai endpoint dosen; anggota tim & pengelola memakai /proposals/:id.
    const load = async () => {
      if (isDosen) {
        try {
          const r = await proposalDosenApi.getByIdLengkap(id)
          return { detail: r.data.data, sebagaiPengusul: true }
        } catch {
          /* bukan milik sendiri → coba sebagai anggota */
        }
      }
      const r = await proposalApi.getById(id)
      return { detail: r.data.data, sebagaiPengusul: false }
    }
    load()
      .then((res) => alive && setState({ status: 'ready', ...res }))
      .catch((e) => alive && setState({ status: e.response?.status === 403 ? 'forbidden' : 'error', detail: null, sebagaiPengusul: false }))
    return () => {
      alive = false
    }
  }, [id, isDosen, tick])

  const detail = state.detail
  const sebagaiPengusul = state.sebagaiPengusul && detail && (detail.pengusulId === user?.id || detail.pengusul?.id === user?.id || detail.pengusulId === undefined)

  // Jenis di URL mengikuti jenis proposal (mis. tautan notifikasi tanpa jenis).
  useEffect(() => {
    if (detail?.jenis && detail.jenis !== jenis) navigate(`/kegiatan/${detail.jenis}/detail/${detail.id}`, { replace: true })
  }, [detail, jenis, navigate])

  // Laporan kegiatan milik proposal ini (hanya pengusul, proposal disetujui).
  useEffect(() => {
    if (!sebagaiPengusul || detail?.status !== 'disetujui') return undefined
    let alive = true
    laporanApi
      .getMy({ jenis: detail.jenis, limit: 100 })
      .then((r) => alive && setLaporan((r.data.data || []).find((l) => l.proposalId === detail.id) || null))
      .catch(() => alive && setLaporan(null))
    return () => {
      alive = false
    }
  }, [sebagaiPengusul, detail])

  const isStmik = roles[0] === 'ketua_stmik'
  const kembali = isDosen || roles[0] === 'mahasiswa' ? `/kegiatan/${jenis}` : isStmik ? '/pemantauan' : '/proposals'
  const kembaliLabel = roles[0] === 'mahasiswa' ? null : isDosen ? `Status ${JENIS_LABEL[jenis]}` : isStmik ? 'Pemantauan Proposal' : 'Proposal Kegiatan'

  if (state.status !== 'ready') {
    return (
      <div className="page space-y-6">
        {state.status === 'loading' ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200/70" />
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : (
          <section className="card px-6 py-12 text-center">
            <h1 className="text-lg font-semibold text-navy-950">
              {state.status === 'forbidden' ? 'Anda tidak memiliki akses ke kegiatan ini' : 'Kegiatan tidak dapat dimuat'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Kegiatan mungkin sudah dihapus atau Anda bukan bagian dari timnya.</p>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary btn-sm mt-4">
              Kembali
            </button>
          </section>
        )}
      </div>
    )
  }

  const bisaUbah = sebagaiPengusul && (detail.status === 'draft' || detail.status === 'revisi')
  const anggota = detail.anggota || []
  const belumSetuju = anggota.filter((a) => a.statusUndangan !== 'diterima')
  // Dosen yang diundang (belum menjawab) boleh membaca seluruh kegiatan (W-41); tautkan ke undangannya.
  const undanganSaya = sebagaiPengusul ? null : anggota.find((a) => (a.user?.id ?? a.userId) === user?.id && a.statusUndangan === 'pending')
  const isPengabdian = detail.jenis === 'pengabdian'

  const ajukan = async () => {
    if (belumSetuju.length > 0) return
    const ok = await confirmDialog({
      title: 'Ajukan proposal?',
      message: 'Proposal akan dikirim ke LPPM untuk direview dan tidak dapat diubah sampai ada keputusan revisi.',
      confirmText: 'Ya, ajukan',
    })
    if (!ok) return
    setSubmitting(true)
    try {
      await proposalDosenApi.submit(detail.id)
      reload()
    } catch (e) {
      alertDialog({ title: 'Proposal belum dapat diajukan', message: e.response?.data?.message || 'Coba lagi.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page space-y-6">
      {/* Breadcrumb + kembali */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {kembaliLabel ? (
          <Link to={kembali} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {kembaliLabel}
          </Link>
        ) : (
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Kembali
          </button>
        )}
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li className="text-slate-500">Kegiatan {JENIS_LABEL[detail.jenis]}</li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">Detail</li>
          </ol>
        </nav>
      </div>

      {/* Kepala: judul, status, tahapan, aksi */}
      <header className="card space-y-5 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-tag">{JENIS_LABEL[detail.jenis] || detail.jenis}</span>
              <span className={`badge ${STATUS_COLOR[detail.status] || 'badge-neutral'}`}>{STATUS_LABEL[detail.status] || detail.status}</span>
              {!sebagaiPengusul ? <span className="badge badge-neutral">Baca saja</span> : null}
            </div>
            <h1 className="mt-2 font-serif text-2xl font-medium leading-snug text-navy-950 sm:text-3xl">{detail.judul}</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Ketua pengusul: <span className="font-medium text-slate-700">{nama(detail.pengusul)}</span>
              {detail.periode ? ` · ${detail.periode.nama}` : ''} · ID #{detail.id}
            </p>
          </div>
          {sebagaiPengusul ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              {bisaUbah ? (
                <>
                  <Link to={`/kegiatan/${detail.jenis}/usulan/${detail.id}`} className="btn btn-secondary">
                    Lanjutkan {detail.status === 'revisi' ? 'revisi' : 'draf'}
                  </Link>
                  <button
                    type="button"
                    onClick={ajukan}
                    disabled={submitting || belumSetuju.length > 0}
                    title={belumSetuju.length > 0 ? 'Semua anggota harus menerima undangan sebelum proposal diajukan.' : undefined}
                    className="btn btn-primary"
                  >
                    <Send className="size-4" aria-hidden="true" />
                    {submitting ? 'Mengajukan…' : 'Ajukan proposal'}
                  </button>
                </>
              ) : null}
              {detail.status === 'disetujui' && laporan !== undefined ? (
                laporan ? (
                  <Link to={`/kegiatan/${detail.jenis}/laporan/${laporan.id}`} className="btn btn-primary">
                    Buka laporan
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link to={`/kegiatan/${detail.jenis}/laporan/baru`} className="btn btn-primary">
                    Kirim laporan
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <Tahapan tahapan={detail.tahapan} status={detail.status} />

        {bisaUbah && belumSetuju.length > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {belumSetuju.length} anggota belum menerima undangan. Proposal dapat diajukan setelah semua anggota menerima.
          </p>
        ) : null}
        {detail.catatanRevisi ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Catatan revisi dari LPPM</p>
            <p className="mt-1 whitespace-pre-line text-sm text-amber-900">{detail.catatanRevisi}</p>
          </div>
        ) : null}
        {undanganSaya ? (
          <div className="flex flex-col gap-3 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-navy-900">
              Anda diundang sebagai <span className="font-semibold capitalize">{undanganSaya.peran || 'anggota'}</span> kegiatan ini. Seluruh
              informasi dan dokumen bisa dibaca sebelum Anda menjawab undangan.
            </p>
            <Link to={`/undangan/${undanganSaya.id}`} className="btn btn-primary btn-sm shrink-0">
              Tanggapi undangan
            </Link>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Kolom utama */}
        <div className="min-w-0 space-y-6">
          <Section icon={FileText} title="Abstrak">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{detail.abstrak || '—'}</p>
          </Section>

          <Section icon={ClipboardList} title="Informasi kegiatan">
            <Fields
              items={[
                { label: 'Periode', value: detail.periode ? `${detail.periode.nama}${detail.periode.tahun ? ` (${detail.periode.tahun})` : ''}` : '—' },
                { label: 'Skema', value: detail.skema || '—', hidden: isPengabdian },
                { label: 'Rumpun ilmu', value: detail.rumpunIlmu || '—' },
                { label: 'Bidang', value: detail.bidang || '—' },
                { label: 'Anggaran', value: rupiah(detail.anggaran) },
                { label: 'Ringkasan target luaran', value: detail.luaran || '—' },
                {
                  label: 'Kata kunci',
                  wide: true,
                  value:
                    (detail.kataKunci || []).length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {detail.kataKunci.map((k) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            <Tag className="size-3" aria-hidden="true" />
                            {k}
                          </span>
                        ))}
                      </span>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          </Section>

          {isPengabdian ? (
            <Section icon={Handshake} title="Mitra">
              <Fields
                items={[
                  { label: 'Nama mitra', value: detail.mitra || '—' },
                  { label: 'Jenis mitra', value: detail.mitraJenis || '—' },
                  { label: 'Kontak', value: detail.mitraKontak || '—' },
                  { label: 'Alamat', value: detail.mitraAlamat || '—' },
                  { label: 'Pernyataan kebutuhan', value: detail.mitraKebutuhan || '—', wide: true },
                ]}
              />
            </Section>
          ) : null}

          <Section icon={ClipboardList} title="Target & capaian luaran">
            <LuaranCapaian proposalId={detail.id} />
          </Section>

          <Section icon={ClipboardList} title="Hasil review">
            <ReviewList reviews={detail.reviews} onlyDone={!sebagaiPengusul && roles[0] === 'mahasiswa'} />
          </Section>

          {/* Pengusul: kelola. Anggota tim, dosen yang diundang & pengelola: lihat/unduh saja (backend menolak tulis). */}
          <Section icon={FileText} title="Dokumen lampiran">
            <DokumenTab
              proposalId={detail.id}
              dokumenLampiran={detail.dokumenLampiran || []}
              status={detail.status}
              onRefresh={reload}
              readOnly={!sebagaiPengusul}
            />
          </Section>
          {detail.status === 'disetujui' ? (
            <Section icon={FileText} title="Laporan kemajuan & akhir">
              <LaporanTab proposalId={detail.id} laporan={detail.laporan || []} status={detail.status} onRefresh={reload} readOnly={!sebagaiPengusul} />
            </Section>
          ) : null}
        </div>

        {/* Kolom samping */}
        <aside className="min-w-0 space-y-6">
          <Section icon={Users} title={`Tim (${anggota.length + 1} orang)`}>
            <ul className="space-y-3">
              <li className="flex items-start justify-between gap-3">
                <UserAvatar user={detail.pengusul} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{nama(detail.pengusul)}</span>
                  <span className="block truncate text-xs text-slate-500">{detail.pengusul?.email || 'Ketua pengusul'}</span>
                </span>
                <span className="badge badge-info shrink-0">Ketua</span>
              </li>
              {anggota.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
                  <UserAvatar user={a.user || { id: a.userId }} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{nama(a.user)}</span>
                    <span className="block truncate text-xs capitalize text-slate-500">
                      {a.peran || 'anggota'}
                      {a.user?.noHp || a.user?.kontak ? ` · ${a.user.noHp || a.user.kontak}` : ''}
                    </span>
                  </span>
                  <span className={`badge shrink-0 ${UNDANGAN_COLOR[a.statusUndangan] || 'badge-neutral'}`}>
                    {a.statusUndangan === 'diterima' ? 'Diterima' : a.statusUndangan === 'ditolak' ? 'Ditolak' : 'Menunggu'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section icon={FileText} title="Dokumen utama">
            {detail.dokumenNama ? (
              <div className="space-y-3">
                <p className="break-words text-sm font-medium text-slate-900">{detail.dokumenNama}</p>
                {detail.dokumenUkuran ? <p className="text-xs text-slate-500">{(detail.dokumenUkuran / 1024).toFixed(1)} KB</p> : null}
                <button type="button" onClick={() => bukaDokumenUtama(detail.id, detail.dokumenNama)} className="btn btn-secondary btn-sm w-full">
                  <Download className="size-4" aria-hidden="true" />
                  Buka dokumen
                </button>
              </div>
            ) : detail.dokumenUrl ? (
              <a href={detail.dokumenUrl} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-navy-700 hover:text-navy-900">
                {detail.dokumenUrl}
              </a>
            ) : (
              <p className="text-sm text-slate-500">Belum ada dokumen utama.</p>
            )}
          </Section>

          <Section icon={CalendarDays} title="Riwayat waktu">
            <Fields
              items={[
                { label: 'Dibuat', value: hari(detail.createdAt), wide: true },
                { label: 'Diajukan', value: hari(detail.submittedAt), wide: true },
                { label: 'Disetujui', value: hari(detail.approvedAt), wide: true, hidden: !detail.approvedAt },
                { label: 'Terakhir diperbarui', value: hari(detail.updatedAt), wide: true },
              ]}
            />
          </Section>
        </aside>
      </div>
    </div>
  )
}
