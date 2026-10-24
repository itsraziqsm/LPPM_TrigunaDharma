import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CircleCheck, CloudUpload, FileText, Send, Trash2 } from 'lucide-react'
import { laporanApi } from '../api/laporan'
import useAuthStore from '../store/authStore'
import { JENIS_LABEL } from './ProposalDosen/constants'
import { DokumenLaporan, InfoTable, Message, ReviewList, StatusBadge } from './laporan/shared'
import { rupiah, tanggal } from './laporan/format'

// ---------------------------------------------------------------------------
// Laporan kegiatan untuk pengusul (dosen/mahasiswa) — API /laporan (new-api.md).
//   /kegiatan/:jenis/laporan/baru  pilih proposal disetujui (GET /laporan/eligible)
//                                  lalu POST /laporan { proposalId } → draft
//   /kegiatan/:jenis/laporan/:id   isi (PATCH), unggah dokumen, ajukan (submit),
//                                  hapus (draft), serta lihat status & hasil review.
// Edit hanya saat draft/revisi dan hanya oleh pengusul; selain itu baca saja
// (anggota proposal asal juga boleh melihat).
// ---------------------------------------------------------------------------

const EDITABLE = ['draft', 'revisi']
const MAX_FILE = 10 * 1024 * 1024
const DOC_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

const FIELDS = ['judul', 'abstrak', 'luaranTercapai', 'ringkasanHasil', 'realisasiAnggaran', 'dokumenUrl']

function formFrom(l) {
  return Object.fromEntries(FIELDS.map((k) => [k, l?.[k] == null ? '' : String(l[k])]))
}

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
      navigate(`/kegiatan/${jenis}/laporan/${r.data.data.id}`, {
        replace: true,
        state: { flash: { type: 'success', text: 'Laporan dibuat sebagai draft. Lengkapi luaran tercapai dan dokumen, lalu ajukan.' } },
      })
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
  const [form, setForm] = useState(formFrom(null))
  const [file, setFile] = useState(null)
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
        setForm(formFrom(l))
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
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const changed = FIELDS.filter((k) => form[k] !== formFrom(laporan)[k])
  const adaDokumen = Boolean(file || laporan.dokumenNama || form.dokumenUrl.trim())

  const validate = (forSubmit) => {
    if (form.judul.trim().length < 5) return 'Judul minimal 5 karakter.'
    if (form.abstrak.trim().length < 20) return 'Abstrak minimal 20 karakter.'
    if (form.realisasiAnggaran !== '' && (Number.isNaN(Number(form.realisasiAnggaran)) || Number(form.realisasiAnggaran) < 0)) {
      return 'Realisasi anggaran harus angka 0 atau lebih.'
    }
    if (form.dokumenUrl.trim() && !/^https?:\/\/\S+$/i.test(form.dokumenUrl.trim())) return 'URL dokumen tidak valid.'
    if (file && file.size > MAX_FILE) return 'Ukuran file maksimal 10 MB.'
    if (file && !DOC_MIME.includes(file.type)) return 'File harus PDF atau DOCX.'
    if (forSubmit && !form.luaranTercapai.trim()) return 'Luaran tercapai wajib diisi sebelum laporan diajukan.'
    if (forSubmit && !adaDokumen) return 'Unggah file laporan atau isi URL dokumen sebelum mengajukan.'
    return null
  }

  // Simpan perubahan isian + unggah file (bila ada). Mengembalikan laporan terbaru.
  const persist = async () => {
    let current = laporan
    if (changed.length > 0) {
      const payload = {}
      changed.forEach((k) => {
        if (k === 'realisasiAnggaran') {
          if (form[k] !== '') payload[k] = Number(form[k])
        } else if (k === 'dokumenUrl') {
          if (form[k].trim()) payload[k] = form[k].trim()
        } else {
          payload[k] = form[k].trim()
        }
      })
      if (Object.keys(payload).length > 0) current = (await laporanApi.update(laporan.id, payload)).data.data
    }
    if (file) {
      await laporanApi.uploadDokumen(laporan.id, file)
      current = (await laporanApi.getById(laporan.id)).data.data
      setFile(null)
    }
    return current
  }

  const save = async () => {
    const err = validate(false)
    if (err) return setMsg({ type: 'error', text: err })
    setBusy('save')
    setMsg(null)
    try {
      const next = await persist()
      const fresh = (await laporanApi.getById(next.id)).data.data
      setLaporan(fresh)
      setForm(formFrom(fresh))
      setMsg({ type: 'success', text: 'Laporan disimpan.' })
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Laporan gagal disimpan.') })
    } finally {
      setBusy('')
    }
  }

  const submit = async () => {
    const err = validate(true)
    if (err) return setMsg({ type: 'error', text: err })
    if (!confirm('Ajukan laporan ini ke Ketua LPPM? Laporan tidak bisa diubah sampai ada keputusan revisi.')) return
    setBusy('submit')
    setMsg(null)
    try {
      await persist()
      await laporanApi.submit(laporan.id)
      const fresh = (await laporanApi.getById(laporan.id)).data.data
      setLaporan(fresh)
      setForm(formFrom(fresh))
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
        <section className="card">
          <header className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-navy-950">{editable ? 'Isi laporan' : 'Isi laporan'}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {editable
                ? 'Simpan kapan saja sebagai draft. Luaran tercapai dan dokumen wajib sebelum diajukan.'
                : isOwner
                  ? 'Laporan sedang diproses LPPM dan tidak dapat diubah.'
                  : 'Anda melihat laporan ini sebagai anggota tim.'}
            </p>
          </header>
          <div className="px-6 py-6">
            {editable ? (
              <div className="space-y-5">
                <div>
                  <label htmlFor="l-judul" className="label">
                    Judul <span className="text-red-600">*</span>
                  </label>
                  <input id="l-judul" className="input" value={form.judul} onChange={set('judul')} />
                </div>
                <div>
                  <label htmlFor="l-abstrak" className="label">
                    Abstrak <span className="text-red-600">*</span>
                  </label>
                  <textarea id="l-abstrak" rows={5} className="input resize-y leading-relaxed" value={form.abstrak} onChange={set('abstrak')} />
                </div>
                <div>
                  <label htmlFor="l-luaran" className="label">
                    Luaran tercapai <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="l-luaran"
                    rows={3}
                    className="input resize-y"
                    value={form.luaranTercapai}
                    onChange={set('luaranTercapai')}
                    placeholder={laporan.luaran ? `Target: ${laporan.luaran}` : 'mis. 1 artikel jurnal SINTA 3'}
                  />
                  <p className="mt-1.5 text-xs text-slate-500">Target luaran proposal: {laporan.luaran || '—'}</p>
                </div>
                <div>
                  <label htmlFor="l-ringkasan" className="label">
                    Ringkasan hasil
                  </label>
                  <textarea id="l-ringkasan" rows={4} className="input resize-y leading-relaxed" value={form.ringkasanHasil} onChange={set('ringkasanHasil')} />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="l-realisasi" className="label">
                      Realisasi anggaran (Rp)
                    </label>
                    <input id="l-realisasi" type="number" min={0} className="input" value={form.realisasiAnggaran} onChange={set('realisasiAnggaran')} />
                    <p className="mt-1.5 text-xs text-slate-500">Anggaran disetujui: {rupiah(laporan.anggaran)}</p>
                  </div>
                  <div>
                    <label htmlFor="l-url" className="label">
                      URL dokumen (opsional)
                    </label>
                    <input id="l-url" type="url" className="input" value={form.dokumenUrl} onChange={set('dokumenUrl')} placeholder="https://drive.google.com/…" />
                    <p className="mt-1.5 text-xs text-slate-500">Alternatif bila tidak mengunggah file.</p>
                  </div>
                </div>
                <div>
                  <span className="label">File laporan (PDF/DOCX, maks 10 MB)</span>
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3">
                    <CloudUpload className="size-5 text-navy-700" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {file ? file.name : laporan.dokumenNama ? `Saat ini: ${laporan.dokumenNama}` : 'Belum ada file'}
                    </span>
                    <label className="btn btn-secondary btn-sm cursor-pointer">
                      {laporan.dokumenNama || file ? 'Ganti file' : 'Pilih file'}
                      <input
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="sr-only"
                        onChange={(e) => {
                          setFile(e.target.files?.[0] || null)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Mengunggah file akan mengosongkan URL dokumen.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-5">
                  <button type="button" onClick={submit} disabled={Boolean(busy)} className="btn btn-primary">
                    <Send className="size-4" aria-hidden="true" />
                    {busy === 'submit' ? 'Mengajukan…' : 'Simpan & ajukan'}
                  </button>
                  <button type="button" onClick={save} disabled={Boolean(busy)} className="btn btn-secondary">
                    {busy === 'save' ? 'Menyimpan…' : 'Simpan draft'}
                  </button>
                  {laporan.status === 'draft' ? (
                    <button type="button" onClick={remove} disabled={Boolean(busy)} className="btn btn-ghost ml-auto text-red-700 hover:bg-red-50">
                      <Trash2 className="size-4" aria-hidden="true" />
                      Hapus
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </section>

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
