import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, ClipboardCheck, ClipboardList, Download, FileText, Handshake, Tag, UserPlus, Users } from 'lucide-react'
import { proposalApi } from '../api/proposal'
import { usersApi } from '../api/users'
import UserAvatar from '../components/UserAvatar'
import BebanReviewer from '../components/BebanReviewer'
import HapusDokumen from '../components/HapusDokumen'
import useAuthStore from '../store/authStore'
import { getRoleNames } from '../utils/roles'
import { alertDialog, confirmDialog } from '../utils/dialog'
import { bukaDokumenUtama } from '../utils/dokumenUtama'
import { Fields, Section } from './KegiatanDetailPage'
import { DokumenTab } from './ProposalDosen/DokumenTab'
import { LaporanTab } from './ProposalDosen/LaporanTab'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'
import { ReviewList } from './laporan/shared'
import Breadcrumb from '../components/Breadcrumb'
import useJejakMenu from '../hooks/useJejakMenu'
import LuaranCapaian from './laporan/LuaranCapaian'

// ---------------------------------------------------------------------------
// Detail Proposal Kegiatan untuk Ketua LPPM / Admin (/proposals/detail/:id) — halaman,
// bukan modal (menggantikan dialog "Detail Proposal" & "Ubah Status" di /proposals;
// ?detail=<id> dialihkan ke sini). GET /proposals/:id; Ketua: tugaskan/hapus reviewer
// (POST/DELETE /proposals/:id/reviewers, hanya diajukan/review, kandidat urut beban),
// keputusan status (PATCH /proposals/:id/status; disetujui = final). Admin: lihat + hapus
// dengan izin Ketua (HapusDokumen). Reviewer memakai halaman lain (pages/review/).
// ---------------------------------------------------------------------------

const KEPUTUSAN = ['review', 'revisi', 'disetujui', 'ditolak']
const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
const rupiah = (v) => (v || v === 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')
const nama = (u) => u?.fullName || u?.name || '—'
const pesan = (e, f) => {
  const errs = e.response?.data?.errors
  return errs ? Object.values(errs).flat().join(' ') : e.response?.data?.message || f
}

export default function ProposalMasukDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const viewOnly = getRoleNames(useAuthStore((s) => s.user)?.roles)[0] === 'admin'
  const induk = useJejakMenu('akademik')
  const [state, setState] = useState({ status: 'loading', detail: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [catatan, setCatatan] = useState('')
  const [kandidat, setKandidat] = useState(null)
  const [picked, setPicked] = useState([])

  useEffect(() => {
    let alive = true
    proposalApi
      .getById(id)
      .then((r) => {
        if (!alive) return
        setState({ status: 'ready', detail: r.data.data })
        setCatatan(r.data.data.catatanRevisi || '')
      })
      .catch((e) => alive && setState({ status: e.response?.status === 404 ? 'notfound' : 'error', detail: null }))
    return () => {
      alive = false
    }
  }, [id, tick])

  const d = state.detail

  // "Ubah Status" dari daftar membuka #keputusan → gulir ke form keputusan setelah dimuat.
  const { hash } = useLocation()
  useEffect(() => {
    if (state.status === 'ready' && hash === '#keputusan') document.getElementById('keputusan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [state.status, hash])

  const bukaPicker = async () => {
    setPicked([])
    try {
      const r = await usersApi.getKandidatReviewer({ itemId: d.id })
      const terlibat = new Set([d.pengusul?.id, ...(d.anggota || []).map((a) => a.user?.id ?? a.userId)].filter(Boolean))
      setKandidat((r.data.data || []).filter((k) => !k.sudahDitugaskan && !terlibat.has(k.id)))
    } catch {
      setKandidat([])
    }
  }

  const tugaskan = async () => {
    if (picked.length === 0) return
    setBusy(true)
    setMsg(null)
    try {
      await proposalApi.tugaskanReviewer(d.id, { reviewerIds: picked })
      setKandidat(null)
      setMsg({ ok: true, text: 'Reviewer ditugaskan. Status proposal menjadi Review.' })
      reload()
    } catch (e) {
      setMsg({ ok: false, text: pesan(e, 'Gagal menugaskan reviewer.') })
    } finally {
      setBusy(false)
    }
  }

  const hapusReviewer = async (reviewerId) => {
    if (!(await confirmDialog({ tone: 'danger', title: 'Hapus tugasan reviewer?', message: 'Reviewer ini tidak lagi ditugaskan menilai proposal.', confirmText: 'Ya, hapus' }))) return
    setBusy(true)
    try {
      await proposalApi.hapusReviewer(d.id, reviewerId)
      reload()
    } catch (e) {
      setMsg({ ok: false, text: pesan(e, 'Gagal menghapus tugasan.') })
    } finally {
      setBusy(false)
    }
  }

  const putuskan = async (e) => {
    e.preventDefault()
    if (!status) return
    if ((status === 'revisi' || status === 'ditolak') && !catatan.trim()) {
      setMsg({ ok: false, text: 'Catatan wajib diisi untuk revisi/ditolak.' })
      return
    }
    if (status === 'disetujui' && !(await confirmDialog({ title: 'Setujui proposal?', message: 'Status disetujui bersifat final dan tidak dapat diubah lagi.', confirmText: 'Setujui' }))) return
    setBusy(true)
    setMsg(null)
    try {
      await proposalApi.updateStatus(d.id, { status, ...(status !== 'review' && catatan.trim() ? { catatanRevisi: catatan.trim() } : {}) })
      setMsg({ ok: true, text: `Status proposal diubah menjadi ${STATUS_LABEL[status]}.` })
      setStatus('')
      reload()
    } catch (err) {
      alertDialog({ title: 'Gagal memperbarui status', message: pesan(err, 'Silakan coba lagi.') })
    } finally {
      setBusy(false)
    }
  }

  const kembali = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to="/proposals" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Proposal Kegiatan
      </Link>
      <Breadcrumb items={[...induk, { label: 'Dokumen Masuk' }, { label: 'Proposal Kegiatan', to: '/proposals' }, { label: 'Detail' }]} />
    </div>
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
          <h1 className="text-lg font-semibold text-navy-950">{state.status === 'notfound' ? 'Proposal tidak ditemukan' : 'Proposal tidak dapat dimuat'}</h1>
          <p className="mt-1 text-sm text-slate-500">Proposal mungkin sudah dihapus.</p>
        </section>
      </div>
    )
  }

  const anggota = d.anggota || []
  const tugasan = d.reviewerTugasan || []
  const canAssign = !viewOnly && (d.status === 'diajukan' || d.status === 'review')
  const canDecide = !viewOnly && d.status !== 'draft' && d.status !== 'disetujui'

  return (
    <div className="page rise space-y-6">
      {kembali}

      <header className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-tag">{JENIS_LABEL[d.jenis] || d.jenis}</span>
          <span className={`badge ${STATUS_COLOR[d.status] || 'badge-neutral'}`}>{STATUS_LABEL[d.status] || d.status}</span>
          {d.tahapan?.label ? <span className="badge badge-plain">Tahap {d.tahapan.urutan}/4 · {d.tahapan.label}</span> : null}
          {viewOnly ? <span className="badge badge-neutral">Lihat & hapus (Admin)</span> : null}
        </div>
        <h1 className="font-serif text-2xl font-medium leading-snug text-navy-950 sm:text-3xl">{d.judul}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <UserAvatar user={d.pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
          Ketua pengusul: <span className="font-medium text-slate-800">{nama(d.pengusul)}</span>
          {d.periode ? <span>· {d.periode.nama}</span> : null}
          <span>· ID #{d.id}</span>
        </p>
        {msg ? (
          <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border px-3.5 py-2.5 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {msg.text}
          </p>
        ) : null}
        {d.catatanRevisi ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Catatan untuk pengusul</p>
            <p className="mt-1 whitespace-pre-line text-sm text-amber-900">{d.catatanRevisi}</p>
          </div>
        ) : null}
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

          <Section icon={ClipboardList} title="Target & capaian luaran">
            <LuaranCapaian proposalId={d.id} />
          </Section>

          <Section icon={ClipboardCheck} title="Hasil review">
            <ReviewList reviews={d.reviews} />
          </Section>

          <Section icon={FileText} title="Dokumen lampiran">
            <DokumenTab proposalId={d.id} dokumenLampiran={d.dokumenLampiran || []} status={d.status} readOnly />
          </Section>

          {d.status === 'disetujui' ? (
            <Section icon={FileText} title="Laporan kemajuan & akhir">
              <LaporanTab proposalId={d.id} laporan={d.laporan || []} status={d.status} readOnly />
            </Section>
          ) : null}

          {viewOnly ? (
            <Section icon={ClipboardCheck} title="Akses Admin">
              <p className="mb-3 text-sm text-slate-600">Admin hanya dapat melihat dan menghapus. Penugasan reviewer dan keputusan dilakukan Ketua LPPM.</p>
              <HapusDokumen
                tipe="proposal"
                id={d.id}
                status={d.status}
                noun="proposal"
                judul={d.judul}
                onDelete={async () => {
                  await proposalApi.delete(d.id)
                  navigate('/proposals')
                }}
              />
            </Section>
          ) : (
            <section id="keputusan" className="scroll-mt-6">
              <Section icon={ClipboardCheck} title="Keputusan">
                {canDecide ? (
                  <form onSubmit={putuskan} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
                      <div>
                        <label htmlFor="pm-status" className="label">
                          Ubah status ke
                        </label>
                        <select id="pm-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                          <option value="">-- Pilih --</option>
                          {KEPUTUSAN.filter((s) => s !== d.status).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="pm-catatan" className="label">
                          Catatan untuk pengusul
                        </label>
                        <textarea
                          id="pm-catatan"
                          rows={4}
                          className="input resize-y"
                          value={catatan}
                          onChange={(e) => setCatatan(e.target.value)}
                          disabled={status === 'review'}
                          placeholder="Wajib untuk revisi/ditolak"
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={busy || !status}>
                      {busy ? 'Menyimpan…' : 'Simpan keputusan'}
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-slate-500">
                    {d.status === 'disetujui' ? 'Proposal sudah disetujui. Status final dan tidak dapat diubah lagi.' : 'Proposal masih draft dan belum diajukan pengusul.'}
                  </p>
                )}
              </Section>
            </section>
          )}
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

          <Section
            icon={UserPlus}
            title={`Reviewer (${tugasan.length})`}
            action={
              canAssign ? (
                <button type="button" onClick={bukaPicker} className="btn btn-secondary btn-sm" disabled={busy}>
                  Tugaskan
                </button>
              ) : null
            }
          >
            {tugasan.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada reviewer ditugaskan.</p>
            ) : (
              <ul className="space-y-3">
                {tugasan.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <UserAvatar user={t.reviewer || { id: t.reviewerId }} className="size-8 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{nama(t.reviewer)}</span>
                      <span className="block text-xs text-slate-500">Ditugaskan {hari(t.createdAt)}</span>
                    </span>
                    {canAssign ? (
                      <button type="button" onClick={() => hapusReviewer(t.reviewerId ?? t.reviewer?.id)} className="btn btn-ghost btn-sm text-red-700" disabled={busy}>
                        Hapus
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {kandidat ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {kandidat.length === 0 ? (
                  <p className="text-sm text-slate-500">Tidak ada reviewer lain yang tersedia.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto" data-lenis-prevent>
                    {kandidat.map((k) => (
                      <li key={k.id}>
                        <label className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-white">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-navy-700"
                            checked={picked.includes(k.id)}
                            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, k.id] : p.filter((x) => x !== k.id)))}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-900">{nama(k)}</span>
                            <BebanReviewer kandidat={k} />
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={tugaskan} disabled={busy || picked.length === 0} className="btn btn-primary btn-sm">
                    Tugaskan ({picked.length})
                  </button>
                  <button type="button" onClick={() => setKandidat(null)} className="btn btn-ghost btn-sm">
                    Batal
                  </button>
                </div>
              </div>
            ) : null}
          </Section>

          <Section icon={Users} title={`Tim (${anggota.length + 1} orang)`}>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <UserAvatar user={d.pengusul} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{nama(d.pengusul)}</span>
                  <span className="block truncate text-xs text-slate-500">{d.pengusul?.email || 'Ketua pengusul'}</span>
                </span>
                <span className="badge badge-info shrink-0">Ketua</span>
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
                { label: 'Dibuat', value: hari(d.createdAt), wide: true },
                { label: 'Diajukan', value: hari(d.submittedAt), wide: true },
                { label: 'Disetujui', value: hari(d.approvedAt), wide: true, hidden: !d.approvedAt },
                { label: 'Terakhir diperbarui', value: hari(d.updatedAt), wide: true },
              ]}
            />
          </Section>
        </aside>
      </div>
    </div>
  )
}
