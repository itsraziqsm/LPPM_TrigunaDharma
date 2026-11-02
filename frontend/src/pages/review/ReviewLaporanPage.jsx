import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardCheck, ClipboardList, FileText } from 'lucide-react'
import { laporanApi } from '../../api/laporan'
import UserAvatar from '../../components/UserAvatar'
import { Section } from '../KegiatanDetailPage'
import { JENIS_LABEL } from '../ProposalDosen/constants'
import { DokumenLaporan, InfoTable, StatusBadge } from '../laporan/shared'
import LuaranCapaian from '../laporan/LuaranCapaian'
import { rupiah, tanggal } from '../laporan/format'
import { danaFinal, danaSementara } from '../../utils/danaKegiatan'
import ApiPending from '../../components/ApiPending'
import KartuPenilaian from './KartuPenilaian'
import { tautanForm } from '../../utils/rubrikReview'
import Breadcrumb from '../../components/Breadcrumb'
import { cariTugasan } from './cariTugasan'

// ---------------------------------------------------------------------------
// Detail laporan mode reviewer (/laporan-masuk/detail/:id) — menggantikan modal review
// laporan di Penugasan Review (tab Laporan). Data: GET /laporan/:id + tugasan saya dari
// GET /laporan/tugasan (myReview). Penilaian di halaman Form Penilaian
// (FormReviewPage, /penugasan/nilai/laporan/:id), hanya saat laporan berstatus `review`.
// ---------------------------------------------------------------------------

const nama = (u) => u?.fullName || u?.name || '—'

export default function ReviewLaporanPage() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'loading', laporan: null, tugasan: null })
  const [review, setReview] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      laporanApi.getById(id).then((r) => r.data.data),
      cariTugasan(laporanApi.getTugasan, (t) => String(t.laporanId ?? t.laporan?.id) === String(id)),
    ])
      .then(([laporan, tugasan]) => {
        if (!alive) return
        setState({ status: tugasan ? 'ready' : 'bukan-tugasan', laporan, tugasan })
        setReview(tugasan?.myReview || null)
      })
      .catch((e) => alive && setState({ status: e.response?.status === 403 ? 'forbidden' : 'error', laporan: null, tugasan: null }))
    return () => {
      alive = false
    }
  }, [id])


  const kembali = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to="/penugasan?tab=laporan" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Penugasan Review · Laporan
      </Link>
      <Breadcrumb items={[{ label: 'Penugasan Review', to: '/penugasan?tab=laporan' }, { label: 'Review Laporan' }]} />
    </div>
  )

  if (state.status === 'loading') {
    return (
      <div className="page space-y-4" aria-hidden="true">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200/70" />
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
            {state.status === 'bukan-tugasan' ? 'Laporan ini tidak ditugaskan kepada Anda' : state.status === 'forbidden' ? 'Anda tidak memiliki akses ke laporan ini' : 'Laporan tidak dapat dimuat'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Buka laporan dari daftar Penugasan Review.</p>
        </section>
      </div>
    )
  }

  const l = state.laporan
  const done = review?.isDone === true

  return (
    <div className="page rise space-y-6">
      {kembali}

      <header className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-tag">Laporan {JENIS_LABEL[l.jenis] || l.jenis}</span>
          <StatusBadge status={l.status} />
          <span className={`badge ${done ? 'badge-success' : review ? 'badge-warning' : 'badge-neutral'}`}>
            {done ? 'Review selesai' : review ? 'Draft penilaian' : 'Belum dinilai'}
          </span>
        </div>
        <h1 className="font-serif text-2xl font-medium leading-snug text-navy-950 sm:text-3xl">{l.judul}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <UserAvatar user={l.pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
          Pengusul: <span className="font-medium text-slate-800">{nama(l.pengusul)}</span>
          {l.periode ? <span>· {l.periode.nama}</span> : null}
          <span>· ditugaskan {tanggal(state.tugasan.createdAt)}</span>
        </p>
        <Link to={tautanForm('laporan', l.id)} className={`btn ${done || l.status !== 'review' ? 'btn-secondary' : 'btn-primary'} w-full sm:w-auto`}>
          <ClipboardCheck className="size-4" aria-hidden="true" />
          {done ? 'Lihat hasil penilaian' : 'Buka form penilaian'}
        </Link>
      </header>

      <Section icon={FileText} title="Isi laporan">
        <InfoTable
          rows={[
            ['Abstrak', l.abstrak],
            ['Rumpun ilmu', l.rumpunIlmu || '—'],
            ['Kata kunci', (l.kataKunci || []).join(', ') || '—'],
            ...(l.jenis === 'penelitian' ? [['Metode penelitian', l.metodePenelitian || '—']] : []),
            ['Target luaran', l.luaran || '—'],
            ['Luaran tercapai', l.luaranTercapai || '—'],
            ['Ringkasan hasil', l.ringkasanHasil || '—'],
            ['Dana disetujui / realisasi', <span key="dana">{danaFinal(l) == null ? '—' : rupiah(danaFinal(l))} / {rupiah(l.realisasiAnggaran)}{danaSementara(l) ? <ApiPending className="ml-1.5" /> : null}</span>],
            ['Dokumen', <DokumenLaporan key="d" laporan={l} />],
          ]}
        />
      </Section>

      <Section icon={ClipboardList} title="Capaian luaran">
        <LuaranCapaian proposalId={l.proposalId} />
      </Section>

      <KartuPenilaian tipe="laporan" id={l.id} review={review} terkunci={l.status !== 'review'} />
    </div>
  )
}
