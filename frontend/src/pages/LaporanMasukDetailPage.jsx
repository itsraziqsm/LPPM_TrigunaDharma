import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { laporanApi } from '../api/laporan'
import { usersApi } from '../api/users'
import { JENIS_LABEL, STATUS_LABEL } from './ProposalDosen/constants'
import { DokumenLaporan, InfoTable, Message, ReviewList, StatusBadge } from './laporan/shared'
import LuaranCapaian from './laporan/LuaranCapaian'
import { rupiah, tanggal } from './laporan/format'
import { confirmDialog } from '../utils/dialog'
import { getRoleNames } from '../utils/roles'
import useAuthStore from '../store/authStore'
import UserAvatar from '../components/UserAvatar'
import HapusDokumen from '../components/HapusDokumen'
import Breadcrumb from '../components/Breadcrumb'
import useJejakMenu from '../hooks/useJejakMenu'
import BebanReviewer from '../components/BebanReviewer'

// ---------------------------------------------------------------------------
// Detail Laporan Kegiatan untuk Ketua LPPM / Admin (/laporan-masuk/detail/:id) — halaman,
// bukan modal (dulu panel di /laporan-masuk?id=, kini dialihkan ke sini). GET /laporan/:id,
// tugaskan/hapus reviewer (Ketua), keputusan status (PATCH /laporan/:id/status, Ketua),
// Admin: lihat + hapus dengan izin Ketua (HapusDokumen).
// ---------------------------------------------------------------------------

const KEPUTUSAN = ['review', 'revisi', 'disetujui', 'ditolak']

function errorText(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}

// viewOnly (Admin): lihat saja + hapus dengan izin; tugaskan reviewer & keputusan = Ketua.
export default function LaporanMasukDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Admin (peran pertama): lihat & hapus saja; Ketua mengelola reviewer & keputusan.
  const viewOnly = getRoleNames(useAuthStore((st) => st.user)?.roles)[0] === 'admin'
  const induk = useJejakMenu('akademik')
  const onClose = () => navigate('/laporan-masuk')
  const onChanged = () => {}
  const [laporan, setLaporan] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [catatan, setCatatan] = useState('')
  const [reviewers, setReviewers] = useState(null)
  const [picked, setPicked] = useState([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    laporanApi
      .getById(id)
      .then((r) => {
        if (!alive) return
        setLaporan(r.data.data)
        setCatatan(r.data.data.catatanRevisi || '')
      })
      .catch((e) => alive && setError(errorText(e, 'Laporan gagal dimuat.')))
    return () => {
      alive = false
    }
  }, [id, tick])

  const reload = () => {
    setTick((t) => t + 1)
    onChanged()
  }

  const openReviewerPicker = async () => {
    setPicked([])
    try {
      // Urut beban (W-32): tanpa tugasan aktif dulu; pengusul sudah dikeluarkan backend.
      const r = await usersApi.getKandidatReviewer({ itemId: laporan.id })
      const assigned = new Set((laporan.reviewerTugasan || []).map((t) => t.reviewerId ?? t.reviewer?.id))
      setReviewers((r.data.data || []).filter((u) => !u.sudahDitugaskan && u.id !== laporan.pengusul?.id && !assigned.has(u.id)))
    } catch {
      setReviewers([])
    }
  }

  const assign = async () => {
    if (picked.length === 0) return
    setBusy(true)
    setMsg(null)
    try {
      await laporanApi.assignReviewers(laporan.id, picked)
      setReviewers(null)
      setMsg({ type: 'success', text: 'Reviewer ditugaskan. Status laporan menjadi Review.' })
      reload()
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Gagal menugaskan reviewer.') })
    } finally {
      setBusy(false)
    }
  }

  const unassign = async (reviewerId) => {
    if (!(await confirmDialog({ tone: 'danger', title: 'Hapus tugasan reviewer?', message: 'Reviewer ini tidak lagi ditugaskan menilai laporan.', confirmText: 'Ya, hapus' }))) return
    setBusy(true)
    try {
      await laporanApi.removeReviewer(laporan.id, reviewerId)
      reload()
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Gagal menghapus tugasan.') })
    } finally {
      setBusy(false)
    }
  }

  const decide = async (e) => {
    e.preventDefault()
    if (!status) return
    if ((status === 'revisi' || status === 'ditolak') && !catatan.trim()) {
      setMsg({ type: 'error', text: 'Tuliskan catatan untuk keputusan revisi/ditolak.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await laporanApi.updateStatus(laporan.id, { status, ...(status !== 'review' && catatan.trim() ? { catatanRevisi: catatan.trim() } : {}) })
      setMsg({ type: 'success', text: `Status laporan diubah menjadi ${STATUS_LABEL[status]}.` })
      setStatus('')
      reload()
    } catch (err) {
      setMsg({ type: 'error', text: errorText(err, 'Gagal mengubah status.') })
    } finally {
      setBusy(false)
    }
  }

  const canAssign = !viewOnly && laporan && (laporan.status === 'diajukan' || laporan.status === 'review')
  // Laporan yang sudah disetujui berstatus final: status tidak bisa diubah lagi.
  const canDecide = !viewOnly && laporan && laporan.status !== 'draft' && laporan.status !== 'disetujui'

  return (
    <div className="page rise space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/laporan-masuk" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Laporan Kegiatan
        </Link>
        <Breadcrumb items={[...induk, { label: 'Dokumen Masuk' }, { label: 'Laporan Kegiatan', to: '/laporan-masuk' }, { label: 'Detail' }]} />
      </div>

      <header className="card p-6">
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="badge badge-tag">Laporan {JENIS_LABEL[laporan?.jenis] || ''}</span>
          {laporan ? <StatusBadge status={laporan.status} /> : null}
          {viewOnly ? <span className="badge badge-neutral">Lihat & hapus (Admin)</span> : null}
        </p>
        <h1 className="mt-2 break-words font-serif text-2xl font-medium leading-snug text-navy-950 sm:text-3xl">{laporan?.judul || 'Memuat…'}</h1>
        {laporan ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <UserAvatar user={laporan.pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
            Pengusul: <span className="font-medium text-slate-800">{laporan.pengusul?.fullName || laporan.pengusul?.name || '—'}</span>
            {laporan.periode?.nama ? <span>· {laporan.periode.nama}</span> : null}
          </p>
        ) : null}
      </header>

        <div className="card space-y-6 p-6">
          {error ? <Message msg={{ type: 'error', text: error }} /> : null}
          <Message msg={msg} />
          {!laporan ? (
            !error ? <span className="spinner mx-auto block text-navy-600" aria-hidden="true" /> : null
          ) : (
            <>
              <InfoTable
                rows={[
                  ['Pengusul', `${laporan.pengusul?.fullName || laporan.pengusul?.name || '—'}${laporan.pengusul?.nidn ? ` · NIDN ${laporan.pengusul.nidn}` : ''}`],
                  ['Periode', laporan.periode?.nama],
                  ['Diajukan', tanggal(laporan.submittedAt)],
                  ['Kata kunci', (laporan.kataKunci || []).join(', ') || '—'],
                  ...(laporan.jenis === 'penelitian' ? [['Metode penelitian', laporan.metodePenelitian || '—']] : []),
                  ['Target luaran', laporan.luaran || '—'],
                  ['Luaran tercapai', laporan.luaranTercapai || '—'],
                  ['Ringkasan hasil', laporan.ringkasanHasil || '—'],
                  ['Anggaran / realisasi', `${rupiah(laporan.anggaran)} / ${rupiah(laporan.realisasiAnggaran)}`],
                  ['Dokumen', <DokumenLaporan key="d" laporan={laporan} />],
                ]}
              />

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-navy-950">Reviewer</h3>
                  {canAssign ? (
                    <button type="button" onClick={openReviewerPicker} className="btn btn-secondary btn-sm" disabled={busy}>
                      <UserPlus className="size-4" aria-hidden="true" />
                      Tugaskan reviewer
                    </button>
                  ) : null}
                </div>
                {(laporan.reviewerTugasan || []).length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada reviewer.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {laporan.reviewerTugasan.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2"><UserAvatar user={t.reviewer || { id: t.reviewerId }} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" /><span className="truncate">{t.reviewer?.fullName || t.reviewer?.name}</span></span>
                        {viewOnly ? null : (
                          <button type="button" onClick={() => unassign(t.reviewerId ?? t.reviewer?.id)} className="btn btn-ghost btn-sm text-red-700" disabled={busy}>
                            Hapus
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {reviewers ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    {reviewers.length === 0 ? (
                      <p className="text-sm text-slate-500">Tidak ada reviewer lain yang tersedia.</p>
                    ) : (
                      <ul className="max-h-56 space-y-1 overflow-y-auto">
                        {reviewers.map((u) => (
                          <li key={u.id}>
                            <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white">
                              <input
                                type="checkbox"
                                className="accent-navy-700"
                                checked={picked.includes(u.id)}
                                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))}
                              />
                              {u.fullName || u.name}
                              <span className="text-xs text-slate-500">{u.email}</span>
                              <span className="ml-auto">
                                <BebanReviewer kandidat={u} />
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={assign} disabled={busy || picked.length === 0} className="btn btn-primary btn-sm">
                        Tugaskan ({picked.length})
                      </button>
                      <button type="button" onClick={() => setReviewers(null)} className="btn btn-ghost btn-sm">
                        Batal
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-semibold text-navy-950">Capaian luaran</h3>
                <LuaranCapaian proposalId={laporan.proposalId} />
              </section>

              <section className="space-y-3">
                <h3 className="text-base font-semibold text-navy-950">Hasil review</h3>
                <ReviewList reviews={laporan.reviews} />
              </section>

              {viewOnly ? (
                <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-base font-semibold text-navy-950">Akses Admin</h3>
                  <p className="text-sm text-slate-600">
                    Admin hanya dapat melihat dan menghapus. Penugasan reviewer dan keputusan dilakukan Ketua LPPM.
                  </p>
                  <HapusDokumen
                    tipe="laporan"
                    id={laporan.id}
                    status={laporan.status}
                    noun="laporan"
                    judul={laporan.judul}
                    onDelete={async () => {
                      await laporanApi.remove(laporan.id)
                      onChanged()
                      onClose()
                    }}
                  />
                </section>
              ) : null}

              {canDecide ? (
                <form onSubmit={decide} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold text-navy-950">Keputusan</h3>
                  <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                    <div>
                      <label htmlFor="lm-status" className="label">
                        Ubah status ke
                      </label>
                      <select id="lm-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">-- Pilih --</option>
                        {KEPUTUSAN.filter((s) => s !== laporan.status).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="lm-catatan" className="label">
                        Catatan untuk pengusul
                      </label>
                      <textarea
                        id="lm-catatan"
                        rows={3}
                        className="input resize-y"
                        value={catatan}
                        onChange={(e) => setCatatan(e.target.value)}
                        disabled={status === 'review'}
                        placeholder="Wajib untuk revisi/ditolak"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={busy || !status}>
                    Simpan keputusan
                  </button>
                </form>
              ) : (
                <p className="text-sm text-slate-500">
                  {laporan.status === 'disetujui'
                    ? 'Laporan sudah disetujui. Status final dan tidak dapat diubah lagi.'
                    : 'Laporan masih draft dan belum diajukan pengusul.'}
                </p>
              )}
            </>
          )}
        </div>
    </div>
  )
}
