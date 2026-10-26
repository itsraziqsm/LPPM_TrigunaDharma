import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, ClipboardCheck, ClipboardList, Download, FileText, Handshake, Tag, Users } from 'lucide-react'
import { proposalApi } from '../../api/proposal'
import { reviewerApi } from '../../api/reviewer'
import UserAvatar from '../../components/UserAvatar'
import { bukaDokumenUtama } from '../../utils/dokumenUtama'
import { Fields, Section } from '../KegiatanDetailPage'
import { DokumenTab } from '../ProposalDosen/DokumenTab'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from '../ProposalDosen/constants'
import LuaranCapaian from '../laporan/LuaranCapaian'
import FormPenilaian from './FormPenilaian'
import { cariTugasan } from './cariTugasan'

// ---------------------------------------------------------------------------
// Detail proposal mode reviewer (/proposals/detail/:id) — menggantikan modal "Form
// Penilaian Proposal" di Penugasan Review. Data: GET /proposals/:id (reviewer yang
// ditugaskan boleh membaca) + tugasan saya dari GET /reviewer/my-tugasan (myReview).
// Simpan: POST /proposals/:id/reviews; selesai: + /reviews/finalize.
// ---------------------------------------------------------------------------

const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
const rupiah = (v) => (v || v === 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')
const nama = (u) => u?.fullName || u?.name || '—'

export default function ReviewProposalPage() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'loading', detail: null, tugasan: null })
  const [review, setReview] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      proposalApi.getById(id).then((r) => r.data.data),
      cariTugasan(reviewerApi.getMyTugasan, (t) => String(t.proposalId ?? t.proposal?.id) === String(id)),
    ])
      .then(([detail, tugasan]) => {
        if (!alive) return
        setState({ status: tugasan ? 'ready' : 'bukan-tugasan', detail, tugasan })
        setReview(tugasan?.myReview || null)
      })
      .catch((e) => alive && setState({ status: e.response?.status === 403 ? 'forbidden' : 'error', detail: null, tugasan: null }))
    return () => {
      alive = false
    }
  }, [id])

  const simpan = useCallback(
    async (payload) => {
      await reviewerApi.submitReview(id, payload)
      setReview((r) => ({ ...(r || {}), ...payload, isDone: false }))
    },
    [id],
  )
  const selesaikan = useCallback(
    async (payload) => {
      await reviewerApi.submitReview(id, payload)
      await reviewerApi.finalizeReview(id)
      setReview((r) => ({ ...(r || {}), ...payload, isDone: true }))
    },
    [id],
  )

  const kembali = (
    <Link to="/penugasan" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Penugasan Review
    </Link>
  )

  if (state.status === 'loading') {
    return (
      <div className="page space-y-4" aria-hidden="true">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200/70" />
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      </div>
    )
  }
  if (state.status !== 'ready') {
    return (
      <div className="page space-y-6">
        {kembali}
        <section className="card px-6 py-12 text-center">
          <h1 className="text-lg font-semibold text-navy-950">
            {state.status === 'bukan-tugasan' ? 'Proposal ini tidak ditugaskan kepada Anda' : state.status === 'forbidden' ? 'Anda tidak memiliki akses ke proposal ini' : 'Proposal tidak dapat dimuat'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Buka proposal dari daftar Penugasan Review.</p>
        </section>
      </div>
    )
  }

  const d = state.detail
  const done = review?.isDone === true
  const anggota = d.anggota || []

  return (
    <div className="page rise space-y-6">
      {kembali}

      <header className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-tag">{JENIS_LABEL[d.jenis] || d.jenis}</span>
          <span className={`badge ${STATUS_COLOR[d.status] || 'badge-neutral'}`}>{STATUS_LABEL[d.status] || d.status}</span>
          <span className={`badge ${done ? 'badge-success' : review ? 'badge-warning' : 'badge-neutral'}`}>
            {done ? 'Review selesai' : review ? 'Draft penilaian' : 'Belum dinilai'}
          </span>
        </div>
        <h1 className="font-serif text-2xl font-medium leading-snug text-navy-950 sm:text-3xl">{d.judul}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <UserAvatar user={d.pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
          Ketua pengusul: <span className="font-medium text-slate-800">{nama(d.pengusul)}</span>
          {d.periode ? <span>· {d.periode.nama}</span> : null}
          <span>· ditugaskan {hari(state.tugasan.createdAt)}</span>
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section icon={FileText} title="Abstrak">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{d.abstrak || '—'}</p>
          </Section>

          <Section icon={ClipboardList} title="Informasi kegiatan">
            <Fields
              items={[
                { label: 'Periode', value: d.periode ? `${d.periode.nama}${d.periode.tahun ? ` (${d.periode.tahun})` : ''}` : '—' },
                { label: 'Skema', value: d.skema || '—', hidden: d.jenis === 'pengabdian' },
                { label: 'Rumpun ilmu', value: d.rumpunIlmu || '—' },
                { label: 'Bidang', value: d.bidang || '—' },
                { label: 'Anggaran', value: rupiah(d.anggaran) },
                { label: 'Ringkasan target luaran', value: d.luaran || '—' },
                {
                  label: 'Kata kunci',
                  wide: true,
                  value:
                    (d.kataKunci || []).length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {d.kataKunci.map((k) => (
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

          {d.jenis === 'pengabdian' ? (
            <Section icon={Handshake} title="Mitra">
              <Fields
                items={[
                  { label: 'Nama mitra', value: d.mitra || '—' },
                  { label: 'Jenis mitra', value: d.mitraJenis || '—' },
                  { label: 'Kontak', value: d.mitraKontak || '—' },
                  { label: 'Alamat', value: d.mitraAlamat || '—' },
                  { label: 'Pernyataan kebutuhan', value: d.mitraKebutuhan || '—', wide: true },
                ]}
              />
            </Section>
          ) : null}

          <Section icon={ClipboardList} title="Target luaran">
            <LuaranCapaian proposalId={d.id} />
          </Section>

          <Section icon={FileText} title="Dokumen lampiran">
            <DokumenTab proposalId={d.id} dokumenLampiran={d.dokumenLampiran || []} status={d.status} readOnly />
          </Section>

          <Section icon={ClipboardCheck} title={done ? 'Hasil penilaian Anda' : 'Form penilaian'}>
            <FormPenilaian
              key={done ? 'done' : 'edit'}
              review={review}
              done={done}
              onSave={simpan}
              onFinalize={selesaikan}
            />
          </Section>
        </div>

        <aside className="min-w-0 space-y-6">
          <Section icon={FileText} title="Dokumen utama">
            {d.dokumenNama ? (
              <div className="space-y-3">
                <p className="break-words text-sm font-medium text-slate-900">{d.dokumenNama}</p>
                {d.dokumenUkuran ? <p className="text-xs text-slate-500">{(d.dokumenUkuran / 1024).toFixed(1)} KB</p> : null}
                <button type="button" onClick={() => bukaDokumenUtama(d.id, d.dokumenNama)} className="btn btn-secondary btn-sm w-full">
                  <Download className="size-4" aria-hidden="true" />
                  Buka dokumen
                </button>
              </div>
            ) : d.dokumenUrl ? (
              <a href={d.dokumenUrl} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-navy-700 hover:text-navy-900">
                {d.dokumenUrl}
              </a>
            ) : (
              <p className="text-sm text-slate-500">Belum ada dokumen utama.</p>
            )}
          </Section>

          <Section icon={Users} title={`Tim (${anggota.length + 1} orang)`}>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <UserAvatar user={d.pengusul} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{nama(d.pengusul)}</span>
                  <span className="block truncate text-xs text-slate-500">Ketua pengusul</span>
                </span>
              </li>
              {anggota.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-t border-slate-100 pt-3">
                  <UserAvatar user={a.user || { id: a.userId }} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{nama(a.user)}</span>
                    <span className="block truncate text-xs capitalize text-slate-500">{a.peran || 'anggota'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section icon={CalendarDays} title="Riwayat waktu">
            <Fields
              items={[
                { label: 'Diajukan', value: hari(d.submittedAt), wide: true },
                { label: 'Ditugaskan kepada Anda', value: hari(state.tugasan.createdAt), wide: true },
                { label: 'Terakhir diperbarui', value: hari(d.updatedAt), wide: true },
              ]}
            />
          </Section>
        </aside>
      </div>
    </div>
  )
}
