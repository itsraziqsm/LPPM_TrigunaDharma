import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CircleAlert, CloudUpload, Eye, FileText, Info, Save, Trash2, Users } from 'lucide-react'
import { laporanApi } from '../api/laporan'
import { LUARAN_JENIS, luaranApi } from '../api/luaran'
import useAuthStore from '../store/authStore'
import ApiPending from '../components/ApiPending'
import { FieldError, PreviewTable, Required, StepCard, Stepper } from '../components/Wizard'
import { JENIS_LABEL } from './ProposalDosen/constants'
import { DokumenLaporan } from './laporan/shared'
import LuaranCapaian from './laporan/LuaranCapaian'
import { rupiah } from './laporan/format'

// ---------------------------------------------------------------------------
// Isi Laporan Penelitian / Pengabdian (desain UI Laporan): wizard 4 langkah
//   Informasi Umum → Informasi Laporan → Dokumen & Luaran → Preview
// Route /kegiatan/:jenis/laporan/:id/isi. Hanya pengusul saat laporan draft/revisi;
// selain itu kembali ke halaman laporan (index). Data: GET/PATCH /laporan/:id,
// POST /laporan/:id/dokumen, capaian luaran (LuaranCapaian). Link Jurnal & Link
// Video = bukti (`buktiUrl`) item luaran proposal berjenis jurnal/prosiding dan
// media massa (PATCH /luaran/:id/capaian) — backend tidak punya field link khusus
// di laporan. Kata kunci laporan & metode penelitian belum ada field-nya
// (ApiPending, docs/waitingApi-list.md W-27, W-28).
// ---------------------------------------------------------------------------

const STEPS = [
  { key: 'umum', label: 'Informasi Umum', icon: Info },
  { key: 'laporan', label: 'Informasi Laporan', icon: Users },
  { key: 'dokumen', label: 'Dokumen', icon: FileText },
  { key: 'preview', label: 'Preview', icon: Eye },
]

const EDITABLE = ['draft', 'revisi']
const MAX_FILE = 10 * 1024 * 1024
const DOC_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const FIELDS = ['judul', 'abstrak', 'luaranTercapai', 'ringkasanHasil', 'realisasiAnggaran', 'dokumenUrl']
const STEP_FIELDS = {
  umum: [],
  laporan: ['judul', 'abstrak', 'ringkasanHasil', 'luaranTercapai', 'realisasiAnggaran'],
  dokumen: ['dokumen', 'dokumenUrl', 'links'],
}

// Item luaran yang tautan buktinya tampil sebagai Link Jurnal / Link Video.
const JURNAL_JENIS = ['jurnal', 'prosiding']
const VIDEO_JENIS = ['media_massa']
const isUrl = (v) => /^https?:\/\/\S+$/i.test(v)

const formFrom = (l) => Object.fromEntries(FIELDS.map((k) => [k, l?.[k] == null ? '' : String(l[k])]))

function errorText(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}

function validate(form, file, laporan, links) {
  const e = {}
  if ((links || []).some((l) => l.url.trim() && !isUrl(l.url.trim()))) e.links = 'Link jurnal/video harus berupa URL (https://…).'
  const judul = form.judul.trim()
  if (judul.length < 5) e.judul = 'Judul laporan minimal 5 karakter.'
  const abstrak = form.abstrak.trim()
  if (abstrak.length < 20) e.abstrak = `Abstrak minimal 20 karakter (sekarang ${abstrak.length}).`
  if (!form.ringkasanHasil.trim()) e.ringkasanHasil = 'Ringkasan laporan wajib diisi.'
  if (!form.luaranTercapai.trim()) e.luaranTercapai = 'Luaran tercapai wajib diisi (syarat pengajuan laporan).'
  if (form.realisasiAnggaran !== '' && (Number.isNaN(Number(form.realisasiAnggaran)) || Number(form.realisasiAnggaran) < 0)) {
    e.realisasiAnggaran = 'Realisasi anggaran harus angka 0 atau lebih.'
  }
  const url = form.dokumenUrl.trim()
  if (url && !/^https?:\/\/\S+$/i.test(url)) e.dokumenUrl = 'URL dokumen tidak valid.'
  if (file) {
    if (file.size > MAX_FILE) e.dokumen = 'Ukuran file melebihi batas 10 MB.'
    else if (!DOC_MIME.includes(file.type)) e.dokumen = 'Format file harus PDF atau DOCX.'
  } else if (!laporan?.dokumenNama && !url) {
    e.dokumen = 'Unggah file laporan atau isi URL dokumen.'
  }
  return e
}

function Breadcrumb({ jenis, laporanId, label }) {
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
        <li>
          <Link to={`/kegiatan/${jenis}/laporan/${laporanId}`} className="font-medium text-navy-600 hover:text-navy-800">
            Laporan {label}
          </Link>
        </li>
        <li aria-hidden="true" className="text-slate-400">/</li>
        <li aria-current="page" className="text-slate-500">
          Isi laporan
        </li>
      </ol>
    </nav>
  )
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-base text-slate-900">{children || '—'}</dd>
    </div>
  )
}

export default function LaporanIsiPage({ jenis }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const label = JENIS_LABEL[jenis] || 'Kegiatan'
  const backTo = `/kegiatan/${jenis}/laporan/${id}`

  const [laporan, setLaporan] = useState(null)
  const [loadState, setLoadState] = useState('loading') // loading | ready | error | locked
  const [loadMsg, setLoadMsg] = useState('')
  const [form, setForm] = useState(formFrom(null))
  const [file, setFile] = useState(null)
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState({})
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState('') // draft | save
  const [msg, setMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  // Tautan bukti item luaran: { id, jenis, target, url, orig }
  const [links, setLinks] = useState(null)
  const [luaranTick, setLuaranTick] = useState(0)
  const topRef = useRef(null)
  const firstStep = useRef(true)

  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step])

  // Muat ulang daftar tautan dari item luaran (setelah simpan tautan/capaian).
  // `keep` = { id: url } isian yang belum tersimpan (mis. URL belum valid) dipertahankan.
  function loadLinks(proposalId, keep = {}) {
    luaranApi
      .byProposal(proposalId)
      .then((r) =>
        setLinks(
          (r.data.data || [])
            .filter((i) => JURNAL_JENIS.includes(i.jenis) || VIDEO_JENIS.includes(i.jenis))
            .map((i) => ({ id: i.id, jenis: i.jenis, target: i.target, url: keep[i.id] ?? i.buktiUrl ?? '', orig: i.buktiUrl || '' })),
        ),
      )
      .catch(() => setLinks([]))
  }

  useEffect(() => {
    let alive = true
    laporanApi
      .getById(id)
      .then((r) => {
        if (!alive) return
        const l = r.data.data
        if (l.jenis && l.jenis !== jenis) {
          navigate(`/kegiatan/${l.jenis}/laporan/${l.id}/isi`, { replace: true })
          return
        }
        if (l.pengusul?.id !== user?.id || !EDITABLE.includes(l.status)) {
          setLoadMsg(
            l.pengusul?.id !== user?.id
              ? 'Hanya pengusul yang dapat mengisi laporan ini.'
              : `Laporan berstatus "${l.status}" tidak dapat diubah. Hanya draft atau revisi yang bisa diisi.`,
          )
          setLoadState('locked')
          return
        }
        setLaporan(l)
        setForm(formFrom(l))
        setLoadState('ready')
        loadLinks(l.proposalId)
      })
      .catch((e) => {
        if (!alive) return
        setLoadMsg(e.response?.status === 404 ? 'Laporan tidak ditemukan.' : errorText(e, 'Laporan gagal dimuat.'))
        setLoadState('error')
      })
    return () => {
      alive = false
    }
  }, [id, jenis, navigate, user?.id])

  const errors = useMemo(() => validate(form, file, laporan, links), [form, file, laporan, links])
  const current = STEPS[step].key
  const err = (k) => (showErrors[current] ? errors[k] : null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const clearError = () => setMsg((m) => (m?.type === 'error' ? null : m))
  const goNext = () => {
    clearError()
    if ((STEP_FIELDS[current] || []).some((f) => errors[f])) {
      setShowErrors((s) => ({ ...s, [current]: true }))
      return
    }
    setStep(step + 1)
  }
  const goTo = (i) => {
    clearError()
    for (let s = 0; s < i; s += 1) {
      const key = STEPS[s].key
      if ((STEP_FIELDS[key] || []).some((f) => errors[f])) {
        setStep(s)
        setShowErrors((x) => ({ ...x, [key]: true }))
        return
      }
    }
    setStep(i)
  }

  // Kirim field yang berubah (+ unggah file). `draft` melewati field yang belum
  // valid agar sisanya tetap tersimpan.
  const persist = async (draft) => {
    const base = formFrom(laporan)
    const skipped = []
    const payload = {}
    for (const k of FIELDS) {
      if (form[k] === base[k]) continue
      const v = form[k].trim()
      if (k === 'realisasiAnggaran') {
        if (v === '') continue
        if (errors.realisasiAnggaran) {
          skipped.push('realisasi anggaran')
          continue
        }
        payload[k] = Number(v)
      } else if (k === 'dokumenUrl') {
        if (!v) continue
        if (errors.dokumenUrl) {
          skipped.push('URL dokumen')
          continue
        }
        payload[k] = v
      } else if ((k === 'judul' || k === 'abstrak') && errors[k]) {
        if (!draft) throw new Error(errors[k])
        skipped.push(k)
      } else {
        payload[k] = v
      }
    }
    if (Object.keys(payload).length) await laporanApi.update(laporan.id, payload)
    let uploadWarn = null
    if (file && draft && errors.dokumen) skipped.push('file laporan')
    if (file && !(draft && errors.dokumen)) {
      try {
        await laporanApi.uploadDokumen(laporan.id, file)
        setFile(null)
      } catch (e) {
        uploadWarn = errorText(e, 'file laporan gagal diunggah')
      }
    }
    let linksSaved = false
    const keep = {}
    for (const l of links || []) {
      const v = l.url.trim()
      if (v === l.orig) continue
      if (v && !isUrl(v)) {
        skipped.push(`link "${l.target}"`)
        keep[l.id] = l.url
        continue
      }
      await luaranApi.saveCapaian(l.id, { buktiUrl: v || null })
      linksSaved = true
    }
    if (linksSaved) {
      loadLinks(laporan.proposalId, keep)
      setLuaranTick((t) => t + 1)
    }
    const fresh = (await laporanApi.getById(laporan.id)).data.data
    setLaporan(fresh)
    setForm((f) => ({ ...f, ...Object.fromEntries(FIELDS.filter((k) => !skipped.includes(k)).map((k) => [k, formFrom(fresh)[k]])) }))
    return { skipped, uploadWarn }
  }

  const saveDraft = async () => {
    setMsg(null)
    setBusy('draft')
    try {
      const { skipped, uploadWarn } = await persist(true)
      const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      const notes = [skipped.length && `${skipped.join(', ')} belum valid sehingga belum disimpan`, uploadWarn].filter(Boolean)
      setMsg(
        notes.length
          ? { type: 'warning', text: `Draf tersimpan pukul ${time}, tetapi ${notes.join('; ')}.` }
          : { type: 'success', text: `Draf tersimpan pukul ${time}.` },
      )
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Draf gagal disimpan.') })
    } finally {
      setBusy('')
    }
  }

  const save = async () => {
    setMsg(null)
    if (Object.keys(errors).length > 0) {
      goTo(STEPS.length - 1)
      setMsg({ type: 'error', text: 'Masih ada data yang belum lengkap.' })
      return
    }
    if (!agree) {
      setMsg({ type: 'error', text: 'Centang pernyataan kebenaran data terlebih dahulu.' })
      return
    }
    setBusy('save')
    try {
      const { uploadWarn } = await persist(false)
      navigate(backTo, {
        state: {
          flash: uploadWarn
            ? { type: 'warning', text: `Laporan tersimpan, tetapi ${uploadWarn}.` }
            : { type: 'success', text: 'Laporan tersimpan. Periksa ringkasannya lalu ajukan ke LPPM.' },
        },
      })
    } catch (e) {
      setMsg({ type: 'error', text: errorText(e, 'Laporan gagal disimpan.') })
      setBusy('')
    }
  }

  const header = (
    <header ref={topRef} className="flex scroll-mt-6 flex-wrap items-baseline justify-between gap-3">
      <div>
        <h1 className="page-title">Laporan {label}</h1>
        <p className="page-desc">Lengkapi empat langkah berikut, lalu simpan dan ajukan dari halaman laporan.</p>
      </div>
      <Breadcrumb jenis={jenis} laporanId={id} label={label} />
    </header>
  )

  if (loadState !== 'ready') {
    return (
      <div className="page space-y-8">
        {header}
        {loadState === 'loading' ? (
          <div className="card px-6 py-12 text-center text-slate-500">
            <span className="spinner mx-auto text-navy-600" aria-hidden="true" />
            <p className="mt-3">Memuat laporan…</p>
          </div>
        ) : (
          <section className="card px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-navy-950">Laporan tidak dapat diisi</h2>
            <p className="mx-auto mt-1.5 max-w-md text-base text-slate-500">{loadMsg}</p>
            <Link to={loadState === 'locked' ? backTo : `/kegiatan/${jenis}`} className="btn btn-secondary mt-5">
              Kembali
            </Link>
          </section>
        )}
      </div>
    )
  }

  const anggota = laporan.anggota || []
  const kataKunci = (laporan.kataKunci || []).join(', ')
  const luaranLabel = `Luaran ${label}`

  return (
    <div className="page space-y-8">
      {header}

      <Stepper steps={STEPS} step={step} maxReached={STEPS.length - 1} onGo={goTo} />

      {/* ── A. Informasi Umum (dari proposal, baca saja) ─────────────────── */}
      {current === 'umum' && (
        <StepCard title="A. Informasi Umum" desc={`Data proposal ${label.toLowerCase()} yang dilaporkan. Diubah lewat proposal, bukan di sini.`}>
          <div className="space-y-8">
            <dl className="grid gap-5 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Field label="Judul Proposal">{laporan.proposal?.judul || laporan.judul}</Field>
              </div>
              <Field label="Tahun Pelaksanaan">{laporan.periode?.tahun}</Field>
              <Field label="Rumpun Ilmu">{laporan.rumpunIlmu}</Field>
              <Field label={`Bidang ${label}`}>{laporan.bidang}</Field>
              {jenis === 'pengabdian' ? (
                <>
                  <Field label="Mitra">{laporan.mitra}</Field>
                  <Field label="Jenis Mitra">{laporan.mitraJenis}</Field>
                  <Field label="Kontak Mitra">{laporan.mitraKontak}</Field>
                </>
              ) : (
                <Field label="Skema">{laporan.skema}</Field>
              )}
            </dl>

            <section className="space-y-3">
              <h3 className="text-xl font-semibold text-navy-950">B. Anggota Tim</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Nama</th>
                      <th scope="col">NIDN / NIM</th>
                      <th scope="col">Peran</th>
                      <th scope="col">Kontak</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="font-semibold text-slate-900">{laporan.pengusul?.fullName || laporan.pengusul?.name}</td>
                      <td className="tabular-nums">{laporan.pengusul?.nidn || laporan.pengusul?.nim || '—'}</td>
                      <td>Ketua pengusul</td>
                      <td>{laporan.pengusul?.noHp || laporan.pengusul?.kontak || '—'}</td>
                    </tr>
                    {anggota.map((a) => (
                      <tr key={a.id}>
                        <td className="text-slate-900">{a.user?.fullName || a.user?.name}</td>
                        <td className="tabular-nums">{a.user?.nidn || a.user?.nim || '—'}</td>
                        <td className="capitalize">{a.peran}</td>
                        <td>{a.user?.noHp || a.user?.kontak || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </StepCard>
      )}

      {/* ── B. Informasi Laporan ─────────────────────────────────────────── */}
      {current === 'laporan' && (
        <StepCard title="Informasi Laporan" desc="Isi utama laporan.">
          <div className="space-y-5">
            <div>
              <label htmlFor="li-judul" className="label">
                Judul Laporan {label}
                <Required />
              </label>
              <input id="li-judul" className="input" value={form.judul} onChange={set('judul')} placeholder="Judul laporan Anda" aria-invalid={Boolean(err('judul'))} />
              <FieldError message={err('judul')} />
            </div>
            <div>
              <label htmlFor="li-kk" className="label">
                Kata Kunci
              </label>
              <input id="li-kk" className="input" value={kataKunci} disabled placeholder="Kata kunci Anda" />
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                Disalin dari proposal. Mengubah kata kunci laporan: <ApiPending />
              </p>
            </div>
            {jenis === 'penelitian' ? (
              <div>
                <label htmlFor="li-metode" className="label">
                  Metode Penelitian
                </label>
                <input id="li-metode" className="input" disabled placeholder="Metode penelitian Anda" />
                <ApiPending className="mt-1.5" />
              </div>
            ) : null}
            <div>
              <label htmlFor="li-abstrak" className="label">
                Abstrak
                <Required />
              </label>
              <textarea id="li-abstrak" rows={5} className="input resize-y leading-relaxed" value={form.abstrak} onChange={set('abstrak')} placeholder="Abstrak laporan Anda" aria-invalid={Boolean(err('abstrak'))} />
              <FieldError message={err('abstrak')} />
            </div>
            <div>
              <label htmlFor="li-ringkasan" className="label">
                Ringkasan Laporan
                <Required />
              </label>
              <textarea id="li-ringkasan" rows={5} className="input resize-y leading-relaxed" value={form.ringkasanHasil} onChange={set('ringkasanHasil')} placeholder="Ringkasan laporan Anda" aria-invalid={Boolean(err('ringkasanHasil'))} />
              <FieldError message={err('ringkasanHasil')} />
            </div>
            <div>
              <label htmlFor="li-luaran" className="label">
                Luaran Tercapai
                <Required />
              </label>
              <textarea
                id="li-luaran"
                rows={3}
                className="input resize-y"
                value={form.luaranTercapai}
                onChange={set('luaranTercapai')}
                placeholder="mis. 1 artikel jurnal SINTA 3 terbit"
                aria-invalid={Boolean(err('luaranTercapai'))}
              />
              {err('luaranTercapai') ? (
                <FieldError message={err('luaranTercapai')} />
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">Target luaran proposal: {laporan.luaran || '—'}</p>
              )}
            </div>
            <div className="sm:max-w-sm">
              <label htmlFor="li-realisasi" className="label">
                Realisasi Anggaran (Rp)
              </label>
              <input id="li-realisasi" type="number" min={0} className="input" value={form.realisasiAnggaran} onChange={set('realisasiAnggaran')} aria-invalid={Boolean(err('realisasiAnggaran'))} />
              {err('realisasiAnggaran') ? (
                <FieldError message={err('realisasiAnggaran')} />
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">Opsional. Anggaran disetujui: {rupiah(laporan.anggaran)}</p>
              )}
            </div>
          </div>
        </StepCard>
      )}

      {/* ── C. Dokumen dan Luaran ────────────────────────────────────────── */}
      {current === 'dokumen' && (
        <StepCard title="C. Dokumen dan Luaran" desc="File laporan, tautan luaran, dan capaian tiap target luaran.">
          <div className="space-y-6">
            <div>
              <span className="label">
                File Laporan (PDF/DOCX)
                <Required />
              </span>
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) setFile(f)
                }}
                className={`flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-4 transition-colors ${
                  dragOver ? 'border-navy-500 bg-navy-50' : 'border-slate-300 bg-white hover:border-navy-300'
                }`}
              >
                <CloudUpload className="size-5 text-navy-700" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {file ? file.name : laporan.dokumenNama ? `Saat ini: ${laporan.dokumenNama}` : 'Tarik file ke sini atau klik untuk memilih (maks 10 MB)'}
                </span>
                <span className="btn btn-secondary btn-sm">{file || laporan.dokumenNama ? 'Ganti file' : 'Pilih file'}</span>
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
              <FieldError message={err('dokumen') || (file ? errors.dokumen : null)} />
              {laporan.dokumenNama && !file ? (
                <div className="mt-2">
                  <DokumenLaporan laporan={laporan} />
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="li-url" className="label">
                URL Dokumen (alternatif file)
              </label>
              <input id="li-url" type="url" className="input" value={form.dokumenUrl} onChange={set('dokumenUrl')} placeholder="https://drive.google.com/…" aria-invalid={Boolean(err('dokumenUrl'))} />
              {err('dokumenUrl') ? (
                <FieldError message={err('dokumenUrl')} />
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">Mengunggah file akan mengosongkan URL dokumen.</p>
              )}
            </div>

            {[
              ['Link Jurnal', JURNAL_JENIS, 'https://jurnal.example.com/…', 'jurnal atau prosiding'],
              ['Link Video / Dokumentasi', VIDEO_JENIS, 'https://youtube.com/…', 'video kegiatan / media massa'],
            ].map(([title, jenisList, ph, desc]) => {
              const rows = (links || []).filter((l) => jenisList.includes(l.jenis))
              return (
                <div key={title}>
                  <span className="label">{title}</span>
                  {links === null ? (
                    <span className="spinner block text-navy-600" aria-hidden="true" />
                  ) : rows.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
                      Proposal tidak punya target luaran {desc}. Target luaran ditambahkan saat proposal masih draft/revisi.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {rows.map((l) => (
                        <li key={l.id}>
                          <label htmlFor={`li-link-${l.id}`} className="mb-1 block text-xs text-slate-500">
                            {LUARAN_JENIS[l.jenis] || l.jenis}: {l.target}
                          </label>
                          <div className="flex gap-2">
                            <input
                              id={`li-link-${l.id}`}
                              type="url"
                              className="input"
                              value={l.url}
                              placeholder={ph}
                              onChange={(e) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))}
                              aria-invalid={Boolean(l.url.trim() && !isUrl(l.url.trim()))}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost shrink-0 text-red-700 hover:bg-red-50"
                              disabled={!l.url}
                              onClick={() => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, url: '' } : x)))}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              Hapus
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            <FieldError message={err('links')} />
            <p className="-mt-3 text-xs text-slate-500">Tautan disimpan sebagai bukti capaian target luaran terkait.</p>

            <section className="space-y-3 border-t border-slate-200 pt-5">
              <div>
                <h3 className="text-base font-semibold text-navy-950">Capaian luaran</h3>
                <p className="text-sm text-slate-500">Isi capaian tiap target luaran beserta buktinya (link atau file).</p>
              </div>
              <LuaranCapaian key={luaranTick} proposalId={laporan.proposalId} editable onSaved={() => loadLinks(laporan.proposalId)} />
            </section>
          </div>
        </StepCard>
      )}

      {/* ── D. Preview ───────────────────────────────────────────────────── */}
      {current === 'preview' && (
        <StepCard title={`Pratinjau Laporan ${label}`} desc="Periksa kembali sebelum menyimpan.">
          <div className="space-y-7">
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">Detail Laporan</h3>
              <PreviewTable
                rows={[
                  ['Judul Laporan', form.judul || '—'],
                  ['Kata Kunci', kataKunci || '—'],
                  ...(jenis === 'penelitian' ? [['Metode Penelitian', <ApiPending key="m" />]] : []),
                  ['Abstrak', form.abstrak || '—'],
                  ['Ringkasan Laporan', form.ringkasanHasil || '—'],
                  ['Luaran Tercapai', form.luaranTercapai || '—'],
                  ['Realisasi Anggaran', form.realisasiAnggaran ? rupiah(form.realisasiAnggaran) : '—'],
                ]}
              />
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">{luaranLabel}</h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Publikasi / Jurnal', JURNAL_JENIS],
                  ['Video / Dokumentasi', VIDEO_JENIS],
                ].map(([title, jenisList]) => {
                  const urls = (links || []).filter((l) => jenisList.includes(l.jenis) && l.url.trim())
                  return (
                    <div key={title}>
                      <dt className="text-sm font-semibold text-slate-900">{title}</dt>
                      <dd className="mt-1 space-y-0.5 text-sm">
                        {urls.length === 0 ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          urls.map((l) => (
                            <a key={l.id} href={l.url.trim()} target="_blank" rel="noreferrer" className="block break-all font-semibold text-navy-700 hover:text-navy-900">
                              {l.url.trim()}
                            </a>
                          ))
                        )}
                      </dd>
                    </div>
                  )
                })}
              </dl>
              <LuaranCapaian key={luaranTick} proposalId={laporan.proposalId} />
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">File Laporan</h3>
              {file || laporan.dokumenNama || form.dokumenUrl.trim() ? (
                <span className="badge badge-success">
                  {file ? 'Siap diunggah saat disimpan' : laporan.dokumenNama ? 'Sudah diunggah' : 'Memakai URL dokumen'}
                </span>
              ) : (
                <span className="badge badge-danger">Belum ada file</span>
              )}
            </section>

            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" className="mt-0.5 size-4 accent-navy-700" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              Saya menyatakan bahwa informasi dan dokumen yang diserahkan adalah benar.
            </label>
          </div>
        </StepCard>
      )}

      {msg ? (
        <div
          role={msg.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            msg.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : msg.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {msg.type === 'success' ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {msg.text}
        </div>
      ) : null}

      {/* ── Navigasi: Sebelumnya · Simpan draf · Berikutnya/Simpan ─────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        {step === 0 ? (
          <Link to={backTo} className="btn btn-secondary justify-self-start sm:min-w-36">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Batal
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              clearError()
              setStep(step - 1)
            }}
            className="btn btn-secondary justify-self-start sm:min-w-36"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Sebelumnya
          </button>
        )}

        <button
          type="button"
          onClick={saveDraft}
          disabled={Boolean(busy)}
          className="btn btn-ghost border border-dashed border-navy-300 text-navy-800 hover:border-navy-400"
          title="Simpan sebagai draf tanpa menyelesaikan semua langkah"
        >
          {busy === 'draft' ? <span className="spinner" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {busy === 'draft' ? 'Menyimpan…' : 'Simpan draf'}
        </button>

        {step < STEPS.length - 1 ? (
          <button type="button" onClick={goNext} className="btn btn-primary justify-self-end sm:min-w-36">
            Berikutnya
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={Boolean(busy) || !agree}
            className="btn justify-self-end bg-green-700 text-white hover:bg-green-800 disabled:opacity-60 sm:min-w-36"
          >
            {busy === 'save' ? <span className="spinner" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {busy === 'save' ? 'Menyimpan…' : 'Simpan'}
          </button>
        )}
      </div>
    </div>
  )
}
