import { useState, useRef } from 'react'
import api from '../../api/axios'
import { File as FileIcon, FileChartColumn, Plus, TriangleAlert, Upload } from 'lucide-react'

const JENIS_LAPORAN = [
    { value: 'kemajuan', label: 'Laporan Kemajuan' },
    { value: 'akhir', label: 'Laporan Akhir' },
    { value: 'keuangan', label: 'Laporan Keuangan' },
]

const ALLOWED_MIME = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_SIZE_MB = 10

function UploadLaporanForm({ proposalId, onSuccess, onCancel }) {
    const [form, setForm] = useState({ jenis: '', judul: '', keterangan: '' })
    const [file, setFile] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const fileInputRef = useRef(null)

    const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0]
        if (!selected) return

        if (!ALLOWED_MIME.includes(selected.type)) {
            setError('Hanya file PDF atau DOCX yang diizinkan.')
            fileInputRef.current.value = ''
            return
        }
        if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
            setError(`Ukuran file maksimal ${MAX_SIZE_MB} MB.`)
            fileInputRef.current.value = ''
            return
        }
        setError('')
        setFile(selected)
    }

    const handleRemoveFile = () => {
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const handleSubmit = async () => {
        setError('')
        if (!form.jenis || !form.judul) {
            setError('Jenis dan judul laporan wajib diisi.')
            return
        }
        if (!file) {
            setError('File laporan wajib diunggah.')
            return
        }
        setLoading(true)
        try {
            const formData = new FormData()
            formData.append('jenis', form.jenis)
            formData.append('judul', form.judul)
            if (form.keterangan) formData.append('keterangan', form.keterangan)
            formData.append('file', file)

            await api.post(`/proposals/${proposalId}/laporan`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            onSuccess()
        } catch (e) {
            setError(e.response?.data?.message || 'Gagal mengunggah laporan.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <header>
                <h3 className="text-base font-semibold text-navy-950">Unggah laporan baru</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">Isi informasi laporan secara lengkap sebelum mengunggah berkas pendukung.</p>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <label htmlFor="laporan-jenis" className="label">
                        Jenis Laporan <span className="text-red-600">*</span>
                    </label>
                    <select
                        id="laporan-jenis"
                        name="jenis"
                        value={form.jenis}
                        onChange={handleChange}
                        className="input"
                    >
                        <option value="">-- Pilih jenis laporan --</option>
                        {JENIS_LAPORAN.map(j => (
                            <option key={j.value} value={j.value}>{j.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label htmlFor="laporan-judul" className="label">
                        Judul Laporan <span className="text-red-600">*</span>
                    </label>
                    <input
                        id="laporan-judul"
                        type="text"
                        name="judul"
                        value={form.judul}
                        onChange={handleChange}
                        placeholder="Contoh: Laporan Kemajuan Bulan ke-3"
                        className="input"
                    />
                </div>
            </div>

            <div>
                <span className="label">
                    File Laporan <span className="text-red-600">*</span>
                </span>

                {!file ? (
                    <label className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center transition-colors hover:border-navy-400 hover:bg-navy-50/60">
                        <div className="flex flex-col items-center gap-2">
                            <div className="grid size-11 place-items-center rounded-full bg-navy-50 text-navy-700">
                                <Upload className="size-5" strokeWidth={1.5} aria-hidden="true" />
                            </div>
                            <span className="text-base font-semibold text-slate-800">Klik untuk memilih file laporan</span>
                            <span className="text-sm text-slate-500">Format PDF atau DOCX, ukuran maksimal {MAX_SIZE_MB} MB</span>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </label>
                ) : (
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
                        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                            <FileIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold text-slate-900">{file.name}</p>
                            <p className="mt-0.5 text-sm text-slate-500">{formatSize(file.size)}</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50 hover:text-red-800"
                        >
                            Hapus file
                        </button>
                    </div>
                )}
            </div>

            <div>
                <label htmlFor="laporan-keterangan" className="label">Keterangan (opsional)</label>
                <textarea
                    id="laporan-keterangan"
                    name="keterangan"
                    value={form.keterangan}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Catatan tambahan mengenai laporan ini..."
                    className="input resize-none leading-relaxed"
                />
            </div>

            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
                    <p className="text-sm leading-relaxed text-red-700">{error}</p>
                </div>
            )}

            {loading && (
                <div className="flex items-center gap-3 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3">
                    <span className="spinner text-navy-600" aria-hidden="true" />
                    <p className="text-sm text-navy-800">Mengunggah file, harap tunggu...</p>
                </div>
            )}

            <footer className="flex flex-col-reverse gap-2.5 border-t border-slate-200 pt-4 sm:flex-row">
                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn btn-primary"
                >
                    {loading ? 'Menyimpan laporan...' : 'Simpan laporan'}
                </button>
                <button
                    onClick={onCancel}
                    disabled={loading}
                    className="btn btn-secondary"
                >
                    Batal
                </button>
            </footer>
        </section>
    )
}

function LaporanCard({ laporan, canDelete, onDelete }) {
    const [deleting, setDeleting] = useState(false)
    const [downloading, setDownloading] = useState(false)

    const jenisLabel = JENIS_LAPORAN.find(j => j.value === laporan.jenis)?.label || laporan.jenis

    const handleDelete = async () => {
        if (!confirm(`Hapus laporan "${laporan.judul}"?`)) return
        setDeleting(true)
        try {
            await onDelete(laporan.id)
        } finally {
            setDeleting(false)
        }
    }

    const handleView = async () => {
        if (laporan.dokumenNama) {
            setDownloading(true)
            try {
                const res = await api.get(`/proposals/laporan/${laporan.id}/download`, {
                    responseType: 'blob',
                })
                const url = URL.createObjectURL(res.data)
                window.open(url, '_blank')
                setTimeout(() => URL.revokeObjectURL(url), 10000)
            } catch {
                alert('Gagal membuka file laporan.')
            } finally {
                setDownloading(false)
            }
        } else if (laporan.dokumenUrl) {
            window.open(laporan.dokumenUrl, '_blank')
        }
    }

    const hasFile = laporan.dokumenNama || laporan.dokumenUrl

    const formatSize = (bytes) => {
        if (!bytes) return null
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    return (
        <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                        <FileChartColumn className="size-5" strokeWidth={1.5} aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-slate-900">{laporan.judul}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span className="badge badge-tag">
                                {jenisLabel}
                            </span>
                            {laporan.dokumenNama && (
                                <span className="max-w-[180px] truncate text-sm text-slate-500">{laporan.dokumenNama}</span>
                            )}
                            {laporan.dokumenUkuran && (
                                <span className="text-sm text-slate-500">{formatSize(laporan.dokumenUkuran)}</span>
                            )}
                            <span className="text-sm text-slate-500">
                                {new Date(laporan.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                        {laporan.keterangan && (
                            <p className="mt-3 text-sm leading-relaxed text-slate-600">{laporan.keterangan}</p>
                        )}
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {hasFile && (
                        <button
                            onClick={handleView}
                            disabled={downloading}
                            className="btn btn-secondary btn-sm"
                        >
                            {downloading ? 'Membuka file...' : 'Lihat laporan'}
                        </button>
                    )}
                    {canDelete && (
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="btn btn-danger btn-sm"
                        >
                            {deleting ? 'Menghapus...' : 'Hapus laporan'}
                        </button>
                    )}
                </div>
            </div>
        </article>
    )
}

// ── Main Tab Component ─────────────────────────────────────────────────────────
export function LaporanTab({ proposalId, laporan = [], status, onRefresh }) {
    const [showForm, setShowForm] = useState(false)

    const canUpload = status === 'disetujui'

    const handleDelete = async (id) => {
        await api.delete(`/proposals/laporan/${id}`)
        onRefresh?.()
    }

    const handleSuccess = () => {
        setShowForm(false)
        onRefresh?.()
    }

    return (
        <section className="space-y-4">
            {!canUpload && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
                    <p className="text-base font-semibold text-amber-900">Unggah laporan belum tersedia</p>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">
                        Laporan hanya dapat diunggah setelah proposal <strong>disetujui</strong> oleh LPPM.
                    </p>
                </div>
            )}

            {canUpload && !showForm && (
                <button
                    onClick={() => setShowForm(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-5 py-4 text-base font-medium text-slate-700 transition-colors hover:border-navy-400 hover:bg-navy-50/60 hover:text-navy-900"
                >
                    <Plus className="size-5 text-slate-400" aria-hidden="true" />
                    Unggah laporan baru
                </button>
            )}

            {showForm && (
                <UploadLaporanForm
                    proposalId={proposalId}
                    onSuccess={handleSuccess}
                    onCancel={() => setShowForm(false)}
                />
            )}

            {laporan.length === 0 ? (
                <div className="rounded-xl border border-slate-200 px-5 py-10 text-center">
                    <p className="text-base font-medium text-slate-700">Belum ada laporan yang diunggah</p>
                    <p className="mt-1 text-sm text-slate-500">Laporan kemajuan, akhir, atau keuangan akan tampil di bagian ini.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {laporan.map(l => (
                        <LaporanCard
                            key={l.id}
                            laporan={l}
                            canDelete={canUpload}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}
