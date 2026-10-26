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
  Plus,
  Save,
  Trash2,
  Users,
} from 'lucide-react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { periodeApi } from '../api/periode'
import { LUARAN_JENIS, luaranApi } from '../api/luaran'
import { masterApi } from '../api/master'
import { kataKunciError, parseKataKunci } from '../utils/kataKunci'
import { ATURAN_TIM, aturanTeks, hitungTim, pelanggaranTim, timPenuh } from '../utils/aturanTim'
import { alertDialog } from '../utils/dialog'
import useAuthStore from '../store/authStore'
import { AnggotaSearch } from './ProposalDosen/AnggotaSearch'
import { JENIS_LABEL, PERAN_OPTIONS } from './ProposalDosen/constants'
import { FieldError, PreviewTable, Required, StepCard, Stepper } from '../components/Wizard'

// ---------------------------------------------------------------------------
// Halaman "Usulkan Penelitian / Pengabdian" — menggantikan modal Buat/Edit
// Proposal. Wizard 4 langkah: Identitas → Anggota → Dokumen → Preview.
//   /kegiatan/:jenis/usulan       buat proposal baru (draft)
//   /kegiatan/:jenis/usulan/:id   ubah proposal (hanya draft/revisi)
// Data: POST/PATCH /dosen/proposals, POST/PATCH/DELETE /luaran (item target luaran,
// disinkronkan setelah proposal tersimpan), POST /proposals/:id/dokumen-utama,
// GET /periode, GET /users/search, GET /master/(rumpun-ilmu|bidang|luaran|jenis-mitra).
// Detail mitra (pengabdian): mitraJenis, mitraAlamat, mitraKontak, mitraKebutuhan.
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

// Target luaran = item /luaran (jenis baku LUARAN_JENIS). Field teks `luaran`
// proposal tetap diisi ringkasan item supaya tampilan lama & laporan ikut membaca.
let luaranKey = 0
const newLuaran = () => ({ key: `n${(luaranKey += 1)}`, id: null, jenis: 'jurnal', target: '', targetTanggal: '' })
const luaranRingkas = (items) =>
  items
    .filter((i) => i.target.trim())
    .map((i) => `${LUARAN_JENIS[i.jenis] || i.jenis}: ${i.target.trim()}`)
    .join('; ')

const MAX_FILE = 10 * 1024 * 1024
const ALLOWED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

// Samakan item luaran di server dengan isi formulir: hapus yang dibuang,
// ubah yang berubah, tambah yang baru.
async function syncLuaran(proposalId, orig, items) {
  const keep = new Set(items.filter((i) => i.id).map((i) => i.id))
  for (const o of orig) if (!keep.has(o.id)) await luaranApi.remove(o.id)
  for (const i of items) {
    const data = { jenis: i.jenis, target: i.target.trim(), targetTanggal: i.targetTanggal || null }
    if (!i.id) {
      await luaranApi.create({ proposalId: Number(proposalId), ...data, ...(i.targetTanggal ? {} : { targetTanggal: undefined }) })
      continue
    }
    const o = orig.find((x) => x.id === i.id)
    if (o && (o.jenis !== i.jenis || o.target !== i.target || o.targetTanggal !== i.targetTanggal)) await luaranApi.update(i.id, data)
  }
}

function validate(form, file, existingDoc, luaranItems, anggota) {
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
  // Semua isian Dokumen wajib, kecuali Target Luaran.
  const kkError = parseKataKunci(form.kataKunci).length === 0 ? 'Isi minimal satu kata kunci.' : kataKunciError(form.kataKunci)
  if (kkError) e.kataKunci = kkError
  const tim = pelanggaranTim(form.jenis, anggota)
  if (tim.length) e.anggota = `Komposisi tim belum sesuai: ${tim.join(', ')}.`
  if (luaranItems.some((i) => i.target.trim().length < 3)) e.luaran = 'Setiap target luaran minimal 3 karakter.'
  if (file) {
    if (file.size > MAX_FILE) e.dokumen = 'Ukuran file melebihi batas 10 MB.'
    else if (!ALLOWED_MIME.includes(file.type)) e.dokumen = 'Format file harus PDF atau DOCX.'
  } else if (!existingDoc) {
    e.dokumen = 'File proposal wajib diunggah.'
  }
  return e
}

const STEP_FIELDS = { identitas: ['judul', 'periodeId', 'anggaran'], anggota: ['anggota'], mitra: ['mitra'], dokumen: ['kataKunci', 'abstrak', 'dokumen', 'luaran'] }

const rupiah = (v) => (v ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')

// Dosen atau mahasiswa: dari roles hasil pencarian, atau NIM pada data anggota.
function kindOf(u) {
  const roles = (u?.roles || []).map((r) => r.role?.name || r.name || r)
  if (roles.includes('mahasiswa') || u?.nim) return 'mahasiswa'
  return 'dosen'
}

// Opsi dari master; nilai tersimpan yang sudah tidak ada di master tetap ditampilkan.
function MasterOptions({ items, current }) {
  return (
    <>
      {current && !items.some((m) => m.nama === current) ? <option value={current}>{current}</option> : null}
      {items.map((m) => (
        <option key={m.id} value={m.nama}>
          {m.nama}
        </option>
      ))}
    </>
  )
}

function AnggotaTable({ rows, idLabel, emptyText, onPeran, onRemove }) {
  return (
    <section className="table-wrap" aria-label="Daftar anggota">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Nama</th>
            <th scope="col">{idLabel}</th>
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
              <td colSpan={5} className="py-8 text-center text-slate-500">
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
                <td className="whitespace-nowrap">{a.noHp || a.kontak || '—'}</td>
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

// Ringkasan aturan komposisi tim (utils/aturanTim.js) + jumlah saat ini.
function KomposisiTim({ jenis, anggota, error }) {
  const aturan = ATURAN_TIM[jenis]
  if (!aturan) return null
  const n = hitungTim(anggota)
  const ok = pelanggaranTim(jenis, anggota).length === 0
  const item = (kind, label) => {
    const r = aturan[kind]
    const sesuai = n[kind] >= r.min && (r.max == null || n[kind] <= r.max)
    return (
      <li className="flex items-center gap-2">
        {sesuai ? <Check className="size-4 text-green-700" aria-hidden="true" /> : <CircleAlert className="size-4 text-amber-700" aria-hidden="true" />}
        <span>
          {label}: <strong className="tabular-nums">{n[kind]}</strong> <span className="text-slate-500">(ketentuan {aturanTeks(r)})</span>
        </span>
      </li>
    )
  }
  return (
    <section
      aria-label="Ketentuan komposisi tim"
      className={`rounded-lg border px-4 py-3 text-sm ${ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
    >
      <p className="font-semibold">Ketentuan tim {jenis === 'pengabdian' ? 'pengabdian' : 'penelitian'} (selain ketua pengusul)</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
        {item('dosen', 'Anggota dosen')}
        {item('mahasiswa', 'Anggota mahasiswa')}
      </ul>
      {error ? (
        <p role="alert" className="mt-1.5 text-red-700">
          {error}
        </p>
      ) : null}
    </section>
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
    mitraJenis: '',
    mitraAlamat: '',
    mitraKontak: '',
    mitraKebutuhan: '',
    rumpunIlmu: '',
    bidang: '',
    kataKunci: '',
  })
  const [master, setMaster] = useState({ rumpun: [], bidang: [], luaran: [], jenisMitra: [] })
  const [anggota, setAnggota] = useState([])
  const [luaranItems, setLuaranItems] = useState([])
  const [luaranOrig, setLuaranOrig] = useState([])
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
  // Simpan draf di tengah wizard: id proposal yang baru dibuat (mode buat) agar
  // simpan berikutnya memperbarui proposal yang sama, bukan membuat baru.
  const [draftId, setDraftId] = useState(null)
  const [drafting, setDrafting] = useState(false)
  const [draftMsg, setDraftMsg] = useState(null)
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

  // Master pilihan (W-22, W-25): rumpun ilmu umum; bidang & luaran per jenis.
  useEffect(() => {
    let alive = true
    const list = (kategori, params) =>
      masterApi
        .list(kategori, params)
        .then((r) => r.data.data || [])
        .catch(() => [])
    Promise.all([
      list('rumpun-ilmu'),
      list('bidang', { jenis: form.jenis }),
      list('luaran', { jenis: form.jenis }),
      form.jenis === 'pengabdian' ? list('jenis-mitra', { jenis: 'pengabdian' }) : [],
    ]).then(([rumpun, bidang, luaran, jenisMitra]) => alive && setMaster({ rumpun, bidang, luaran, jenisMitra }),
    )
    return () => {
      alive = false
    }
  }, [form.jenis])

  // Mode ubah: muat proposal lalu isi formulir.
  useEffect(() => {
    if (!isEdit) return
    let alive = true
    proposalDosenApi
      .getByIdLengkap(id)
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
          mitraJenis: p.mitraJenis || '',
          mitraAlamat: p.mitraAlamat || '',
          mitraKontak: p.mitraKontak || '',
          mitraKebutuhan: p.mitraKebutuhan || '',
          rumpunIlmu: p.rumpunIlmu || '',
          bidang: p.bidang || '',
          kataKunci: (p.kataKunci || []).join(', '),
        })
        setAnggota(
          (p.anggota || []).map((a) => ({
            id: a.user?.id ?? a.userId,
            name: a.user?.name,
            fullName: a.user?.fullName,
            email: a.user?.email,
            nidn: a.user?.nidn,
            nim: a.user?.nim,
            kontak: a.user?.kontak,
            noHp: a.user?.noHp,
            peran: a.peran || 'anggota',
            kind: kindOf(a.user),
          })),
        )
        if (p.dokumenNama) setExistingDoc({ nama: p.dokumenNama, ukuran: p.dokumenUkuran })
        return luaranApi.byProposal(id).then((lr) => {
          if (!alive) return
          const items = (lr.data.data || []).map((l) => ({
            key: `s${l.id}`,
            id: l.id,
            jenis: l.jenis,
            target: l.target || '',
            targetTanggal: l.targetTanggal ? String(l.targetTanggal).slice(0, 10) : '',
          }))
          setLuaranItems(items)
          setLuaranOrig(items)
          setLoadState('ready')
        })
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

  const errors = useMemo(() => validate(form, file, existingDoc, luaranItems, anggota), [form, file, existingDoc, luaranItems, anggota])
  const jenisLabel = JENIS_LABEL[form.jenis] || 'Kegiatan'
  const periodeOptions = periodes.filter((p) => p.jenis === form.jenis)
  const periode = periodes.find((p) => String(p.id) === String(form.periodeId))
  const backTo = `/kegiatan/${jenisRoute || form.jenis}`

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const addAnggota = (kind) => (u) => {
    // Ketua pengusul (akun yang sedang masuk) tidak boleh menjadi anggota timnya sendiri.
    if (u.id === user?.id) {
      alertDialog({ tone: 'warning', title: 'Tidak dapat ditambahkan', message: 'Anda adalah ketua kegiatan ini, jadi tidak perlu ditambahkan sebagai anggota.' })
      return
    }
    const k = kind || kindOf(u)
    if (timPenuh(form.jenis, anggota, k)) {
      alertDialog({
        tone: 'warning',
        title: 'Anggota sudah penuh',
        message: `Tim ${jenisLabel.toLowerCase()} hanya boleh ${aturanTeks(ATURAN_TIM[form.jenis][k])} anggota ${k}. Hapus salah satu bila ingin mengganti.`,
      })
      return
    }
    setAnggota((prev) => [...prev, { ...u, peran: 'anggota', kind: k }])
  }
  const setPeran = (id, peran) => setAnggota((prev) => prev.map((x) => (x.id === id ? { ...x, peran } : x)))
  const removeAnggota = (id) => setAnggota((prev) => prev.filter((x) => x.id !== id))
  const setLuaran = (key, field, value) => setLuaranItems((prev) => prev.map((x) => (x.key === key ? { ...x, [field]: value } : x)))
  const steps = stepsFor(form.jenis)
  const current = steps[Math.min(step, steps.length - 1)].key
  const err = (key) => (showErrors[current] ? errors[key] : null)

  // Pesan galat simpan draf tidak relevan lagi setelah pindah langkah.
  const clearDraftError = () => setDraftMsg((m) => (m?.type === 'error' ? null : m))

  const goNext = () => {
    clearDraftError()
    const key = current
    const invalid = (STEP_FIELDS[key] || []).some((f) => errors[f])
    if (invalid) {
      setShowErrors((s) => ({ ...s, [key]: true }))
      // Pesan komposisi tim ada di atas langkah Anggota.
      if (key === 'anggota') topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const next = step + 1
    setStep(next)
    setMaxReached((m) => Math.max(m, next))
  }

  const goTo = (i) => {
    clearDraftError()
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

  const proposalId = id || draftId
  const editing = Boolean(proposalId)

  // Kirim proposal (POST saat belum ada id, PATCH bila sudah), lalu unggah file
  // dan sinkronkan target luaran. Mengembalikan daftar peringatan non-fatal.
  const persist = async ({ draft }) => {
    const payload = {
      judul: form.judul.trim(),
      abstrak: form.abstrak.trim(),
      jenis: form.jenis,
      ...(form.periodeId ? { periodeId: Number(form.periodeId) } : {}),
      ...(form.anggaran ? { anggaran: Number(form.anggaran) } : {}),
      ...(luaranItems.length ? { luaran: luaranRingkas(luaranItems) } : form.luaran ? { luaran: form.luaran } : {}),
      // skema hanya untuk penelitian, mitra hanya untuk pengabdian (backend menolak jenis lain)
      ...(form.jenis === 'penelitian' && (form.skema.trim() || editing) ? { skema: form.skema.trim() } : {}),
      ...(form.jenis === 'pengabdian' && (form.mitra.trim() || editing) ? { mitra: form.mitra.trim() } : {}),
      // Detail mitra: hanya pengabdian; string kosong dikirim null (mengosongkan).
      ...(form.jenis === 'pengabdian'
        ? Object.fromEntries(['mitraJenis', 'mitraAlamat', 'mitraKontak', 'mitraKebutuhan'].map((k) => [k, form[k].trim() || null]))
        : {}),
      ...(form.rumpunIlmu || editing ? { rumpunIlmu: form.rumpunIlmu } : {}),
      ...(form.bidang || editing ? { bidang: form.bidang } : {}),
      kataKunci: parseKataKunci(form.kataKunci),
      anggotaIds: anggota.map((a) => ({ userId: a.id, peran: a.peran })),
    }
    let savedId = proposalId
    if (savedId) {
      await proposalDosenApi.update(savedId, payload)
    } else {
      const r = await proposalDosenApi.create(payload)
      savedId = r.data.data?.id
    }
    const warn = []
    if (file && savedId && !errors.dokumen) {
      try {
        await proposalDosenApi.uploadDokumen(savedId, file)
        setExistingDoc({ nama: file.name, ukuran: file.size })
        setFile(null)
      } catch {
        warn.push('file proposal gagal diunggah')
      }
    }
    if (savedId) {
      // Draf: target yang belum valid (< 3 karakter) dilewati dulu.
      const items = draft ? luaranItems.filter((i) => i.target.trim().length >= 3) : luaranItems
      try {
        await syncLuaran(savedId, luaranOrig, items)
      } catch {
        warn.push('sebagian target luaran gagal disimpan')
      }
    }
    return { savedId, warn }
  }

  // Simpan draf tanpa validasi lengkap. Backend tetap mensyaratkan judul ≥ 5 dan
  // abstrak ≥ 20 karakter untuk membuat/memperbarui proposal.
  const saveDraft = async () => {
    setSaveError('')
    setDraftMsg(null)
    const judul = form.judul.trim()
    const abstrak = form.abstrak.trim()
    const missing = [
      judul.length < 5 && 'judul minimal 5 karakter (langkah Identitas)',
      abstrak.length < 20 && 'abstrak minimal 20 karakter (langkah Dokumen)',
    ].filter(Boolean)
    if (missing.length) {
      setDraftMsg({ type: 'error', text: `Untuk menyimpan draf, isi dulu ${missing.join(' dan ')}.` })
      return
    }
    // Draf: hanya format yang salah yang menghalangi (isian kosong & aturan tim boleh).
    const blocking = [errors.anggaran, kataKunciError(form.kataKunci)].filter(Boolean)
    if (blocking.length) {
      setDraftMsg({ type: 'error', text: blocking.join(' ') })
      return
    }
    setDrafting(true)
    try {
      const { savedId, warn } = await persist({ draft: true })
      if (!id && savedId) {
        setDraftId(savedId)
        // URL ikut menjadi mode ubah supaya muat ulang halaman membuka draf ini.
        window.history.replaceState(window.history.state, '', `/kegiatan/${form.jenis}/usulan/${savedId}`)
      }
      const fresh = await luaranApi
        .byProposal(savedId)
        .then((r) => r.data.data || [])
        .catch(() => null)
      if (fresh) {
        const saved = fresh.map((l) => ({
          key: `s${l.id}`,
          id: l.id,
          jenis: l.jenis,
          target: l.target || '',
          targetTanggal: l.targetTanggal ? String(l.targetTanggal).slice(0, 10) : '',
        }))
        // Target yang belum valid tetap ada di formulir.
        setLuaranItems([...saved, ...luaranItems.filter((i) => !i.id && i.target.trim().length < 3)])
        setLuaranOrig(saved)
      }
      const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      setDraftMsg(
        warn.length
          ? { type: 'warning', text: `Draf tersimpan pukul ${time}, tetapi ${warn.join(' dan ')}.` }
          : { type: 'success', text: `Draf tersimpan pukul ${time}. Anda bisa melanjutkan kapan saja dari halaman ${jenisLabel}.` },
      )
    } catch (e) {
      const errs = e.response?.data?.errors
      setDraftMsg({ type: 'error', text: errs ? Object.values(errs).flat().join(' ') : e.response?.data?.message || 'Draf gagal disimpan.' })
    } finally {
      setDrafting(false)
    }
  }

  const save = async () => {
    setSaveError('')
    setDraftMsg(null)
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
      const { warn } = await persist({ draft: false })
      navigate(`/kegiatan/${form.jenis}`, {
        state: {
          flash: warn.length
            ? { type: 'warning', text: `Proposal tersimpan, tetapi ${warn.join(' dan ')}. Perbaiki dari menu Edit.` }
            : {
                type: 'success',
                text: isEdit
                  ? 'Perubahan proposal disimpan.'
                  : `Proposal ${jenisLabel.toLowerCase()} tersimpan sebagai draft. Ajukan lewat Detail di Riwayat ${jenisLabel} setelah semua anggota menerima undangan.`,
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
          {isEdit ? 'Perbarui data proposal Anda.' : `Lengkapi ${steps.length === 5 ? 'lima' : 'empat'} langkah berikut untuk mengusulkan ${jenisLabel.toLowerCase()}.`}
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
              </label>
              <input id="u-jenis" className="input" value={jenisLabel} readOnly disabled aria-describedby="u-jenis-hint" />
              <p id="u-jenis-hint" className="mt-1.5 text-xs text-slate-500">
                Mengikuti menu Kegiatan yang dipilih ({jenisLabel}).
              </p>
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
              <select id="u-rumpun" className="input" value={form.rumpunIlmu} onChange={set('rumpunIlmu')}>
                <option value="">-- Pilih rumpun ilmu --</option>
                <MasterOptions items={master.rumpun} current={form.rumpunIlmu} />
              </select>
            </div>

            <div>
              <label htmlFor="u-bidang" className="label">
                Bidang {jenisLabel}
              </label>
              <select id="u-bidang" className="input" value={form.bidang} onChange={set('bidang')}>
                <option value="">-- Pilih bidang --</option>
                <MasterOptions items={master.bidang} current={form.bidang} />
              </select>
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
      {current === 'anggota' ? <KomposisiTim jenis={form.jenis} anggota={anggota} error={err('anggota')} /> : null}
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
                ketuaId={user?.id}
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
                ketuaId={user?.id}
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
              <AnggotaSearch onAdd={addAnggota(null)} addedIds={anggota.map((a) => a.id)}
                ketuaId={user?.id} />
            </StepCard>
            <AnggotaTable
              rows={anggota}
              idLabel="NIDN / NIM"
              emptyText="Belum ada anggota. Tambahkan minimal 2 dosen."
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
              <select id="u-jenis-mitra" className="input" value={form.mitraJenis} onChange={set('mitraJenis')}>
                <option value="">-- Pilih jenis mitra --</option>
                <MasterOptions items={master.jenisMitra} current={form.mitraJenis} />
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="u-alamat-mitra" className="label">
                Alamat Mitra
              </label>
              <input id="u-alamat-mitra" className="input" value={form.mitraAlamat} onChange={set('mitraAlamat')} placeholder="Alamat lengkap mitra" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="u-kontak-mitra" className="label">
                Kontak Mitra
              </label>
              <input id="u-kontak-mitra" className="input" value={form.mitraKontak} onChange={set('mitraKontak')} placeholder="Nomor telepon / email mitra" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="u-kebutuhan" className="label">
                Pernyataan Kebutuhan Mitra
              </label>
              <textarea
                id="u-kebutuhan"
                rows={4}
                className="input resize-y"
                value={form.mitraKebutuhan}
                onChange={set('mitraKebutuhan')}
                placeholder="Permasalahan dan kebutuhan mitra"
              />
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
                <Required />
              </label>
              <input
                id="u-katakunci"
                className="input"
                value={form.kataKunci}
                onChange={set('kataKunci')}
                placeholder="mis. sistem pakar, fuzzy, diagnosis"
                aria-invalid={Boolean(err('kataKunci'))}
              />
              <FieldError message={err('kataKunci')} />
              {err('kataKunci') ? null : <p className="mt-1.5 text-xs text-slate-500">Pisahkan dengan koma, maksimal 10 kata kunci.</p>}
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
                <a href="/templates/template-proposal.docx" download="Template_Proposal.docx" className="font-semibold text-navy-700 hover:text-navy-900">
                  Unduh template proposal
                </a>
              </p>
            </div>

            <fieldset>
              <legend className="label">Target Luaran</legend>
              <p className="-mt-0.5 mb-3 text-xs text-slate-500">
                Opsional. Capaian tiap target diisi saat menyusun laporan dan dihitung sebagai luaran yang dapat diklaim.
              </p>
              {luaranItems.length > 0 ? (
                <ul className="space-y-3">
                  {luaranItems.map((item, i) => (
                    <li key={item.key} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[10rem_minmax(0,1fr)_10rem_auto] sm:items-end">
                      <div>
                        <label htmlFor={`ul-jenis-${item.key}`} className="label">
                          Jenis
                        </label>
                        <select id={`ul-jenis-${item.key}`} className="input" value={item.jenis} onChange={(e) => setLuaran(item.key, 'jenis', e.target.value)}>
                          {Object.entries(LUARAN_JENIS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`ul-target-${item.key}`} className="label">
                          Target {i + 1}
                        </label>
                        <input
                          id={`ul-target-${item.key}`}
                          className="input"
                          value={item.target}
                          onChange={(e) => setLuaran(item.key, 'target', e.target.value)}
                          placeholder="mis. Artikel jurnal SINTA 3"
                          maxLength={255}
                        />
                      </div>
                      <div>
                        <label htmlFor={`ul-tgl-${item.key}`} className="label">
                          Target tanggal
                        </label>
                        <input
                          id={`ul-tgl-${item.key}`}
                          type="date"
                          className="input"
                          value={item.targetTanggal}
                          onChange={(e) => setLuaran(item.key, 'targetTanggal', e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="icon-btn text-red-700 hover:bg-red-50"
                        aria-label={`Hapus target ${i + 1}`}
                        onClick={() => setLuaranItems((prev) => prev.filter((x) => x.key !== item.key))}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : form.luaran ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Catatan luaran lama: {form.luaran}</p>
              ) : null}
              <FieldError message={err('luaran')} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {master.luaran.length > 0 ? (
                  <select
                    aria-label="Tambah target dari daftar luaran"
                    className="input w-auto max-w-full"
                    value=""
                    onChange={(e) => {
                      const m = master.luaran.find((x) => String(x.id) === e.target.value)
                      if (m) setLuaranItems((prev) => [...prev, { ...newLuaran(), jenis: m.jenisLuaran || 'lainnya', target: m.nama }])
                    }}
                  >
                    <option value="">+ Tambah dari daftar luaran…</option>
                    {master.luaran.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nama}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLuaranItems((prev) => [...prev, newLuaran()])}>
                  <Plus className="size-4" aria-hidden="true" />
                  Tambah target lain
                </button>
              </div>
            </fieldset>
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
                  ['Rumpun Ilmu', form.rumpunIlmu || '—'],
                  [`Bidang ${jenisLabel}`, form.bidang || '—'],
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
                    ['Alamat', form.mitraAlamat || '—'],
                    ['Kontak', form.mitraKontak || '—'],
                    ['Jenis Mitra', form.mitraJenis || '—'],
                    ['Pernyataan Kebutuhan', form.mitraKebutuhan || '—'],
                  ]}
                />
              </section>
            ) : null}

            <section className="space-y-3">
              <h3 className="text-base font-semibold text-navy-950">Dokumen</h3>
              <PreviewTable
                rows={[
                  ['Abstrak', form.abstrak || '—'],
                  ['Kata Kunci', parseKataKunci(form.kataKunci).join(', ') || '—'],
                  [
                    'Target Luaran',
                    luaranItems.length ? (
                      <ul key="l" className="list-disc space-y-0.5 pl-4">
                        {luaranItems.map((i) => (
                          <li key={i.key}>
                            {LUARAN_JENIS[i.jenis]}: {i.target || '—'}
                            {i.targetTanggal ? ` (target ${i.targetTanggal})` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      form.luaran || '—'
                    ),
                  ],
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
              Pastikan semua data sudah terisi dengan benar. Proposal disimpan sebagai draft; ajukan lewat Detail di Riwayat {jenisLabel} setelah semua anggota menerima undangan.
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

      {draftMsg ? (
        <div
          role={draftMsg.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            draftMsg.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : draftMsg.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {draftMsg.type === 'success' ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {draftMsg.text}
        </div>
      ) : null}

      {/* ── Navigasi langkah: Sebelumnya · Simpan draf · Berikutnya ─────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        {step === 0 ? (
          <Link to={backTo} className="btn btn-secondary justify-self-start sm:min-w-36">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Batal
          </Link>
        ) : (
          <button type="button" onClick={() => {
              clearDraftError()
              setStep(step - 1)
            }} className="btn btn-secondary justify-self-start sm:min-w-36">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Sebelumnya
          </button>
        )}

        <button
          type="button"
          onClick={saveDraft}
          disabled={drafting || saving}
          className="btn btn-ghost border border-dashed border-navy-300 text-navy-800 hover:border-navy-400"
          title="Simpan sebagai draf tanpa menyelesaikan semua langkah"
        >
          {drafting ? <span className="spinner" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {drafting ? 'Menyimpan…' : 'Simpan draf'}
        </button>

        {step < steps.length - 1 ? (
          <button type="button" onClick={goNext} className="btn btn-primary justify-self-end sm:min-w-36">
            Berikutnya
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" onClick={save} disabled={saving || !agree} className="btn justify-self-end bg-green-700 text-white hover:bg-green-800 disabled:opacity-60 sm:min-w-36">
            {saving ? <span className="spinner" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
            {saving ? 'Menyimpan…' : 'Simpan Proposal'}
          </button>
        )}
      </div>
    </div>
  )
}
