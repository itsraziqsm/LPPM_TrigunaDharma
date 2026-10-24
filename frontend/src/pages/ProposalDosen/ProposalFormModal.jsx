import { useEffect, useState, useCallback } from 'react'
import { proposalDosenApi } from '../../api/Proposaldosen'
import { periodeApi } from '../../api/periode'
import { Modal, FormField } from './components'
import { AnggotaSearch } from './AnggotaSearch'
import { PERAN_OPTIONS } from './constants'

// ── Aturan Validasi ────────────────────────────────────────────────────────────
const RULES = {
    judul: {
        minLength: 20,
        maxLength: 200,
        validate: (v) => {
            const s = v.trim()
            if (!s) return 'Judul proposal wajib diisi.'
            if (s.length < 20) return `Judul minimal 20 karakter (sekarang ${s.length}).`
            if (s.length > 200) return `Judul maksimal 200 karakter.`
            return null
        },
    },
    abstrak: {
        minLength: 100,
        maxLength: 2000,
        validate: (v) => {
            const s = v.trim()
            if (!s) return 'Abstrak proposal wajib diisi.'
            if (s.length < 100) return `Abstrak minimal 100 karakter (sekarang ${s.length}).`
            if (s.length > 2000) return `Abstrak maksimal 2000 karakter.`
            return null
        },
    },
    jenis: {
        validate: (v) => (!v ? 'Jenis kegiatan wajib dipilih.' : null),
    },
    anggaran: {
        validate: (v) => {
            if (!v) return null
            const n = Number(v)
            if (isNaN(n) || n <= 0) return 'Anggaran harus berupa angka positif.'
            if (n > 999_999_999_999) return 'Anggaran terlalu besar.'
            return null
        },
    },
    periodeId: {
        validate: (v) => (!v ? 'Periode wajib dipilih.' : null),
    },
    dokumen: {
        validate: (file, existing) => {
            if (!file && !existing) return null
            if (file) {
                const maxBytes = 10 * 1024 * 1024
                if (file.size > maxBytes) return 'Ukuran file melebihi batas 10 MB.'
                const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
                if (!allowed.includes(file.type)) return 'Format file harus PDF atau DOCX.'
            }
            return null
        },
    },
}

// ── Komponen Helper ────────────────────────────────────────────────────────────
function FieldError({ message }) {
    if (!message) return null
    return (
        <div className="mt-1.5 flex items-start gap-1.5" role="alert">
            <svg className="mt-0.5 size-4 shrink-0 text-red-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm leading-relaxed text-red-700">{message}</p>
        </div>
    )
}

function FieldSuccess({ show }) {
    if (!show) return null
    return (
        <div className="mt-1.5 flex items-start gap-1.5">
            <svg className="mt-0.5 size-4 shrink-0 text-green-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-green-700">Data pada bagian ini sudah sesuai.</p>
        </div>
    )
}

function CharCounter({ value, min, max }) {
    const len = value.trim().length
    const isDanger = len > max
    const isWarning = len > 0 && len < min
    const isOk = len >= min && len <= max
    return (
        <div className={`mt-1.5 shrink-0 text-right text-sm tabular-nums ${isDanger ? 'text-red-700' : isOk ? 'text-green-700' : 'text-slate-400'}`}>
            {len}/{max}
            {isWarning && <span className="ml-1 text-amber-700">(minimal {min})</span>}
        </div>
    )
}

function ProgressBar({ completed, total }) {
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
    return (
        <section aria-label="Kelengkapan form proposal">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Kelengkapan form proposal</span>
                <span className={`text-sm font-semibold tabular-nums ${pct === 100 ? 'text-green-700' : 'text-navy-700'}`}>
                    {pct}%
                </span>
            </div>
            <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-600' : 'bg-navy-600'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </section>
    )
}

// Hanya kolom yang sudah disentuh dan bermasalah yang diberi warna; kolom valid tetap netral
const ERROR_TONE = 'border-red-300 bg-red-50/40 hover:border-red-400 focus:border-red-500 focus:ring-red-600/15'

function StyledInput({ error, touched, className = '', ...props }) {
    const borderClass = touched && error ? ERROR_TONE : ''
    return (
        <input
            {...props}
            aria-invalid={touched && error ? 'true' : undefined}
            className={`input ${borderClass} ${className}`}
        />
    )
}

function StyledTextarea({ error, touched, className = '', ...props }) {
    const borderClass = touched && error ? ERROR_TONE : ''
    return (
        <textarea
            {...props}
            aria-invalid={touched && error ? 'true' : undefined}
            className={`input resize-none leading-relaxed ${borderClass} ${className}`}
        />
    )
}

function StyledSelect({ error, touched, className = '', ...props }) {
    const borderClass = touched && error ? ERROR_TONE : ''
    return (
        <select
            {...props}
            aria-invalid={touched && error ? 'true' : undefined}
            className={`input ${borderClass} ${className}`}
        />
    )
}

// ── Modal Form Buat / Edit Proposal ──────────────────────────────────────────
export function ProposalFormModal({ editData, onClose, onSaved }) {
    const isEdit = !!editData

    const [form, setForm] = useState({
        judul: editData?.judul || '',
        abstrak: editData?.abstrak || '',
        jenis: editData?.jenis || 'penelitian',
        anggaran: editData?.anggaran ? String(Number(editData.anggaran)) : '',
        periodeId: editData?.periodeId || editData?.periode?.id || '',
    })

    const [touched, setTouched] = useState({
        judul: false,
        abstrak: false,
        jenis: false,
        anggaran: false,
        periodeId: false,
        dokumen: false,
    })

    const [dokumenFile, setDokumenFile] = useState(null)
    const [dokumenExisting, setDokumenExisting] = useState(
        editData?.dokumenNama ? { nama: editData.dokumenNama, mime: editData.dokumenMime, ukuran: editData.dokumenUkuran } : null
    )
    const [dragOver, setDragOver] = useState(false)

    const [anggotaList, setAnggotaList] = useState(() => {
        if (!editData?.anggota) return []
        return editData.anggota.map(a => ({
            id: a.user.id,
            name: a.user.name,
            fullName: a.user.fullName,
            email: a.user.email,
            peran: a.peran,
        }))
    })

    const [saving, setSaving] = useState(false)
    const [submitError, setSubmitError] = useState('')
    const [periodeList, setPeriodeList] = useState([])
    const [loadingPeriode, setLoadingPeriode] = useState(true)
    const [showAnggota, setShowAnggota] = useState(anggotaList.length > 0)

    useEffect(() => {
        periodeApi.getAll({ limit: 100, isAktif: true })
            .then(res => setPeriodeList(res.data.data || []))
            .catch(() => { })
            .finally(() => setLoadingPeriode(false))
    }, [])

    const errors = {
        judul: RULES.judul.validate(form.judul),
        abstrak: RULES.abstrak.validate(form.abstrak),
        jenis: RULES.jenis.validate(form.jenis),
        anggaran: RULES.anggaran.validate(form.anggaran),
        periodeId: RULES.periodeId.validate(form.periodeId),
        dokumen: RULES.dokumen.validate(dokumenFile, dokumenExisting),
    }

    const requiredFields = ['judul', 'abstrak', 'jenis', 'periodeId']
    const requiredCompleted = requiredFields.filter(f => !errors[f]).length
    const isFormValid = requiredFields.every(f => !errors[f]) && !errors.anggaran && !errors.dokumen

    const setField = (key) => (e) => {
        setForm(f => ({ ...f, [key]: e.target.value }))
    }

    const touchField = (key) => () => {
        setTouched(t => ({ ...t, [key]: true }))
    }

    const touchAll = () => {
        setTouched({ judul: true, abstrak: true, jenis: true, anggaran: true, periodeId: true, dokumen: true })
    }

    const handleFileChange = (file) => {
        if (!file) return
        setDokumenFile(file)
        setTouched(t => ({ ...t, dokumen: true }))
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileChange(file)
    }

    const addAnggota = (user) => {
        setAnggotaList(prev => [...prev, { ...user, peran: 'anggota' }])
    }

    const removeAnggota = (userId) => {
        setAnggotaList(prev => prev.filter(a => a.id !== userId))
    }

    const setPeran = (userId, peran) => {
        setAnggotaList(prev => prev.map(a => a.id === userId ? { ...a, peran } : a))
    }

    const formatRupiah = (val) => {
        if (!val) return ''
        const num = val.replace(/\D/g, '')
        return num ? Number(num).toLocaleString('id-ID') : ''
    }

    const handleSave = async () => {
        touchAll()
        setSubmitError('')

        if (!isFormValid) {
            setSubmitError('Harap perbaiki semua kesalahan di atas sebelum menyimpan.')
            return
        }

        setSaving(true)
        try {
            const payload = {
                judul: form.judul.trim(),
                abstrak: form.abstrak.trim(),
                jenis: form.jenis,
                ...(form.anggaran ? { anggaran: Number(form.anggaran) } : {}),
                periodeId: Number(form.periodeId),
                anggotaIds: anggotaList.map(a => ({ userId: a.id, peran: a.peran })),
            }
            let savedId
            if (isEdit) {
                await proposalDosenApi.update(editData.id, payload)
                savedId = editData.id
            } else {
                const res = await proposalDosenApi.create(payload)
                savedId = res.data.data?.id
            }
            if (dokumenFile && savedId) {
                await proposalDosenApi.uploadDokumen(savedId, dokumenFile)
            }
            onSaved?.()
            onClose()
        } catch (e) {
            setSubmitError(e.response?.data?.message || 'Gagal menyimpan proposal. Silakan coba lagi.')
        } finally {
            setSaving(false)
        }
    }

    const addedIds = anggotaList.map(a => a.id)
    const anggaranDisplay = form.anggaran ? `Rp ${formatRupiah(form.anggaran)}` : ''
    const dokumenError = touched.dokumen ? errors.dokumen : null

    return (
        <Modal title={isEdit ? 'Edit Proposal' : 'Buat Proposal Baru'} onClose={onClose} maxWidth="max-w-3xl">
            <div className="space-y-6">
                <ProgressBar completed={requiredCompleted} total={requiredFields.length} />

                {/* Struktur utama form */}
                <section className="card overflow-hidden">
                    <header className="border-b border-slate-200 px-5 py-4">
                        <h3 className="text-base font-semibold text-navy-950">Informasi utama proposal</h3>
                        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">Lengkapi data inti proposal secara jelas agar mudah dibaca dan dievaluasi.</p>
                    </header>

                    <div className="space-y-5 px-5 py-5">
                        <div>
                            <FormField label="Judul Proposal" htmlFor="proposal-judul" required>
                                <StyledInput
                                    id="proposal-judul"
                                    type="text"
                                    value={form.judul}
                                    onChange={setField('judul')}
                                    onBlur={touchField('judul')}
                                    placeholder="Masukkan judul proposal yang deskriptif..."
                                    maxLength={200}
                                    error={touched.judul ? errors.judul : null}
                                    touched={touched.judul}
                                />
                            </FormField>
                            <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-4">
                                <div className="flex-1">
                                    {touched.judul && errors.judul
                                        ? <FieldError message={errors.judul} />
                                        : touched.judul && !errors.judul
                                            ? <FieldSuccess show />
                                            : <p className="mt-1.5 text-sm text-slate-500">Minimal 20 karakter, maksimal 200 karakter.</p>
                                    }
                                </div>
                                <CharCounter value={form.judul} min={RULES.judul.minLength} max={RULES.judul.maxLength} />
                            </div>
                        </div>

                        <div>
                            <FormField label="Jenis Kegiatan" htmlFor="proposal-jenis" required>
                                <StyledSelect
                                    id="proposal-jenis"
                                    value={form.jenis}
                                    onChange={e => { setForm(f => ({ ...f, jenis: e.target.value, periodeId: '' })); touchField('jenis')() }}
                                    onBlur={touchField('jenis')}
                                    className="md:max-w-xs"
                                    error={touched.jenis ? errors.jenis : null}
                                    touched={touched.jenis}
                                >
                                    <option value="penelitian">Penelitian</option>
                                    <option value="pengabdian">Pengabdian</option>
                                </StyledSelect>
                            </FormField>
                            {touched.jenis && errors.jenis && <FieldError message={errors.jenis} />}
                        </div>

                        <div>
                            <FormField label="Abstrak" htmlFor="proposal-abstrak" required>
                                <StyledTextarea
                                    id="proposal-abstrak"
                                    value={form.abstrak}
                                    onChange={setField('abstrak')}
                                    onBlur={touchField('abstrak')}
                                    placeholder="Tulis abstrak proposal secara ringkas dan jelas. Jelaskan latar belakang, tujuan, dan metode penelitian..."
                                    rows={6}
                                    maxLength={2000}
                                    error={touched.abstrak ? errors.abstrak : null}
                                    touched={touched.abstrak}
                                />
                            </FormField>
                            <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-4">
                                <div className="flex-1">
                                    {touched.abstrak && errors.abstrak
                                        ? <FieldError message={errors.abstrak} />
                                        : touched.abstrak && !errors.abstrak
                                            ? <FieldSuccess show />
                                            : <p className="mt-1.5 text-sm leading-relaxed text-slate-500">Minimal 100 karakter. Jelaskan latar belakang, tujuan, dan metode secara singkat.</p>
                                    }
                                </div>
                                <CharCounter value={form.abstrak} min={RULES.abstrak.minLength} max={RULES.abstrak.maxLength} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <div>
                                <FormField label="Anggaran (Rp)" htmlFor="proposal-anggaran">
                                    <div className="relative">
                                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                                        <StyledInput
                                            id="proposal-anggaran"
                                            type="number"
                                            value={form.anggaran}
                                            onChange={setField('anggaran')}
                                            onBlur={touchField('anggaran')}
                                            placeholder="5000000"
                                            min={0}
                                            className="pl-10"
                                            error={touched.anggaran ? errors.anggaran : null}
                                            touched={touched.anggaran && !!form.anggaran}
                                        />
                                    </div>
                                </FormField>
                                {touched.anggaran && errors.anggaran
                                    ? <FieldError message={errors.anggaran} />
                                    : form.anggaran && !errors.anggaran
                                        ? <p className="mt-1.5 text-sm font-medium text-green-700 tabular-nums">{anggaranDisplay}</p>
                                        : <p className="mt-1.5 text-sm text-slate-500">Opsional. Masukkan angka tanpa tanda baca tambahan.</p>
                                }
                            </div>

                            <div>
                                <FormField label="Periode" htmlFor="proposal-periode" required>
                                    <StyledSelect
                                        id="proposal-periode"
                                        value={form.periodeId}
                                        onChange={setField('periodeId')}
                                        onBlur={touchField('periodeId')}
                                        disabled={loadingPeriode}
                                        error={touched.periodeId ? errors.periodeId : null}
                                        touched={touched.periodeId}
                                    >
                                        <option value="">-- Pilih Periode --</option>
                                        {periodeList
                                            .filter(p => !form.jenis || p.jenis === form.jenis)
                                            .map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.nama || `Periode #${p.id}`}
                                                </option>
                                            ))}
                                    </StyledSelect>
                                </FormField>
                                {touched.periodeId && errors.periodeId
                                    ? <FieldError message={errors.periodeId} />
                                    : touched.periodeId && !errors.periodeId && form.periodeId
                                        ? <FieldSuccess show />
                                        : <p className="mt-1.5 text-sm text-slate-500">
                                            {loadingPeriode
                                                ? 'Memuat data periode aktif...'
                                                : periodeList.filter(p => !form.jenis || p.jenis === form.jenis).length === 0
                                                    ? 'Tidak ada periode aktif untuk jenis kegiatan ini.'
                                                    : 'Hanya periode aktif yang ditampilkan.'}
                                        </p>
                                }
                            </div>
                        </div>
                    </div>
                </section>

                <section className="card overflow-hidden">
                    <header className="border-b border-slate-200 px-5 py-4">
                        <h3 className="text-base font-semibold text-navy-950">Dokumen utama proposal</h3>
                        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">Unggah dokumen proposal dalam format PDF atau DOCX untuk melengkapi pengajuan.</p>
                    </header>

                    <div className="px-5 py-5">
                        <FormField label="Dokumen Proposal (PDF / DOCX)">
                            <div className="space-y-3">
                                {dokumenExisting && !dokumenFile && (
                                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
                                        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-green-50 text-green-700">
                                            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-base font-semibold text-slate-900">{dokumenExisting.nama}</p>
                                            {dokumenExisting.ukuran && (
                                                <p className="mt-0.5 text-sm text-slate-500">{(dokumenExisting.ukuran / 1024).toFixed(1)} KB</p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDokumenExisting(null)}
                                            className="btn btn-secondary btn-sm"
                                        >
                                            Ganti dokumen
                                        </button>
                                    </div>
                                )}

                                {dokumenFile && (
                                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
                                        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                                            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-base font-semibold text-slate-900">{dokumenFile.name}</p>
                                            <p className="mt-0.5 text-sm text-slate-500">{(dokumenFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setDokumenFile(null); setTouched(t => ({ ...t, dokumen: true })) }}
                                            className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50 hover:text-red-800"
                                        >
                                            Hapus dokumen
                                        </button>
                                    </div>
                                )}

                                {(!dokumenExisting || dokumenFile !== null) && !dokumenFile && (
                                    <label
                                        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-5 py-8 text-center transition-colors focus-within:border-navy-500 focus-within:ring-4 focus-within:ring-navy-600/15 ${dragOver
                                            ? 'border-navy-500 bg-navy-50'
                                            : dokumenError
                                                ? 'border-red-300 bg-red-50/40 hover:border-red-400'
                                                : 'border-slate-300 bg-white hover:border-navy-400 hover:bg-navy-50/60'
                                            }`}
                                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                        onDragLeave={() => setDragOver(false)}
                                        onDrop={handleDrop}
                                    >
                                        <div className="grid size-11 place-items-center rounded-full bg-navy-50 text-navy-700">
                                            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-base font-semibold text-slate-800">
                                                {dragOver ? 'Lepaskan file di sini' : 'Tarik file ke sini atau klik untuk memilih'}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-500">Format PDF atau DOCX, ukuran maksimal 10 MB.</p>
                                        </div>
                                        <input
                                            type="file"
                                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                            className="sr-only"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0]
                                                if (f) handleFileChange(f)
                                                e.target.value = ''
                                            }}
                                        />
                                    </label>
                                )}
                            </div>
                        </FormField>
                        {dokumenError && <FieldError message={dokumenError} />}
                    </div>
                </section>

                <section className="card overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowAnggota(v => !v)}
                        aria-expanded={showAnggota}
                        className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 ${showAnggota ? 'border-b border-slate-200' : ''}`}
                    >
                        <div className="min-w-0">
                            <p className="flex items-center gap-2 text-base font-semibold text-navy-950">
                                Anggota tim
                                {anggotaList.length > 0 && (
                                    <span className="inline-flex min-w-6 shrink-0 justify-center rounded-full bg-navy-800 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                                        {anggotaList.length}
                                    </span>
                                )}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">Tambahkan dosen atau mahasiswa yang terlibat dalam proposal ini.</p>
                        </div>

                        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-600">
                            {showAnggota ? 'Sembunyikan' : 'Tampilkan'}
                            <svg className={`size-4 transition-transform ${showAnggota ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 9l-7 7-7-7" />
                            </svg>
                        </span>
                    </button>

                    {showAnggota && (
                        <div className="space-y-5 px-5 py-5">
                            <p className="text-sm leading-relaxed text-slate-500">
                                Tambahkan dosen atau mahasiswa sebagai anggota tim. Mereka akan menerima undangan untuk menyetujui keterlibatan pada proposal ini.
                            </p>

                            <AnggotaSearch onAdd={addAnggota} addedIds={addedIds} />

                            {anggotaList.length > 0 ? (
                                <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                                    {anggotaList.map((a) => (
                                        <li key={a.id} className="flex flex-col gap-3 bg-white px-4 py-3 md:flex-row md:items-center">
                                            <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-navy-100 text-base font-semibold text-navy-800">
                                                    {(a.fullName || a.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-base font-semibold text-slate-900">{a.fullName || a.name}</p>
                                                    <p className="mt-0.5 truncate text-sm text-slate-500">{a.email}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <select
                                                    aria-label={`Peran ${a.fullName || a.name}`}
                                                    value={a.peran}
                                                    onChange={(e) => setPeran(a.id, e.target.value)}
                                                    className="input min-h-9 py-1.5 text-sm sm:w-40"
                                                >
                                                    {PERAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>

                                                <button
                                                    type="button"
                                                    onClick={() => removeAnggota(a.id)}
                                                    className="btn btn-danger btn-sm"
                                                >
                                                    Hapus anggota
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center">
                                    <p className="text-base font-medium text-slate-700">Belum ada anggota ditambahkan</p>
                                    <p className="mt-1 text-sm text-slate-500">Anda dapat menyimpan proposal tanpa anggota atau menambahkan anggota terlebih dahulu.</p>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {submitError && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
                        <svg className="mt-0.5 size-4 shrink-0 text-red-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <p className="text-sm leading-relaxed text-red-700">{submitError}</p>
                    </div>
                )}

                {/* Footer lengket: tombol aksi selalu terlihat saat formulir panjang digulir */}
                <footer className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center gap-2.5 border-t border-slate-200 bg-white px-6 py-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`btn flex-1 sm:flex-none ${isFormValid
                            ? 'btn-primary'
                            : 'bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700'
                            }`}
                    >
                        {saving ? (
                            <>
                                <span className="spinner" aria-hidden="true" />
                                Menyimpan data...
                            </>
                        ) : (
                            <>
                                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isEdit ? "M5 13l4 4L19 7" : "M12 4v16m8-8H4"} />
                                </svg>
                                {isEdit ? 'Simpan perubahan' : 'Buat proposal'}
                            </>
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="btn btn-secondary flex-1 sm:flex-none"
                    >
                        Batal
                    </button>

                    {!isFormValid && (
                        <p className="order-first w-full text-sm text-slate-500 sm:order-last sm:ml-auto sm:w-auto">
                            {requiredCompleted}/{requiredFields.length} field wajib telah lengkap
                        </p>
                    )}
                </footer>
            </div>
        </Modal>
    )
}
