import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CircleCheck, FileText, PencilLine, Send, Trash2 } from 'lucide-react'
import { laporanApi } from '../api/laporan'
import useAuthStore from '../store/authStore'
import { JENIS_LABEL } from './ProposalDosen/constants'
import { DokumenLaporan, InfoTable, Message, ReviewList, StatusBadge } from './laporan/shared'
import LuaranCapaian from './laporan/LuaranCapaian'
import { rupiah, tanggal } from './laporan/format'

// ---------------------------------------------------------------------------
// Laporan kegiatan untuk pengusul (dosen/mahasiswa) — API /laporan (new-api.md).
//   /kegiatan/:jenis/laporan/baru  pilih proposal disetujui (GET /laporan/eligible)
//                                  lalu POST /laporan { proposalId } → draft
//   /kegiatan/:jenis/laporan/:id   index laporan: ringkasan isi, ajukan (submit),
//                                  hapus (draft), status & hasil review. Pengisian
//                                  lewat wizard /kegiatan/:jenis/laporan/:id/isi
//                                  (LaporanIsiPage, desain UI Laporan).
// Edit hanya saat draft/revisi dan hanya oleh pengusul; selain itu baca saja
// (anggota proposal asal juga boleh melihat).
// ---------------------------------------------------------------------------

const EDITABLE = ['draft', 'revisi']

function errorText(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}

function Breadcrumb({ jenis, last }) {
  const label = JENIS_LABEL[jenis] || 'Kegiatan'
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
            Home
          </Link>
        </li>
        <li aria-hidden="true" className="text-slate-400">/</li>
        <li>
          <Link to={`/kegiatan/${jenis}`} className="font-medium text-navy-600 hover:text-navy-800">
            {label}
          </Link>
        </li>
        <li aria-hidden="true" className="text-slate-400">/</li>
        <li aria-current="page" className="text-slate-500">{last}</li>
      </ol>
    </nav>
  )
}

// ── Buat laporan baru ───────────────────────────────────────────────────────
function LaporanBaru({ jenis }) {
  const navigate = useNavigate()
  const label = JENIS_LABEL[jenis] || 'Kegiatan'
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    laporanApi
      .getEligible()
      .then((r) => setItems((r.data.data || []).filter((p) => p.jenis === jenis)))
      .catch(() => setFailed(true))
  }, [jenis])

  const create = async (p) => {
    setBusyId(p.id)
    setMsg(null)
    try {
      const r = await laporanApi.create({ proposalId: p.id })
      navigate(`/kegiatan/${jenis}/laporan/${r.data.data.id}/isi`, { replace: true })
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Laporan gagal dibuat.') })
      setBusyId(null)
    }
  }

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="page-title">Laporan {label}</h1>
          <p className="page-desc">Pilih proposal yang sudah disetujui untuk dibuatkan laporannya. Satu proposal hanya punya satu laporan.</p>
        </div>
        <Breadcrumb jenis={jenis} last={`Laporan ${label}`} />
      </header>

      <Message msg={msg} />

      {failed ? (
        <section className="card px-6 py-10 text-center text-slate-600">Daftar proposal gagal dimuat.</section>
      ) : items === null ? (
        <section className="card px-6 py-10 text-center text-slate-500">
          <span className="spinner mx-auto text-navy-600" aria-hidden="true" />
        </section>
      ) : items.length === 0 ? (
        <section className="card px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-navy-50 text-navy-700">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-navy-950">Belum ada proposal yang bisa dilaporkan</h2>
          <p className="mx-auto mt-1.5 max-w-md text-base text-slate-500">
            Laporan dapat dibuat untuk proposal {label.toLowerCase()} yang sudah disetujui dan belum memiliki laporan. Laporan
            yang sudah ada dapat dibuka dari tab Laporan di Riwayat.
          </p>
          <Link to={`/kegiatan/${jenis}`} className="btn btn-secondary mt-5">
            Kembali ke Status {label}
          </Link>
        </section>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => (
            <li key={p.id} className="card flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{p.judul}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {p.periode?.nama || 'Tanpa periode'} · {rupiah(p.anggaran)} · disetujui {tanggal(p.approvedAt)}
                </p>
                {p.luaran ? <p className="mt-1 text-sm text-slate-600">Target luaran: {p.luaran}</p> : null}
              </div>
              <button type="button" onClick={() => create(p)} disabled={busyId !== null} className="btn btn-primary shrink-0">
                {busyId === p.id ? 'Membuat…' : 'Buat laporan'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Detail / isi laporan ────────────────────────────────────────────────────
function LaporanDetail({ id, jenis }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const [laporan, setLaporan] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(location.state?.flash || null)

  // Hapus pesan kilat dari riwayat navigasi agar tidak muncul lagi saat dimuat ulang.
  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    let alive = true
    laporanApi
      .getById(id)
      .then((r) => {
        if (!alive) return
        const l = r.data.data
        // Rute mengikuti jenis laporan yang sebenarnya (mis. dari tautan notifikasi).
        if (l.jenis && l.jenis !== jenis) {
          navigate(`/kegiatan/${l.jenis}/laporan/${l.id}`, { replace: true })
          return
        }
        setLaporan(l)
      })
      .catch((e) => alive && setLoadError(e.response?.status === 404 ? 'Laporan tidak ditemukan.' : errorText(e, 'Laporan gagal dimuat.')))
    return () => {
      alive = false
    }
  }, [id, jenis, navigate])

  const label = JENIS_LABEL[jenis] || 'Kegiatan'

  if (loadError || !laporan) {
    return (
      <div className="page space-y-6">
        <Breadcrumb jenis={jenis} last="Laporan" />
        <section className="card px-6 py-12 text-center">
          {loadError ? (
            <>
              <p className="text-base text-slate-600">{loadError}</p>
              <Link to={`/kegiatan/${jenis}`} className="btn btn-secondary mt-5">
                Kembali
              </Link>
            </>
          ) : (
            <span className="spinner mx-auto text-navy-600" aria-hidden="true" />
          )}
        </section>
      </div>
    )
  }

  const isOwner = laporan.pengusul?.id === user?.id
  const editable = isOwner && EDITABLE.includes(laporan.status)
  const adaDokumen = Boolean(laporan.dokumenNama || laporan.dokumenUrl)
  const isiUrl = `/kegiatan/${jenis}/laporan/${laporan.id}/isi`

  const submit = async () => {
    if (!laporan.luaranTercapai?.trim() || !adaDokumen) {
      return setMsg({ type: 'error', text: 'Lengkapi luaran tercapai dan dokumen laporan lewat tombol "Isi laporan" sebelum mengajukan.' })
    }
    if (!confirm('Ajukan laporan ini ke Ketua LPPM? Laporan tidak bisa diubah sampai ada keputusan revisi.')) return
    setBusy('submit')
    setMsg(null)
    try {
      await laporanApi.submit(laporan.id)
      setLaporan((await laporanApi.getById(laporan.id)).data.data)
      setMsg({ type: 'success', text: 'Laporan berhasil diajukan dan menunggu validasi LPPM.' })
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Laporan gagal diajukan.') })
    } finally {
      setBusy('')
    }
  }

  const remove = async () => {
    if (!confirm('Hapus laporan draft ini?')) return
    setBusy('delete')
    try {
      await laporanApi.remove(laporan.id)
      navigate(`/kegiatan/${jenis}`, { state: { flash: { type: 'success', text: 'Laporan draft dihapus.' } } })
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Laporan gagal dihapus.') })
      setBusy('')
    }
  }

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            Laporan {label} <StatusBadge status={laporan.status} />
          </p>
          <h1 className="page-title mt-1 break-words">{laporan.judul}</h1>
          <p className="page-desc">
            Proposal asal disetujui {tanggal(laporan.proposal?.approvedAt)}
            {laporan.submittedAt ? ` · diajukan ${tanggal(laporan.submittedAt)}` : ''}
          </p>
        </div>
        <Breadcrumb jenis={jenis} last="Laporan" />
      </header>

      <Message msg={msg} />

      {laporan.status === 'revisi' && laporan.catatanRevisi ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Catatan revisi dari LPPM</p>
          <p className="mt-1 whitespace-pre-line">{laporan.catatanRevisi}</p>
        </div>
      ) : laporan.catatanRevisi ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold">Catatan LPPM</p>
          <p className="mt-1 whitespace-pre-line">{laporan.catatanRevisi}</p>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="card">
            <header className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-navy-950">Isi laporan</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {editable
                  ? 'Isi atau ubah laporan lewat tombol "Isi laporan". Luaran tercapai dan dokumen wajib sebelum diajukan.'
                  : isOwner
                    ? 'Laporan sedang diproses LPPM dan tidak dapat diubah.'
                    : 'Anda melihat laporan ini sebagai anggota tim.'}
              </p>
            </header>
            <div className="px-6 py-6">
              <div className="space-y-5">
                <InfoTable
                  rows={[
                    ['Abstrak', laporan.abstrak],
                    ['Target luaran', laporan.luaran || '—'],
                    ['Luaran tercapai', laporan.luaranTercapai || '—'],
                    ['Ringkasan hasil', laporan.ringkasanHasil || '—'],
                    ['Anggaran disetujui', rupiah(laporan.anggaran)],
                    ['Realisasi anggaran', rupiah(laporan.realisasiAnggaran)],
                    ['Dokumen', <DokumenLaporan key="d" laporan={laporan} />],
                  ]}
                />
                {editable ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5">
                    <Link to={isiUrl} className="btn btn-primary">
                      <PencilLine className="size-4" aria-hidden="true" />
                      Isi laporan
                    </Link>
                    <button type="button" onClick={submit} disabled={Boolean(busy)} className="btn btn-secondary">
                      <Send className="size-4" aria-hidden="true" />
                      {busy === 'submit' ? 'Mengajukan…' : 'Ajukan ke LPPM'}
                    </button>
                    {laporan.status === 'draft' ? (
                      <button type="button" onClick={remove} disabled={Boolean(busy)} className="btn btn-ghost ml-auto text-red-700 hover:bg-red-50">
                        <Trash2 className="size-4" aria-hidden="true" />
                        Hapus
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="card">
            <header className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-navy-950">Capaian luaran</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {editable ? 'Capaian diisi di langkah Dokumen pada "Isi laporan".' : 'Capaian tiap target luaran proposal.'}
              </p>
            </header>
            <div className="px-6 py-6">
              <LuaranCapaian proposalId={laporan.proposalId} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card px-6 py-5">
            <h2 className="text-base font-semibold text-navy-950">Ringkasan</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusBadge status={laporan.status} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Periode</dt>
                <dd className="text-right text-slate-900">{laporan.periode?.nama || '—'}</dd>
              </div>
              {laporan.skema || laporan.mitra ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{laporan.jenis === 'pengabdian' ? 'Mitra' : 'Skema'}</dt>
                  <dd className="text-right text-slate-900">{laporan.mitra || laporan.skema}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Pengusul</dt>
                <dd className="text-right text-slate-900">{laporan.pengusul?.fullName || laporan.pengusul?.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Dokumen</dt>
                <dd className="text-right">
                  {laporan.dokumenNama || laporan.dokumenUrl ? (
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <CircleCheck className="size-4" aria-hidden="true" />
                      Ada
                    </span>
                  ) : (
                    <span className="text-slate-500">Belum ada</span>
                  )}
                </dd>
              </div>
            </dl>
            {editable && (laporan.dokumenNama || laporan.dokumenUrl) ? (
              <div className="mt-3">
                <DokumenLaporan laporan={laporan} />
              </div>
            ) : null}
          </section>

          <section className="card px-6 py-5">
            <h2 className="text-base font-semibold text-navy-950">Hasil review</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {(laporan.reviewerTugasan || []).length > 0
                ? `${laporan.reviewerTugasan.length} reviewer ditugaskan`
                : 'Reviewer ditugaskan Ketua LPPM setelah laporan diajukan.'}
            </p>
            <div className="mt-3">
              <ReviewList reviews={laporan.reviews} onlyDone />
            </div>
          </section>

          {(laporan.anggota || []).length > 0 ? (
            <section className="card px-6 py-5">
              <h2 className="text-base font-semibold text-navy-950">Anggota tim</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {laporan.anggota.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span className="text-slate-900">{a.user?.fullName || a.user?.name}</span>
                    <span className="capitalize text-slate-500">{a.peran}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

export default function LaporanPage({ jenis }) {
  const { id } = useParams()
  if (id === 'baru') return <LaporanBaru jenis={jenis} />
  return <LaporanDetail key={id} id={id} jenis={jenis} />
}
