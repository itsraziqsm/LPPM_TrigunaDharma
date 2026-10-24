import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CloudUpload,
  Eye,
  FileText,
  Info,
  Building2,
  Save,
  Trash2,
  Users,
} from 'lucide-react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { periodeApi } from '../api/periode'
import useAuthStore from '../store/authStore'
import ApiPending from '../components/ApiPending'
import { AnggotaSearch } from './ProposalDosen/AnggotaSearch'
import { JENIS_LABEL, PERAN_OPTIONS } from './ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Halaman "Usulkan Penelitian / Pengabdian" — menggantikan modal Buat/Edit
// Proposal. Wizard 4 langkah: Identitas → Anggota → Dokumen → Preview.
//   /kegiatan/:jenis/usulan       buat proposal baru (draft)
//   /kegiatan/:jenis/usulan/:id   ubah proposal (hanya draft/revisi)
// Data: POST/PATCH /dosen/proposals (+ luaran), POST /proposals/:id/dokumen-utama,
// GET /periode, GET /users/search. Field tanpa endpoint memakai ApiPending dan
// dicatat di docs/waitingApi-list.md (W-22..W-26).
// Pengabdian (desain terpisah): 5 langkah dengan langkah Mitra, anggota dosen &
// mahasiswa dipisah.
// ---------------------------------------------------------------------------

const STEPS = [
  { key: 'identitas', label: 'Identitas', icon: Info },
  { key: 'anggota', label: 'Anggota', icon: Users },
  { key: 'dokumen', label: 'Dokumen', icon: FileText },
  { key: 'preview', label: 'Preview', icon: Eye },
]

// Desain pengabdian: langkah Mitra di antara Anggota dan Dokumen.
const STEPS_PENGABDIAN = [
  STEPS[0],
  STEPS[1],
  { key: 'mitra', label: 'Mitra', icon: Building2 },
  STEPS[2],
  STEPS[3],
]

const stepsFor = (jenis) => (jenis === 'pengabdian' ? STEPS_PENGABDIAN : STEPS)

// Pilihan target luaran. Disimpan sebagai teks di field `luaran` proposal;
// daftar baku dari server belum ada (W-25).
const LUARAN_OPTIONS = [
  'Artikel jurnal nasional terakreditasi (SINTA)',
  'Artikel jurnal internasional bereputasi',
  'Artikel prosiding seminar',
  'Buku ajar',
  'Hak Kekayaan Intelektual (HKI)',
  'Teknologi tepat guna',
  'Video kegiatan / publikasi media massa',
]

const MAX_FILE = 10 * 1024 * 1024
const ALLOWED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

function validate(form, file, existingDoc) {
  const e = {}
  const judul = form.judul.trim()
  if (!judul) e.judul = 'Judul proposal wajib diisi.'
  else if (judul.length < 20) e.judul = `Judul minimal 20 karakter (sekarang ${judul.length}).`
  else if (judul.length > 200) e.judul = 'Judul maksimal 200 karakter.'
  if (!form.periodeId) e.periodeId = 'Periode wajib dipilih.'
  if (form.anggaran) {
    const n = Number(form.anggaran)
    if (Number.isNaN(n) || n <= 0) e.anggaran = 'Anggaran harus berupa angka positif.'
    else if (n > 999_999_999_999) e.anggaran = 'Anggaran terlalu besar.'
  }
  const abstrak = form.abstrak.trim()
  if (!abstrak) e.abstrak = 'Abstrak wajib diisi.'
  else if (abstrak.length < 100) e.abstrak = `Abstrak minimal 100 karakter (sekarang ${abstrak.length}).`
  else if (abstrak.length > 2000) e.abstrak = 'Abstrak maksimal 2000 karakter.'
  if (form.jenis === 'pengabdian' && !form.mitra.trim()) e.mitra = 'Nama mitra wajib diisi.'
  if (file) {
    if (file.size > MAX_FILE) e.dokumen = 'Ukuran file melebihi batas 10 MB.'
    else if (!ALLOWED_MIME.includes(file.type)) e.dokumen = 'Format file harus PDF atau DOCX.'
  } else if (!existingDoc) {
    e.dokumen = 'File proposal wajib diunggah.'
  }
  return e
}

const STEP_FIELDS = { identitas: ['judul', 'periodeId', 'anggaran'], anggota: [], mitra: ['mitra'], dokumen: ['abstrak', 'dokumen'] }

const rupiah = (v) => (v ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')

function Required() {
  return (
    <span className="text-red-600" aria-hidden="true">
      {' '}*
    </span>
  )
}

function FieldError({ message }) {
  if (!message) return null
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700" role="alert">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}

function Stepper({ steps, step, maxReached, onGo }) {
  const pct = (step / (steps.length - 1)) * 100
  return (
    <nav aria-label="Langkah pengisian" className="space-y-5">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full rounded-full bg-navy-700 transition-all duration-300" style={{ width: `${Math.max(pct, 6)}%` }} />
      </div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const Icon = s.icon
          const done = i <= step
          const reachable = i <= maxReached
          return (
            <li key={s.key} className="flex justify-center">
              <button
                type="button"
                onClick={() => reachable && onGo(i)}
                disabled={!reachable}
                aria-current={i === step ? 'step' : undefined}
                className="group flex flex-col items-center gap-2 disabled:cursor-not-allowed"
              >
                <span
                  className={`grid size-11 place-items-center rounded-full border-2 transition-colors ${
                    done ? 'border-navy-700 bg-navy-700 text-white' : 'border-slate-300 bg-white text-slate-500 group-enabled:group-hover:border-navy-400'
                  }`}
                >
                  {i < step ? <Check className="size-5" aria-hidden="true" /> : <Icon className="size-5" aria-hidden="true" />}
                </span>
                <span className={`text-xs sm:text-base ${done ? 'font-semibold text-navy-700' : 'text-slate-600'}`}>{s.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// Dosen atau mahasiswa: dari roles hasil pencarian, atau NIM pada data anggota.
function kindOf(u) {
  const roles = (u?.roles || []).map((r) => r.role?.name || r.name || r)
  if (roles.includes('mahasiswa') || u?.nim) return 'mahasiswa'
  return 'dosen'
}

function AnggotaTable({ rows, idLabel, emptyText, onPeran, onRemove }) {
  return (
    <section className="table-wrap" aria-label="Daftar anggota">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Nama</th>
            <th scope="col">{idLabel}</th>
            <th scope="col">Alamat</th>
            <th scope="col">Kontak</th>
            <th scope="col">Peran</th>
            <th scope="col">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-slate-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((a) => (
              <tr key={a.id}>
                <td className="min-w-[14rem]">
                  <p className="font-semibold text-slate-900">{a.fullName || a.name}</p>
                  <p className="text-xs text-slate-500">{a.email}</p>
                </td>
                <td className="whitespace-nowrap tabular-nums">{a.nidn || a.nim || '—'}</td>
                <td>
                  <ApiPending className="whitespace-nowrap" />
                </td>
                <td>
                  <ApiPending className="whitespace-nowrap" />
                </td>
                <td>
                  <select
                    aria-label={`Peran ${a.fullName || a.name}`}
                    value={a.peran}
                    onChange={(e) => onPeran(a.id, e.target.value)}
                    className="input min-h-9 w-40 py-1.5 text-sm"
                  >
                    {PERAN_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(a.id)}
                    aria-label={`Hapus ${a.fullName || a.name}`}
                    title="Hapus anggota"
                    className="icon-btn text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

function StepCard({ title, desc, children }) {
  return (
    <section className="card">
      <header className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-xl font-semibold text-navy-950">{title}</h2>
        {desc ? <p className="mt-0.5 text-sm text-slate-500">{desc}</p> : null}
      </header>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}

function PreviewTable({ rows }) {
  return (
    <dl className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm font-medium text-slate-600">{label}</dt>
          <dd className="min-w-0 whitespace-pre-line break-words text-sm text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function UsulanPage({ jenis: jenisRoute }) {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [form, setForm] = useState({
    judul: '',
    jenis: jenisRoute || 'penelitian',
    periodeId: '',
    anggaran: '',
    abstrak: '',
    luaran: '',
    skema: '',
    mitra: '',
  })
  const [anggota, setAnggota] = useState([])
  const [file, setFile] = useState(null)
  const [existingDoc, setExistingDoc] = useState(null)
  const [periodes, setPeriodes] = useState([])
  const [loadingPeriode, setLoadingPeriode] = useState(true)
  const [loadState, setLoadState] = useState(isEdit ? 'loading' : 'ready') // loading | ready | error | locked
  const [loadMsg, setLoadMsg] = useState('')

  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(isEdit ? 99 : 0)
  const [showErrors, setShowErrors] = useState({})
  const [agree, setAgree] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const topRef = useRef(null)
  const firstStep = useRef(true)

  // Setiap ganti langkah, gulir kembali ke stepper (tombol navigasi ada di bawah).
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step])

  useEffect(() => {
    periodeApi
      .getAll({ limit: 100, isAktif: true })
      .then((r) => setPeriodes(r.data.data || []))
      .catch(() => setPeriodes([]))
      .finally(() => setLoadingPeriode(false))
  }, [])

  // Mode ubah: muat proposal lalu isi formulir.
  useEffect(() => {
    if (!isEdit) return
    let alive = true
    proposalDosenApi
      .getById(id)
      .then((r) => {
        if (!alive) return
        const p = r.data.data
        if (!p) throw new Error('Proposal tidak ditemukan')
        if (p.status !== 'draft' && p.status !== 'revisi') {
          setLoadMsg(`Proposal berstatus "${p.status}" tidak dapat diubah. Hanya draft atau revisi yang bisa diedit.`)
          setLoadState('locked')
          return
        }
        setForm({
          judul: p.judul || '',
          jenis: p.jenis || jenisRoute || 'penelitian',
          periodeId: p.periodeId || p.periode?.id || '',
          anggaran: p.anggaran ? String(Number(p.anggaran)) : '',
          abstrak: p.abstrak || '',
          luaran: p.luaran || '',
          skema: p.skema || '',
          mitra: p.mitra || '',
        })
        setAnggota(
          (p.anggota || []).map((a) => ({
            id: a.user?.id ?? a.userId,
            name: a.user?.name,
            fullName: a.user?.fullName,
            email: a.user?.email,
            nidn: a.user?.nidn,
            nim: a.user?.nim,
            peran: a.peran || 'anggota',
            kind: kindOf(a.user),
          })),
        )
        if (p.dokumenNama) setExistingDoc({ nama: p.dokumenNama, ukuran: p.dokumenUkuran })
        setLoadState('ready')
      })
      .catch((e) => {
        if (!alive) return
        setLoadMsg(e.response?.data?.message || e.message || 'Proposal gagal dimuat.')
        setLoadState('error')
      })
    return () => {
      alive = false
    }
  }, [id, isEdit, jenisRoute])

  const errors = useMemo(() => validate(form, file, existingDoc), [form, file, existingDoc])
  const jenisLabel = JENIS_LABEL[form.jenis] || 'Kegiatan'
  const periodeOptions = periodes.filter((p) => p.jenis === form.jenis)
  const periode = periodes.find((p) => String(p.id) === String(form.periodeId))
  const backTo = `/kegiatan/${jenisRoute || form.jenis}`

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const addAnggota = (kind) => (u) => setAnggota((prev) => [...prev, { ...u, peran: 'anggota', kind: kind || kindOf(u) }])
  const setPeran = (id, peran) => setAnggota((prev) => prev.map((x) => (x.id === id ? { ...x, peran } : x)))
  const removeAnggota = (id) => setAnggota((prev) => prev.filter((x) => x.id !== id))
  const steps = stepsFor(form.jenis)
  const current = steps[Math.min(step, steps.length - 1)].key
  const err = (key) => (showErrors[current] ? errors[key] : null)

  const goNext = () => {
    const key = current
    const invalid = (STEP_FIELDS[key] || []).some((f) => errors[f])
    if (invalid) {
      setShowErrors((s) => ({ ...s, [key]: true }))
      return
    }
    const next = step + 1
    setStep(next)
    setMaxReached((m) => Math.max(m, next))
  }

  const goTo = (i) => {
    // Lompat maju hanya bila langkah-langkah sebelumnya valid.
    for (let s = 0; s < i; s += 1) {
      const key = steps[s].key
      if ((STEP_FIELDS[key] || []).some((f) => errors[f])) {
        setStep(s)
        setShowErrors((x) => ({ ...x, [key]: true }))
        return
      }
    }
    setStep(i)
  }

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    setShowErrors((s) => ({ ...s, dokumen: true }))
  }

  const save = async () => {
    setSaveError('')
    if (Object.keys(errors).length > 0) {
      goTo(steps.length - 1) // berhenti di langkah pertama yang belum valid
      setSaveError('Masih ada data yang belum lengkap.')
      return
    }
    if (!agree) {
      setSaveError('Centang pernyataan kebenaran data terlebih dahulu.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        judul: form.judul.trim(),
        abstrak: form.abstrak.trim(),
        jenis: form.jenis,
        periodeId: Number(form.periodeId),
        ...(form.anggaran ? { anggaran: Number(form.anggaran) } : {}),
        ...(form.luaran ? { luaran: form.luaran } : {}),
        // skema hanya untuk penelitian, mitra hanya untuk pengabdian (backend menolak jenis lain)
        ...(form.jenis === 'penelitian' && (form.skema.trim() || isEdit) ? { skema: form.skema.trim() } : {}),
        ...(form.jenis === 'pengabdian' && (form.mitra.trim() || isEdit) ? { mitra: form.mitra.trim() } : {}),
        anggotaIds: anggota.map((a) => ({ userId: a.id, peran: a.peran })),
      }
      let savedId = id
      if (isEdit) {
        await proposalDosenApi.update(id, payload)
      } else {
        const r = await proposalDosenApi.create(payload)
        savedId = r.data.data?.id
      }
      let uploadFailed = false
      if (file && savedId) {
        try {
          await proposalDosenApi.uploadDokumen(savedId, file)
        } catch {
          uploadFailed = true
        }
      }
      navigate(`/kegiatan/${form.jenis}`, {
        state: {
          flash: uploadFailed
            ? { type: 'warning', text: 'Proposal tersimpan, tetapi file proposal gagal diunggah. Unggah ulang dari menu Edit.' }
            : {
                type: 'success',
                text: isEdit
                  ? 'Perubahan proposal disimpan.'
                  : `Proposal ${jenisLabel.toLowerCase()} tersimpan sebagai draft. Ajukan dari Proposal Saya setelah semua anggota menerima undangan.`,
              },
        },
      })
    } catch (e) {
      setSaveError(e.response?.data?.message || 'Gagal menyimpan proposal. Silakan coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  const title = `${isEdit ? 'Ubah ' : ''}Proposal ${jenisLabel}`

  const header = (
    <header className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-desc">
          {isEdit ? 'Perbarui data proposal Anda.' : `Lengkapi empat langkah berikut untuk mengusulkan ${jenisLabel.toLowerCase()}.`}
        </p>
      </div>
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
              Home
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-400">/</li>
          <li>
            <Link to={backTo} className="font-medium text-navy-600 hover:text-navy-800">
              {JENIS_LABEL[jenisRoute] || jenisLabel}
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-400">/</li>
          <li aria-current="page" className="text-slate-500">
            {isEdit ? 'Ubah Usulan' : `Usulan ${JENIS_LABEL[jenisRoute] || jenisLabel}`}
          </li>
        </ol>
      </nav>
    </header>
  )

  if (loadState !== 'ready') {
    return (
      <div className="page space-y-8">
        {header}
        {loadState === 'loading' ? (
          <div className="card px-6 py-12 text-center text-slate-500">
            <span className="spinner mx-auto text-navy-600" aria-hidden="true" />
            <p className="mt-3">Memuat proposal…</p>
          </div>
        ) : (
          <section className="card px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-navy-950">Proposal tidak dapat dibuka</h2>
            <p className="mx-auto mt-1.5 max-w-md text-base text-slate-500">{loadMsg}</p>
            <Link to={backTo} className="btn btn-secondary mt-5">
              Kembali
            </Link>
          </section>
        )}
      </div>
    )
  }

  const ketua = user?.fullName || user?.name || '—'

  return (
    <div className="page space-y-8">
      {header}
      <div ref={topRef} className="scroll-mt-6">
        <Stepper steps={steps} step={step} maxReached={Math.min(maxReached, steps.length - 1)} onGo={goTo} />
      </div>

      {/* ── A. Identitas ─────────────────────────────────────────────── */}
      {current === 'identitas' && (
        <StepCard title="A. Identitas Proposal" desc="Data utama usulan.">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="u-judul" className="label">
                Judul Proposal
                <Required />
              </label>
              <input id="u-judul" className="input" value={form.judul} onChange={set('judul')} maxLength={200} placeholder="Judul Anda" aria-invalid={Boolean(err('judul'))} />
              {err('judul') ? (
                <FieldError message={err('judul')} />
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">{form.judul.trim().length}/200 · minimal 20 karakter</p>
              )}
            </div>

            <div>
              <label htmlFor="u-jenis" className="label">
                Jenis Kegiatan
                <Required />
              </label>
              <select
                id="u-jenis"
                className="input"
                value={form.jenis}
                onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value, periodeId: '' }))}
              >
                <option value="penelitian">Penelitian</option>
                <option value="pengabdian">Pengabdian</option>
              </select>
            </div>

            <div>
              <label htmlFor="u-periode" className="label">
                Periode
                <Required />
              </label>
              <select id="u-periode" className="input" value={form.periodeId} onChange={set('periodeId')} disabled={loadingPeriode} aria-invalid={Boolean(err('periodeId'))}>
                <option value="">{loadingPeriode ? 'Memuat periode…' : '-- Pilih periode aktif --'}</option>
                {periodeOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama} ({p.tahun})
                  </option>
                ))}
              </select>
              {err('periodeId') ? (
                <FieldError message={err('periodeId')} />
              ) : !loadingPeriode && periodeOptions.length === 0 ? (
                <p className="mt-1.5 text-xs text-amber-700">Tidak ada periode aktif untuk {jenisLabel.toLowerCase()}.</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="u-tahun" className="label">
                Tahun Pelaksanaan
              </label>
              <input id="u-tahun" className="input" value={periode?.tahun ?? ''} readOnly placeholder="Mengikuti periode" />
              <p className="mt-1.5 text-xs text-slate-500">Diambil dari periode yang dipilih.</p>
            </div>

            <div>
              <label htmlFor="u-anggaran" className="label">
                Anggaran (Rp)
              </label>
              <input id="u-anggaran" type="number" min={0} className="input" value={form.anggaran} onChange={set('anggaran')} placeholder="5000000" aria-invalid={Boolean(err('anggaran'))} />
              {err('anggaran') ? <FieldError message={err('anggaran')} /> : <p className="mt-1.5 text-xs text-slate-500">Opsional. {form.anggaran ? rupiah(form.anggaran) : ''}</p>}
            </div>

            {form.jenis === 'penelitian' ? (
              <div>
                <label htmlFor="u-skema" className="label">
                  Skema Penelitian
                </label>
                <input id="u-skema" className="input" value={form.skema} onChange={set('skema')} list="u-skema-list" placeholder="mis. Penelitian Dosen Pemula" />
                <datalist id="u-skema-list">
                  <option value="Penelitian Dosen Pemula" />
                  <option value="Penelitian Dasar" />
                  <option value="Penelitian Terapan" />
                  <option value="Penelitian Kerja Sama" />
                </datalist>
                <p className="mt-1.5 text-xs text-slate-500">Opsional.</p>
              </div>
            ) : null}

            <div>
              <label htmlFor="u-rumpun" className="label">
                Rumpun Ilmu
              </label>
              <input id="u-rumpun" className="input" disabled placeholder="Rumpun ilmu Anda" />
              <ApiPending className="mt-1.5" />
            </div>

            <div>
              <label htmlFor="u-bidang" className="label">
                Bidang {jenisLabel}
              </label>
              <select id="u-bidang" className="input" disabled>
                <option>Pilih bidang</option>
              </select>
              <ApiPending className="mt-1.5" />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="u-ketua" className="label">
                Ketua Pengusul
              </label>
              <input id="u-ketua" className="input" value={ketua} readOnly />
              <p className="mt-1.5 text-xs text-slate-500">Ketua pengusul adalah akun yang sedang masuk.</p>
            </div>
          </div>
        </StepCard>
      )}

      {/* ── B. Anggota ───────────────────────────────────────────────── */}
      {current === 'anggota' &&
        (form.jenis === 'pengabdian' ? (
          <>
            <StepCard title="B. Anggota Dosen" desc="Cari dan pilih dosen. Mereka menerima undangan untuk menyetujui keterlibatan.">
              <AnggotaSearch
                fixedRole="dosen"
                title="Cari dosen"
                placeholder="Ketik nama dosen"
                onAdd={addAnggota('dosen')}
                addedIds={anggota.map((a) => a.id)}
              />
            </StepCard>
            <AnggotaTable
              rows={anggota.filter((a) => a.kind !== 'mahasiswa')}
              idLabel="NIDN"
              emptyText="Belum ada anggota dosen."
              onPeran={setPeran}
              onRemove={removeAnggota}
            />
            <StepCard title="Anggota Mahasiswa" desc="Cari dan pilih mahasiswa yang terlibat.">
              <AnggotaSearch
                fixedRole="mahasiswa"
                title="Cari mahasiswa"
                placeholder="Ketik nama mahasiswa"
                onAdd={addAnggota('mahasiswa')}
                addedIds={anggota.map((a) => a.id)}
              />
            </StepCard>
            <AnggotaTable
              rows={anggota.filter((a) => a.kind === 'mahasiswa')}
              idLabel="NIM"
              emptyText="Belum ada anggota mahasiswa."
              onPeran={setPeran}
              onRemove={removeAnggota}
            />
          </>
        ) : (
          <>
            <StepCard title="B. Anggota Tim" desc="Cari dan pilih dosen atau mahasiswa. Mereka menerima undangan untuk menyetujui keterlibatan.">
              <AnggotaSearch onAdd={addAnggota(null)} addedIds={anggota.map((a) => a.id)} />
            </StepCard>
            <AnggotaTable
              rows={anggota}
              idLabel="NIDN / NIM"
              emptyText="Belum ada anggota. Proposal tetap bisa disimpan tanpa anggota."
              onPeran={setPeran}
              onRemove={removeAnggota}
            />
          </>
        ))}

      {/* ── Mitra (khusus pengabdian) ────────────────────────────────── */}
      {current === 'mitra' && (
        <StepCard title="C. Informasi Mitra" desc="Mitra sasaran kegiatan pengabdian.">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="u-mitra" className="label">
                Nama Mitra
                <Required />
              </label>
              <input
                id="u-mitra"
                className="input"
                value={form.mitra}
                onChange={set('mitra')}
                placeholder="mis. Kelompok Tani Desa Sukamaju"
                aria-invalid={Boolean(err('mitra'))}
              />
              <FieldError message={err('mitra')} />
            </div>
            <div>
              <label htmlFor="u-jenis-mitra" className="label">
                Jenis Mitra
              </label>
              <select id="u-jenis-mitra" className="input" disabled>
                <option>Pilih jenis mitra</option>
              </select>
              <ApiPending className="mt-1.5" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="u-alamat-mitra" className="label">
                Alamat Mitra
              </label>
              <input id="u-alamat-mitra" className="input" disabled placeholder="Alamat lengkap mitra" />
              <ApiPending className="mt-1.5" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="u-kontak-mitra" className="label">
                Kontak Mitra
              </label>
              <input id="u-kontak-mitra" className="input" disabled placeholder="Nomor telepon / email mitra" />
              <ApiPending className="mt-1.5" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="u-kebutuhan" className="label">
                Pernyataan Kebutuhan Mitra
              </label>
              <textarea id="u-kebutuhan" rows={4} className="input resize-y" disabled placeholder="Permasalahan dan kebutuhan mitra" />
              <ApiPending className="mt-1.5" />
            </div>
          </div>
        </StepCard>
      )}

      {/* ── C. Dokumen ───────────────────────────────────────────────── */}
      {current === 'dokumen' && (
        <StepCard title={`${form.jenis === 'pengabdian' ? 'D' : 'C'}. Dokumen ${jenisLabel}`} desc="Abstrak, file proposal, dan target luaran.">
          <div className="space-y-5">
            <div>
              <label htmlFor="u-katakunci" className="label">
                Kata Kunci
              </label>
              <input id="u-katakunci" className="input" disabled placeholder="Pisahkan dengan koma" />
              <ApiPending className="mt-1.5" />
            </div>

            <div>
              <label htmlFor="u-abstrak" className="label">
                Abstrak
                <Required />
              </label>
              <textarea id="u-abstrak" rows={7} maxLength={2000} className="input resize-y leading-relaxed" value={form.abstrak} onChange={set('abstrak')} placeholder="Ketik abstrak Anda: latar belakang, tujuan, dan metode." aria-invalid={Boolean(err('abstrak'))} />
              {err('abstrak') ? (
                <FieldError message={err('abstrak')} />
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">{form.abstrak.trim().length}/2000 · minimal 100 karakter</p>
              )}
            </div>

            <div>
              <span className="label">
                Upload Proposal
                <Required />
              </span>
              {file || existingDoc ? (
                <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                    <FileText className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{file ? file.name : existingDoc.nama}</p>
                    <p className="text-sm text-slate-500">
                      {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'Sudah diunggah sebelumnya'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      setExistingDoc(null)
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Ganti
                  </button>
                </div>
              ) : (
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-5 py-8 text-center transition-colors focus-within:border-navy-500 focus-within:ring-4 focus-within:ring-navy-600/15 ${
                    dragOver ? 'border-navy-500 bg-navy-50' : err('dokumen') ? 'border-red-300 bg-red-50/40' : 'border-slate-300 bg-white hover:border-navy-400 hover:bg-navy-50/60'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    handleFile(e.dataTransfer.files?.[0])
                  }}
                >
                  <span className="grid size-11 place-items-center rounded-full bg-navy-50 text-navy-700">
                    <CloudUpload className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-800">Tarik file ke sini atau klik untuk memilih</span>
                    <span className="mt-1 block text-sm text-slate-500">PDF atau DOCX, maksimal 10 MB.</span>
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    onChange={(e) => {
                      handleFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
              <FieldError message={err('dokumen') || (file ? errors.dokumen : null)} />
              <p className="mt-1.5 text-xs text-slate-500">
                Belum punya format?{' '}
                <a href="/template-proposal.docx" download="Template_Proposal.docx" className="font-semibold text-navy-700 hover:text-navy-900">
                  Unduh template proposal
                </a>
              </p>
            </div>

            <div>
              <label htmlFor="u-luaran" className="label">
                Luaran Tambahan
              </label>
              <select id="u-luaran" className="input" value={form.luaran} onChange={set('luaran')}>
                <option value="">-- Pilih target luaran (opsional) --</option>
                {form.luaran && !LUARAN_OPTIONS.includes(form.luaran) ? <option value={form.luaran}>{form.luaran}</option> : null}
                {LUARAN_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                Disimpan sebagai target luaran dan disalin ke laporan. Daftar pilihan baku dari server: <ApiPending />
              </p>
            </div>
          </div>
        </StepCard>
      )}

      {/* ── D. Preview ───────────────────────────────────────────────── */}
      {current === 'preview' && (
        <StepCard title={`Preview Proposal ${jenisLabel}`} desc="Periksa kembali sebelum menyimpan.">
          <div className="space-y-7">
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">Identitas Proposal</h3>
              <PreviewTable
                rows={[
                  ['Judul', form.judul || '—'],
                  ['Jenis Kegiatan', jenisLabel],
                  ['Periode', periode ? periode.nama : '—'],
                  ['Tahun Pelaksanaan', periode?.tahun ?? '—'],
                  ['Anggaran', rupiah(form.anggaran)],
                  ['Ketua Pengusul', ketua],
                  ...(form.jenis === 'penelitian' ? [['Skema Penelitian', form.skema || '—']] : []),
                  ['Rumpun Ilmu', <ApiPending key="r" />],
                  [`Bidang ${jenisLabel}`, <ApiPending key="b" />],
                ]}
              />
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">Anggota Tim</h3>
              {anggota.length === 0 ? (
                <p className="text-sm text-slate-500">Tanpa anggota.</p>
              ) : (
                <div className={`grid gap-5 ${form.jenis === 'pengabdian' ? 'sm:grid-cols-2' : ''}`}>
                  {(form.jenis === 'pengabdian'
                    ? [
                        ['Dosen', anggota.filter((a) => a.kind !== 'mahasiswa')],
                        ['Mahasiswa', anggota.filter((a) => a.kind === 'mahasiswa')],
                      ]
                    : [['', anggota]]
                  ).map(([groupLabel, list]) => (
                    <div key={groupLabel || 'semua'} className="space-y-2">
                      {groupLabel ? <p className="text-sm font-medium text-slate-600">{groupLabel}</p> : null}
                      {list.length === 0 ? (
                        <p className="text-sm text-slate-500">—</p>
                      ) : (
                        <ul className={`grid gap-3 ${form.jenis === 'pengabdian' ? '' : 'sm:grid-cols-2'}`}>
                          {list.map((a) => (
                            <li key={a.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                              <p className="font-semibold text-slate-900">{a.fullName || a.name}</p>
                              <p className="text-sm text-slate-600">{a.nidn ? `NIDN: ${a.nidn}` : a.nim ? `NIM: ${a.nim}` : a.email}</p>
                              <p className="mt-1 text-xs capitalize text-slate-500">{a.peran}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {form.jenis === 'pengabdian' ? (
              <section className="space-y-3">
                <h3 className="text-base font-semibold text-navy-950">Mitra</h3>
                <PreviewTable
                  rows={[
                    ['Nama Mitra', form.mitra || '—'],
                    ['Alamat', <ApiPending key="ma" />],
                    ['Kontak', <ApiPending key="mk" />],
                    ['Jenis Mitra', <ApiPending key="mj" />],
                    ['Pernyataan Kebutuhan', <ApiPending key="mp" />],
                  ]}
                />
              </section>
            ) : null}

            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">Dokumen</h3>
              <PreviewTable
                rows={[
                  ['Abstrak', form.abstrak || '—'],
                  ['Kata Kunci', <ApiPending key="k" />],
                  ['Luaran Tambahan', form.luaran || '—'],
                  [
                    'File Proposal',
                    file || existingDoc ? (
                      <span key="f" className="badge badge-success">
                        Sudah diunggah{file ? ' (akan dikirim saat disimpan)' : ''}
                      </span>
                    ) : (
                      <span key="f" className="badge badge-danger">Belum ada file</span>
                    ),
                  ],
                ]}
              />
            </section>

            <div className="flex items-start gap-3 rounded-lg border border-navy-200 bg-navy-50 px-4 py-3 text-sm text-navy-800">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Pastikan semua data sudah terisi dengan benar. Proposal disimpan sebagai draft; ajukan dari Proposal Saya setelah semua anggota menerima undangan.
            </div>

            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" className="mt-0.5 size-4 accent-navy-700" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              Saya menyatakan bahwa data yang dimasukkan adalah benar.
            </label>
          </div>
        </StepCard>
      )}

      {saveError ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {saveError}
        </div>
      ) : null}

      {/* ── Navigasi langkah ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        {step === 0 ? (
          <Link to={backTo} className="btn btn-secondary min-w-36">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Batal
          </Link>
        ) : (
          <button type="button" onClick={() => setStep(step - 1)} className="btn btn-secondary min-w-36">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Sebelumnya
          </button>
        )}

        {step < steps.length - 1 ? (
          <button type="button" onClick={goNext} className="btn btn-primary min-w-36">
            Berikutnya
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" onClick={save} disabled={saving || !agree} className="btn min-w-36 bg-green-700 text-white hover:bg-green-800 disabled:opacity-60">
            {saving ? <span className="spinner" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {saving ? 'Menyimpan…' : 'Simpan Proposal'}
          </button>
        )}
      </div>
    </div>
  )
}
