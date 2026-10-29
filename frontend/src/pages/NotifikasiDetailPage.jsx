import { useEffect, useState } from 'react'
import Breadcrumb from '../components/Breadcrumb'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock, Trash2, UserRound } from 'lucide-react'
import { notificationApi } from '../api/notification'
import { proposalApi } from '../api/proposal'
import { laporanApi } from '../api/laporan'
import { periodeApi } from '../api/periode'
import useAuthStore from '../store/authStore'
import { confirmDialog } from '../utils/dialog'
import { notifyNotificationsChanged } from '../utils/notificationEvents'
import { DEFAULT_META, TYPE_META, getRoleNames, pengirimFor, targetFor } from '../utils/notifikasi'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'
import { timeAgo } from './dashboard/format'

// ---------------------------------------------------------------------------
// Detail Notifikasi (/notifikasi/:id), dibuka dari lonceng dan halaman Notifikasi.
// Notifikasi diambil dari state navigasi atau GET /notifications (tidak ada
// endpoint detail; dicari sampai 5 halaman × 100). Saat dibuka ditandai dibaca.
// Data terkait dimuat sesuai refType: proposal (GET /proposals/:id), laporan
// (GET /laporan/:id), periode (GET /periode/:id). "Dari" = pihak pemicu (lihat
// pengirimFor; backend tidak menyimpan pengirim).
// ---------------------------------------------------------------------------

const tanggalPanjang = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '—'
const jam = (v) => (v ? `${new Date(v).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB` : '—')
const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

async function cariNotifikasi(id) {
  for (let page = 1; page <= 5; page += 1) {
    const r = await notificationApi.getAll({ page, limit: 100 })
    const list = r.data.data || []
    const found = list.find((n) => String(n.id) === String(id))
    if (found) return found
    if (list.length < 100) break
  }
  return null
}

async function muatTerkait(n) {
  if (!n?.refId) return null
  if (n.refType === 'proposal') return { kind: 'proposal', data: (await proposalApi.getById(n.refId)).data.data }
  if (n.refType === 'laporan') return { kind: 'laporan', data: (await laporanApi.getById(n.refId)).data.data }
  if (n.refType === 'periode') return { kind: 'periode', data: (await periodeApi.getById(n.refId)).data.data }
  return null
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
      </div>
    </div>
  )
}

function Terkait({ related, state }) {
  if (state === 'loading') return <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
  if (state === 'error') return <p className="text-sm text-slate-500">Data terkait tidak dapat dimuat (mungkin sudah dihapus atau Anda tidak memiliki akses).</p>
  if (!related) return <p className="text-sm text-slate-500">Notifikasi ini tidak merujuk ke data tertentu.</p>
  const d = related.data || {}
  if (related.kind === 'periode') {
    return (
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs font-semibold text-slate-500">Periode</dt><dd className="mt-0.5 text-sm font-semibold text-slate-900">{d.nama}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Jenis</dt><dd className="mt-0.5 text-sm text-slate-900">{JENIS_LABEL[d.jenis] || d.jenis || '—'}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Tanggal</dt><dd className="mt-0.5 text-sm text-slate-900">{hari(d.tanggalMulai)} – {hari(d.tanggalSelesai)}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Status</dt><dd className="mt-0.5"><span className={`badge ${d.isAktif ? 'badge-success' : 'badge-neutral'}`}>{d.isAktif ? 'Aktif' : 'Nonaktif'}</span></dd></div>
      </dl>
    )
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-tag">{related.kind === 'laporan' ? 'Laporan' : 'Proposal'} {JENIS_LABEL[d.jenis] || ''}</span>
          {d.status ? <span className={`badge ${STATUS_COLOR[d.status] || 'badge-neutral'}`}>{STATUS_LABEL[d.status] || d.status}</span> : null}
        </div>
        <p className="mt-2 font-serif text-xl font-medium leading-snug text-navy-950">{d.judul || '—'}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs font-semibold text-slate-500">Pengusul</dt><dd className="mt-0.5 text-sm text-slate-900">{d.pengusul?.fullName || d.pengusul?.name || '—'}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Periode</dt><dd className="mt-0.5 text-sm text-slate-900">{d.periode?.nama || '—'}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Diajukan</dt><dd className="mt-0.5 text-sm text-slate-900">{hari(d.submittedAt)}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Terakhir diperbarui</dt><dd className="mt-0.5 text-sm text-slate-900">{hari(d.updatedAt)}</dd></div>
      </dl>
      {d.catatanRevisi ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-900">Catatan revisi</p>
          <p className="mt-1 whitespace-pre-line text-sm text-amber-900">{d.catatanRevisi}</p>
        </div>
      ) : null}
    </div>
  )
}

export default function NotifikasiDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const roles = getRoleNames(user?.roles)
  const fromState = location.state?.notif && String(location.state.notif.id) === String(id) ? location.state.notif : null
  const [notif, setNotif] = useState(fromState)
  const [status, setStatus] = useState(fromState ? 'ready' : 'loading')
  const [related, setRelated] = useState(null)
  const [relatedState, setRelatedState] = useState('loading')

  // Muat notifikasi (bila tidak dibawa lewat state) lalu tandai dibaca.
  useEffect(() => {
    let alive = true
    const load = fromState ? Promise.resolve(fromState) : cariNotifikasi(id)
    load
      .then((n) => {
        if (!alive) return
        if (!n) {
          setStatus('notfound')
          return
        }
        setNotif(n)
        setStatus('ready')
        if (!n.isRead) {
          notificationApi
            .markRead(n.id)
            .then(() => {
              if (alive) setNotif((x) => (x ? { ...x, isRead: true } : x))
              notifyNotificationsChanged('detail')
            })
            .catch(() => {})
        }
      })
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Data terkait (judul kegiatan, pengusul, status, periode).
  const refKey = notif ? `${notif.refType}:${notif.refId}` : null
  useEffect(() => {
    if (!notif) return undefined
    let alive = true
    setRelatedState('loading')
    muatTerkait(notif)
      .then((r) => {
        if (!alive) return
        setRelated(r)
        setRelatedState('ready')
      })
      .catch(() => alive && setRelatedState('error'))
    return () => {
      alive = false
    }
  }, [refKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const hapus = async () => {
    const ok = await confirmDialog({ tone: 'danger', title: 'Hapus notifikasi?', message: 'Notifikasi ini akan dihapus dari daftar Anda.', confirmText: 'Hapus' })
    if (!ok) return
    try {
      await notificationApi.delete(notif.id)
      notifyNotificationsChanged('detail')
      navigate('/notifikasi', { replace: true })
    } catch {
      /* biarkan di halaman */
    }
  }

  const back = (
    <Link to="/notifikasi" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-800">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Semua notifikasi
    </Link>
  )

  if (status !== 'ready') {
    return (
      <div className="page space-y-6">
        {back}
        {status === 'loading' ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
        ) : (
          <section className="card px-6 py-12 text-center">
            <h1 className="text-lg font-semibold text-navy-950">{status === 'notfound' ? 'Notifikasi tidak ditemukan' : 'Notifikasi gagal dimuat'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {status === 'notfound' ? 'Notifikasi mungkin sudah dihapus.' : 'Periksa koneksi Anda, lalu coba lagi.'}
            </p>
          </section>
        )}
      </div>
    )
  }

  const meta = TYPE_META[notif.type] || DEFAULT_META
  const Icon = meta.icon
  const target = targetFor(notif, roles)
  const pengirim = pengirimFor(notif, related?.data)

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <Breadcrumb items={[{ label: 'Notifikasi', to: '/notifikasi' }, { label: 'Detail' }]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {/* Isi utama */}
          <article className="card p-6">
            <div className="flex items-start gap-4">
              <span className={`grid size-12 shrink-0 place-items-center rounded-full ${meta.tone}`}>
                <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-tag">{meta.label}</span>
                  <span className={`badge ${notif.isRead ? 'badge-neutral' : 'badge-info'}`}>{notif.isRead ? 'Sudah dibaca' : 'Baru'}</span>
                </div>
                <h1 className="mt-2 font-serif text-2xl font-medium leading-snug text-navy-950">{notif.judul}</h1>
                <p className="mt-1 text-sm text-slate-500">{timeAgo(notif.createdAt)}</p>
              </div>
            </div>
            <p className="mt-5 whitespace-pre-line border-t border-slate-100 pt-5 text-base leading-relaxed text-slate-700">{notif.pesan}</p>
            {target ? (
              <Link to={target.to} className="btn btn-primary mt-6">
                {target.label}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </article>

          {/* Data terkait */}
          <section className="card overflow-hidden" aria-labelledby="notif-terkait">
            <header className="border-b border-slate-200 px-6 py-3.5">
              <h2 id="notif-terkait" className="text-base font-semibold text-navy-950">
                {related?.kind === 'periode' ? 'Periode terkait' : related?.kind === 'laporan' ? 'Laporan terkait' : 'Kegiatan terkait'}
              </h2>
            </header>
            <div className="px-6 py-5">
              <Terkait related={related} state={relatedState} />
            </div>
          </section>
        </div>

        {/* Informasi samping */}
        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="text-base font-semibold text-navy-950">Informasi</h2>
            <dl className="mt-4 space-y-4">
              <Row icon={UserRound} label="Dari">
                {relatedState === 'loading' && ['proposal_diajukan', 'laporan_diajukan', 'laporan_diunggah'].includes(notif.type) ? '…' : pengirim}
              </Row>
              <Row icon={CalendarDays} label="Tanggal">{tanggalPanjang(notif.createdAt)}</Row>
              <Row icon={Clock} label="Waktu">{jam(notif.createdAt)}</Row>
            </dl>
          </section>
          <button type="button" onClick={hapus} className="btn btn-ghost w-full text-red-700 hover:bg-red-50">
            <Trash2 className="size-4" aria-hidden="true" />
            Hapus notifikasi
          </button>
        </aside>
      </div>
    </div>
  )
}
