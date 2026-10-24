import { useRef, useState } from 'react'
import api from '../../api/axios'
import { CloudUpload, FileText, Plus, TriangleAlert } from 'lucide-react'

const MIME_ICON = {
    pdf: { bg: 'bg-red-50', color: 'text-red-600', label: 'PDF' },
    doc: { bg: 'bg-navy-50', color: 'text-navy-700', label: 'DOCX' },
    xls: { bg: 'bg-green-50', color: 'text-green-700', label: 'XLSX' },
    img: { bg: 'bg-purple-50', color: 'text-purple-700', label: 'IMG' },
    default: { bg: 'bg-slate-100', color: 'text-slate-500', label: 'FILE' },
}

function getFileType(name = '') {
    const ext = name.split('.').pop()?.toLowerCase()
    if (['pdf'].includes(ext)) return MIME_ICON.pdf
    if (['doc', 'docx'].includes(ext)) return MIME_ICON.doc
    if (['xls', 'xlsx'].includes(ext)) return MIME_ICON.xls
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return MIME_ICON.img
    return MIME_ICON.default
}

function formatBytes(bytes) {
    if (!bytes) return null
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${(bytes / 1024).toFixed(1)} KB`
}

function FileIcon({ name }) {
    const type = getFileType(name)
    return (
        <div className={`grid size-11 shrink-0 place-items-center rounded-lg ${type.bg}`}>
            <FileText className={`size-5 ${type.color}`} strokeWidth={1.5} aria-hidden="true" />
        </div>
    )
}

// ── Upload Form ────────────────────────────────────────────────────────────────
function UploadDokumenForm({ proposalId, onSuccess, onCancel }) {
    const [namaFile, setNamaFile] = useState('')
    const [selectedFile, setSelectedFile] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef(null)

    const ACCEPTED = ['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
    ]
    const ACCEPTED_EXT = '.pdf,.doc,.docx,.xls,.xlsx'
    const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

    const validateFile = (file) => {
        if (!file) return 'Pilih file terlebih dahulu.'
        if (!ACCEPTED.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|xls|xlsx)$/i))
            return 'Format file tidak didukung. Gunakan PDF, DOCX, atau XLSX.'
        if (file.size > MAX_SIZE) return 'Ukuran file maksimal 10 MB.'
        return null
    }

    const handleFileChange = (file) => {
        const err = validateFile(file)
        if (err) { setError(err); return }
        setError('')
        setSelectedFile(file)
        if (!namaFile) setNamaFile(file.name)
    }

    const handleInputChange = (e) => {
        const file = e.target.files?.[0]
        if (file) handleFileChange(file)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileChange(file)
    }

    const handleSubmit = async () => {
        setError('')
        if (!namaFile.trim()) { setError('Nama file wajib diisi.'); return }
        if (!selectedFile) { setError('Pilih file untuk diunggah.'); return }

        setLoading(true)
        try {
            const formData = new FormData()
            formData.append('namaFile', namaFile.trim())
            formData.append('file', selectedFile)

            await api.post(`/proposals/${proposalId}/dokumen`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            onSuccess()
        } catch (e) {
            setError(e.response?.data?.message || 'Gagal mengunggah dokumen.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <header>
                <h3 className="text-base font-semibold text-navy-950">Tambah dokumen lampiran</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">Unggah berkas pendukung proposal seperti surat izin, SK, atau dokumen pelengkap lainnya.</p>
            </header>

            <div>
                <label htmlFor="dokumen-nama" className="label">
                    Nama / Label Dokumen <span className="text-red-600">*</span>
                </label>
                <input
                    id="dokumen-nama"
                    type="text"
                    value={namaFile}
                    onChange={e => setNamaFile(e.target.value)}
                    placeholder="Contoh: SK Penelitian 2025"
                    className="input"
                />
            </div>

            <div>
                <span className="label">
                    File Dokumen <span className="text-red-600">*</span>
                </span>

                {selectedFile ? (
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
                        <FileIcon name={selectedFile.name} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold text-slate-900">{selectedFile.name}</p>
                            <p className="mt-0.5 text-sm text-slate-500">{formatBytes(selectedFile.size)}</p>
                        </div>
                        <button
                            onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                            className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50 hover:text-red-800"
                        >
                            Ganti file
                        </button>
                    </div>
                ) : (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        className={`cursor-pointer rounded-xl border border-dashed px-5 py-8 text-center transition-colors ${dragOver ? 'border-navy-500 bg-navy-50' : 'border-slate-300 bg-white hover:border-navy-400 hover:bg-navy-50/60'}`}
                    >
                        <div className="mx-auto grid size-11 place-items-center rounded-full bg-navy-50 text-navy-700">
                            <CloudUpload className="size-5" strokeWidth={1.5} aria-hidden="true" />
                        </div>
                        <p className="mt-3 text-base font-semibold text-slate-800">Klik atau seret file ke area ini</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">Format yang didukung: PDF, DOCX, XLSX. Ukuran maksimal 10 MB.</p>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXT}
                    onChange={handleInputChange}
                    className="hidden"
                />
            </div>

            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
                    <p className="text-sm leading-relaxed text-red-700">{error}</p>
                </div>
            )}

            <footer className="flex flex-col-reverse gap-2.5 border-t border-slate-200 pt-4 sm:flex-row">
                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn btn-primary"
                >
                    {loading ? 'Mengunggah dokumen...' : 'Unggah dokumen'}
                </button>
                <button
                    onClick={onCancel}
                    className="btn btn-secondary"
                >
                    Batal
                </button>
            </footer>
        </section>
    )
}

// ── Dokumen Card ──────────────────────────────────────────────────────────────
function DokumenCard({ dokumen, canDelete, onDelete }) {
    const [deleting, setDeleting] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const fileType = getFileType(dokumen.fileNama || dokumen.namaFile)

    const handleDelete = async () => {
        if (!confirm(`Hapus dokumen "${dokumen.namaFile}"?`)) return
        setDeleting(true)
        try {
            await onDelete(dokumen.id)
        } finally {
            setDeleting(false)
        }
    }

    const handleDownload = async () => {
        if (dokumen.fileUrl) {
            window.open(dokumen.fileUrl, '_blank', 'noopener,noreferrer')
            return
        }

        setDownloading(true)
        try {
            const res = await api.get(`/proposals/dokumen/${dokumen.id}/download`, {
                responseType: 'blob',
            })
            const blobUrl = window.URL.createObjectURL(
                new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' })
            )
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = dokumen.fileNama || dokumen.namaFile
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(blobUrl)
        } catch {
            alert('Gagal mengunduh dokumen. Silakan coba lagi.')
        } finally {
            setDownloading(false)
        }
    }

    const canDownload = dokumen.fileUrl || dokumen.fileNama

    return (
        <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                    <FileIcon name={dokumen.fileNama || dokumen.namaFile} />

                    <div className="min-w-0 flex-1">
                        <p className="break-words text-base font-semibold text-slate-900">{dokumen.namaFile}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span className="badge badge-tag">
                                {fileType.label}
                            </span>
                            {dokumen.ukuran && (
                                <span className="text-sm text-slate-500">{formatBytes(dokumen.ukuran)}</span>
                            )}
                            <span className="text-sm text-slate-500">
                                {new Date(dokumen.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            {dokumen.fileUrl ? (
                                <span className="text-sm text-slate-500">Link eksternal</span>
                            ) : (
                                <span className="text-sm font-medium text-green-700">Tersimpan di server</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {canDownload ? (
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="btn btn-secondary btn-sm"
                        >
                            {downloading ? 'Mengunduh...' : 'Unduh dokumen'}
                        </button>
                    ) : (
                        <span className="px-3 py-2 text-sm text-slate-400">Tidak tersedia</span>
                    )}
                    {canDelete && (
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="btn btn-danger btn-sm"
                        >
                            {deleting ? 'Menghapus...' : 'Hapus dokumen'}
                        </button>
                    )}
                </div>
            </div>
        </article>
    )
}

// ── Main Tab Component ─────────────────────────────────────────────────────────
export function DokumenTab({ proposalId, dokumenLampiran = [], status, onRefresh }) {
    const [showForm, setShowForm] = useState(false)

    const canUpload = ['draft', 'revisi', 'diajukan', 'disetujui'].includes(status)

    const handleDelete = async (id) => {
        await api.delete(`/proposals/dokumen/${id}`)
        onRefresh?.()
    }

    const handleSuccess = () => {
        setShowForm(false)
        onRefresh?.()
    }

    return (
        <section className="space-y-4">
            <div className="rounded-lg border border-navy-100 bg-navy-50 px-4 py-3.5">
                <p className="text-base font-semibold text-navy-900">Informasi dokumen lampiran</p>
                <p className="mt-1 text-sm leading-relaxed text-navy-800">
                    Dokumen lampiran adalah berkas pendukung proposal seperti SK, surat izin, atau referensi. Dokumen ini berbeda dari dokumen utama proposal.
                </p>
            </div>

            {canUpload && !showForm && (
                <button
                    onClick={() => setShowForm(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-5 py-4 text-base font-medium text-slate-700 transition-colors hover:border-navy-400 hover:bg-navy-50/60 hover:text-navy-900"
                >
                    <Plus className="size-5 text-slate-400" aria-hidden="true" />
                    Tambah dokumen lampiran
                </button>
            )}

            {showForm && (
                <UploadDokumenForm
                    proposalId={proposalId}
                    onSuccess={handleSuccess}
                    onCancel={() => setShowForm(false)}
                />
            )}

            {!canUpload && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
                    <p className="text-base font-semibold text-amber-900">Penambahan dokumen tidak tersedia</p>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">
                        Penambahan dokumen tidak tersedia karena proposal ini telah <strong>ditolak</strong>.
                    </p>
                </div>
            )}

            {dokumenLampiran.length === 0 ? (
                <div className="rounded-xl border border-slate-200 px-5 py-10 text-center">
                    <p className="text-base font-medium text-slate-700">Belum ada dokumen lampiran</p>
                    <p className="mt-1 text-sm text-slate-500">Unggah dokumen pendukung agar informasi proposal lebih lengkap.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {dokumenLampiran.map(d => (
                        <DokumenCard
                            key={d.id}
                            dokumen={d}
                            canDelete={canUpload}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}
