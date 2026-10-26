import { useEffect, useState, useCallback } from 'react'
import api from '../../api/axios'
import { openDokumenWithAuth, STATUS_LABEL, STATUS_COLOR, JENIS_LABEL } from './periodeConstants'
import { Badge, CloseButton, Modal, OverlayPanel, SectionLabel } from './periodeComponents'
import { ChevronLeft } from 'lucide-react'
import UserAvatar from '../../components/UserAvatar'

// ─── Ketua Proposal Detail ────────────────────────────────────────────────────

export default function KetuaProposalDetail({ proposalId, onClose, onBack }) {
    const [proposal, setProposal] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const [activeTab, setActiveTab] = useState('info')
    const [reviews, setReviews] = useState([])
    const [laporan, setLaporan] = useState([])
    const [dokumen, setDokumen] = useState([])
    const [subLoading, setSubLoading] = useState(false)

    const [statusModal, setStatusModal] = useState(false)
    const [statusForm, setStatusForm] = useState({ status: '', catatanRevisi: '' })
    const [statusSubmitting, setStatusSubmitting] = useState(false)
    const [statusError, setStatusError] = useState(null)

    const [reviewerModal, setReviewerModal] = useState(false)
    const [availableReviewers, setAvailableReviewers] = useState([])
    const [reviewerIds, setReviewerIds] = useState([])
    const [reviewerSubmitting, setReviewerSubmitting] = useState(false)
    const [reviewerError, setReviewerError] = useState(null)

    const fetchDetail = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const res = await api.get(`/proposals/${proposalId}`)
            setProposal(res.data.data)
        } catch {
            setError('Gagal memuat detail proposal')
        } finally {
            setLoading(false)
        }
    }, [proposalId])

    useEffect(() => { fetchDetail() }, [fetchDetail])

    useEffect(() => {
        if (!proposal) return
        const load = async () => {
            setSubLoading(true)
            try {
                if (activeTab === 'reviewer') {
                    const res = await api.get(`/proposals/${proposalId}/reviews`)
                    setReviews(res.data.data || [])
                } else if (activeTab === 'laporan') {
                    const res = await api.get(`/proposals/${proposalId}/laporan`)
                    setLaporan(res.data.data || [])
                } else if (activeTab === 'dokumen') {
                    const res = await api.get(`/proposals/${proposalId}/dokumen`)
                    setDokumen(res.data.data || [])
                }
            } catch { /* ignore */ } finally {
                setSubLoading(false)
            }
        }
        load()
    }, [activeTab, proposal, proposalId])

    const openStatusModal = () => {
        setStatusForm({ status: proposal?.status || '', catatanRevisi: proposal?.catatanRevisi || '' })
        setStatusError(null)
        setStatusModal(true)
    }

    const handleUpdateStatus = async () => {
        if (!statusForm.status) return
        setStatusSubmitting(true); setStatusError(null)
        try {
            await api.patch(`/proposals/${proposalId}/status`, {
                status: statusForm.status,
                ...(statusForm.catatanRevisi ? { catatanRevisi: statusForm.catatanRevisi } : {}),
            })
            setStatusModal(false)
            await fetchDetail()
        } catch (err) {
            setStatusError(err.response?.data?.message || 'Gagal memperbarui status')
        } finally {
            setStatusSubmitting(false)
        }
    }

    const openReviewerModal = async () => {
        setReviewerError(null)
        setReviewerIds(proposal?.reviewerTugasan?.map(r => r.reviewer?.id) || [])
        try {
            const res = await api.get('/users', { params: { role: 'reviewer', limit: 100 } })
            const terlibatIds = new Set([
                proposal?.pengusul?.id,
                ...(proposal?.anggota?.map(a => a.user?.id ?? a.userId) ?? []),
            ].filter(Boolean))
            const filtered = (res.data.data || []).filter(r => !terlibatIds.has(r.id))
            setAvailableReviewers(filtered)
        } catch { setAvailableReviewers([]) }
        setReviewerModal(true)
    }

    const handleTugaskanReviewer = async () => {
        if (reviewerIds.length === 0) { setReviewerError('Pilih minimal 1 reviewer'); return }
        setReviewerSubmitting(true); setReviewerError(null)
        try {
            await api.post(`/proposals/${proposalId}/reviewers`, { reviewerIds })
            setReviewerModal(false)
            await fetchDetail()
        } catch (err) {
            setReviewerError(err.response?.data?.message || 'Gagal menugaskan reviewer')
        } finally {
            setReviewerSubmitting(false)
        }
    }

    const handleHapusReviewer = async (reviewerId) => {
        try {
            await api.delete(`/proposals/${proposalId}/reviewers/${reviewerId}`)
            await fetchDetail()
        } catch { /* ignore */ }
    }

    const TABS = [
        { id: 'info', label: 'Informasi Proposal' },
        { id: 'reviewer', label: 'Hasil Review' },
        { id: 'laporan', label: 'Laporan Kegiatan' },
        { id: 'dokumen', label: 'Dokumen Pendukung' },
    ]

    if (loading) {
        return (
            <OverlayPanel onClose={onClose} size="lg">
                <div className="flex items-center justify-center py-24">
                    <p className="flex items-center gap-3 text-base text-slate-500">
                        <span className="spinner text-navy-600" aria-hidden="true" />
                        Memuat detail proposal...
                    </p>
                </div>
            </OverlayPanel>
        )
    }

    if (error || !proposal) {
        return (
            <OverlayPanel onClose={onClose} size="lg">
                <div className="flex flex-col items-center justify-center gap-4 py-24">
                    <p className="text-base font-medium text-red-600">{error || 'Proposal tidak ditemukan'}</p>
                    <button
                        onClick={onBack}
                        className="btn btn-secondary"
                    >
                        Kembali ke daftar proposal
                    </button>
                </div>
            </OverlayPanel>
        )
    }

    const p = proposal
    const ketua = p.pengusul
    const anggota = p.anggota || []
    const reviewerTugasan = p.reviewerTugasan || []
    const canChangeStatus = ['diajukan', 'review', 'revisi', 'disetujui', 'ditolak'].includes(p.status)

    return (
        <>
            <OverlayPanel onClose={onClose} size="lg">
                {/* Header utama panel */}
                <header className="border-b border-slate-200 px-6 pt-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={onBack}
                                    className="btn btn-ghost btn-sm -ml-2.5"
                                    title="Kembali ke daftar"
                                >
                                    <ChevronLeft className="size-3.5" aria-hidden="true" />
                                    Kembali ke daftar
                                </button>
                                <span className="text-sm text-slate-500">Detail Proposal</span>
                            </div>

                            <h1 className="mt-3 text-2xl leading-snug text-navy-950">
                                {p.judul}
                            </h1>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Badge
                                    label={STATUS_LABEL[p.status] || p.status}
                                    className={STATUS_COLOR[p.status] || 'badge-neutral'}
                                />
                                <Badge
                                    label={JENIS_LABEL[p.jenis] || p.jenis}
                                    className="badge-plain"
                                />
                            </div>
                        </div>

                        <CloseButton onClick={onClose} label="Tutup Panel" />
                    </div>

                    {/* Aksi utama */}
                    <div className="mt-4 flex flex-wrap gap-2.5">
                        <button
                            onClick={openStatusModal}
                            disabled={!canChangeStatus}
                            className="btn btn-secondary btn-sm"
                        >
                            Ubah Status Proposal
                        </button>
                        <button
                            onClick={openReviewerModal}
                            disabled={!['diajukan', 'review'].includes(p.status)}
                            className="btn btn-primary btn-sm"
                        >
                            Tugaskan Reviewer
                        </button>
                    </div>

                    {/* Navigasi tab */}
                    <nav className="-mb-px mt-4 flex gap-6 overflow-x-auto" aria-label="Bagian detail proposal">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                aria-current={activeTab === tab.id ? 'true' : undefined}
                                className={`whitespace-nowrap border-b-2 px-0.5 py-3 text-sm font-semibold transition-colors duration-150 ${activeTab === tab.id
                                        ? 'border-navy-800 text-navy-950'
                                        : 'border-transparent text-slate-500 hover:text-navy-900'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-6">
                    {activeTab === 'info' && (
                        <div className="divide-y divide-slate-200">
                            <section className="py-6">
                                <SectionLabel>Ringkasan Proposal</SectionLabel>
                                <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                                    {p.abstrak || '—'}
                                </p>
                            </section>

                            <section className="grid gap-x-10 gap-y-8 py-6 lg:grid-cols-2">
                                <article>
                                    <SectionLabel>Ketua Pengusul</SectionLabel>
                                    <div className="flex items-start gap-4">
                                        <UserAvatar user={ketua} className="size-11 text-base" fallbackClassName="bg-navy-800 text-white" />
                                        <div className="min-w-0">
                                            <p className="text-base font-semibold text-slate-900">
                                                {ketua?.fullName || ketua?.name || '—'}
                                            </p>
                                            <p className="mt-0.5 text-sm text-slate-500">{ketua?.email || '—'}</p>
                                            {(ketua?.nidn || ketua?.programStudi) && (
                                                <div className="mt-2 space-y-0.5 text-sm text-slate-500">
                                                    {ketua?.nidn && <p>NIDN: {ketua.nidn}</p>}
                                                    {ketua?.programStudi && <p>Program Studi: {ketua.programStudi}</p>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </article>

                                <article>
                                    <SectionLabel>Informasi Pengajuan</SectionLabel>
                                    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                                        <div>
                                            <dt className="text-sm text-slate-500">Periode</dt>
                                            {p.periode ? (
                                                <dd className="mt-0.5 text-base font-semibold text-slate-900">{p.periode.nama} · {p.periode.tahun}</dd>
                                            ) : (
                                                <dd className="mt-0.5 text-base text-slate-500">—</dd>
                                            )}
                                        </div>
                                        <div>
                                            <dt className="text-sm text-slate-500">Anggaran</dt>
                                            <dd className="mt-0.5 text-base font-semibold text-slate-900 tabular-nums">
                                                {p.anggaran != null ? `Rp ${Number(p.anggaran).toLocaleString('id-ID')}` : '—'}
                                            </dd>
                                        </div>
                                    </dl>
                                </article>
                            </section>

                            {anggota.length > 0 && (
                                <section className="py-6">
                                    <SectionLabel>Anggota Tim</SectionLabel>
                                    <div className="mb-3 text-sm text-slate-500">Jumlah anggota tim: {anggota.length}</div>
                                    <div className="grid gap-x-8 md:grid-cols-2">
                                        {anggota.map((a) => (
                                            <article key={a.id} className="border-b border-slate-100 py-3 last:border-b-0 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                                                <div className="flex items-center gap-3.5">
                                                    <UserAvatar user={a.user} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                                                    <div className="min-w-0">
                                                        <p className="text-base font-medium text-slate-900">
                                                            {a.user?.fullName || a.user?.name || '—'}
                                                        </p>
                                                        <p className="text-sm capitalize text-slate-500">{a.peran || 'anggota'}</p>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {p.dokumenNama && (
                                <section className="py-6">
                                    <SectionLabel>Dokumen Proposal</SectionLabel>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="break-words text-base font-medium text-slate-900">{p.dokumenNama}</p>
                                            {p.dokumenUkuran && (
                                                <p className="mt-0.5 text-sm text-slate-500">Ukuran file: {(p.dokumenUkuran / 1024).toFixed(1)} KB</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => openDokumenWithAuth(p.id)}
                                            className="btn btn-secondary btn-sm shrink-0 self-start sm:self-auto"
                                        >
                                            Lihat Dokumen
                                        </button>
                                    </div>
                                </section>
                            )}

                            {p.catatanRevisi && (
                                <section className="py-6">
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
                                        <SectionLabel>Catatan Revisi</SectionLabel>
                                        <p className="-mt-1 text-base leading-relaxed text-amber-800">{p.catatanRevisi}</p>
                                    </div>
                                </section>
                            )}

                            {reviewerTugasan.length > 0 && (
                                <section className="py-6">
                                    <SectionLabel>Reviewer Ditugaskan</SectionLabel>
                                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                                        {reviewerTugasan.map((rt) => (
                                            <article key={rt.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center gap-3.5">
                                                    <UserAvatar user={rt.reviewer || { id: rt.reviewerId }} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                                                    <p className="text-base font-medium text-slate-900">
                                                        {rt.reviewer?.fullName || rt.reviewer?.name || '—'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleHapusReviewer(rt.reviewer?.id)}
                                                    className="btn btn-danger btn-sm self-start sm:self-auto"
                                                >
                                                    Hapus Reviewer
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section className="py-6">
                                <SectionLabel>Timeline Proposal</SectionLabel>
                                <dl className="grid gap-x-8 gap-y-4 md:grid-cols-3">
                                    <div>
                                        <dt className="text-sm text-slate-500">Tanggal dibuat</dt>
                                        <dd className="mt-0.5 text-base font-semibold text-slate-900">
                                            {new Date(p.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                                        </dd>
                                    </div>
                                    {p.submittedAt && (
                                        <div>
                                            <dt className="text-sm text-slate-500">Tanggal diajukan</dt>
                                            <dd className="mt-0.5 text-base font-semibold text-slate-900">
                                                {new Date(p.submittedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </dd>
                                        </div>
                                    )}
                                    {p.approvedAt && (
                                        <div>
                                            <dt className="text-sm text-slate-500">Tanggal disetujui</dt>
                                            <dd className="mt-0.5 text-base font-semibold text-slate-900">
                                                {new Date(p.approvedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </section>
                        </div>
                    )}

                    {activeTab === 'reviewer' && (
                        <div className="py-6">
                            {subLoading ? (
                                <p className="py-10 text-center text-base text-slate-500">Memuat hasil review...</p>
                            ) : reviews.length === 0 ? (
                                <div className="px-6 py-10 text-center">
                                    <p className="text-base font-semibold text-slate-700">Belum ada review</p>
                                    <p className="mt-1 text-sm text-slate-500">Tugaskan reviewer terlebih dahulu.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-200">
                                    {reviews.map((rv) => (
                                        <article key={rv.id} className="space-y-4 py-6 first:pt-0 last:pb-0">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <p className="text-base font-semibold text-slate-900">
                                                        {rv.reviewer?.fullName || rv.reviewer?.name || '—'}
                                                    </p>
                                                    <p className="mt-0.5 text-sm text-slate-500">Hasil penilaian reviewer</p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {rv.isDone ? (
                                                        <Badge label="Selesai" className="badge-success" />
                                                    ) : (
                                                        <Badge label="Draft" className="badge-neutral" />
                                                    )}
                                                    {rv.rekomendasi && (
                                                        <Badge
                                                            label={STATUS_LABEL[rv.rekomendasi] || rv.rekomendasi}
                                                            className={STATUS_COLOR[rv.rekomendasi] || 'badge-neutral'}
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {(rv.nilaiRelevansi != null || rv.nilaiMetodologi != null || rv.nilaiAnggaran != null || rv.nilaiLuaran != null) && (
                                                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 xl:grid-cols-4">
                                                    {[
                                                        ['Relevansi', rv.nilaiRelevansi],
                                                        ['Metodologi', rv.nilaiMetodologi],
                                                        ['Anggaran', rv.nilaiAnggaran],
                                                        ['Luaran', rv.nilaiLuaran],
                                                    ].map(([label, val]) => val != null && (
                                                        <div key={label} className="bg-white px-4 py-3">
                                                            <p className="text-sm text-slate-500">{label}</p>
                                                            <p className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{val}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {rv.catatan && (
                                                <section>
                                                    <p className="text-sm text-slate-500">Catatan Reviewer</p>
                                                    <p className="mt-1 text-base leading-relaxed text-slate-700">{rv.catatan}</p>
                                                </section>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'laporan' && (
                        <div className="py-6">
                            {subLoading ? (
                                <p className="py-10 text-center text-base text-slate-500">Memuat laporan...</p>
                            ) : laporan.length === 0 ? (
                                <div className="px-6 py-10 text-center">
                                    <p className="text-base font-semibold text-slate-700">Belum ada laporan</p>
                                    <p className="mt-1 text-sm text-slate-500">Laporan tersedia setelah proposal disetujui.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-200">
                                    {laporan.map((l) => (
                                        <article key={l.id} className="py-5 first:pt-0 last:pb-0">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <Badge label={l.jenis} className="badge-neutral" />
                                                    <p className="mt-2.5 text-base font-semibold text-slate-900">{l.judul}</p>
                                                    {l.keterangan && (
                                                        <p className="mt-1 text-sm leading-relaxed text-slate-500">{l.keterangan}</p>
                                                    )}
                                                    <p className="mt-2 text-sm text-slate-400">
                                                        Tanggal unggah: {new Date(l.createdAt).toLocaleDateString('id-ID')}
                                                    </p>
                                                </div>

                                                <a
                                                    href={l.dokumenUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-secondary btn-sm shrink-0 self-start"
                                                >
                                                    Lihat Dokumen
                                                </a>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'dokumen' && (
                        <div className="py-6">
                            {subLoading ? (
                                <p className="py-10 text-center text-base text-slate-500">Memuat dokumen...</p>
                            ) : dokumen.length === 0 ? (
                                <div className="px-6 py-10 text-center">
                                    <p className="text-base font-semibold text-slate-700">Belum ada dokumen lampiran</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-200">
                                    {dokumen.map((d) => (
                                        <article key={d.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <p className="break-words text-base font-medium text-slate-900">{d.namaFile}</p>
                                                {d.ukuran && (
                                                    <p className="mt-0.5 text-sm text-slate-500">
                                                        Ukuran file:{' '}
                                                        {d.ukuran > 1024 * 1024
                                                            ? `${(d.ukuran / 1024 / 1024).toFixed(1)} MB`
                                                            : `${Math.round(d.ukuran / 1024)} KB`}
                                                    </p>
                                                )}
                                            </div>

                                            <a
                                                href={d.fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-secondary btn-sm shrink-0 self-start md:self-auto"
                                            >
                                                Unduh Dokumen
                                            </a>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </OverlayPanel>

            {statusModal && (
                <Modal title="Ubah Status Proposal" onClose={() => setStatusModal(false)}>
                    <div className="space-y-5">
                        {statusError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                                {statusError}
                            </div>
                        )}

                        <section>
                            <label htmlFor="status-baru" className="label">Status Baru</label>
                            <select
                                id="status-baru"
                                value={statusForm.status}
                                onChange={(e) => setStatusForm(f => ({ ...f, status: e.target.value }))}
                                className="input"
                            >
                                <option value="">Pilih status...</option>
                                <option value="review">Review</option>
                                <option value="revisi">Revisi</option>
                                <option value="disetujui">Disetujui</option>
                                <option value="ditolak">Ditolak</option>
                            </select>
                        </section>

                        {statusForm.status === 'revisi' && (
                            <section>
                                <label htmlFor="catatan-revisi" className="label">Catatan Revisi</label>
                                <textarea
                                    id="catatan-revisi"
                                    value={statusForm.catatanRevisi}
                                    onChange={(e) => setStatusForm(f => ({ ...f, catatanRevisi: e.target.value }))}
                                    rows={4}
                                    placeholder="Tulis catatan revisi untuk pengusul..."
                                    className="input resize-none"
                                />
                            </section>
                        )}

                        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
                            <button
                                onClick={() => setStatusModal(false)}
                                className="btn btn-secondary"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleUpdateStatus}
                                disabled={statusSubmitting || !statusForm.status}
                                className="btn btn-primary"
                            >
                                {statusSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {reviewerModal && (
                <Modal title="Tugaskan Reviewer" onClose={() => setReviewerModal(false)} wide>
                    <div className="space-y-5">
                        {reviewerError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                                {reviewerError}
                            </div>
                        )}

                        {availableReviewers.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
                                <p className="text-base font-semibold text-slate-700">Tidak ada reviewer yang tersedia</p>
                                <p className="mt-1 text-sm text-slate-500">
                                    Semua reviewer terdaftar sebagai anggota tim proposal ini.
                                </p>
                            </div>
                        ) : (
                            <section className="space-y-4">
                                <p className="text-sm leading-relaxed text-slate-500">
                                    Pilih reviewer yang akan ditugaskan. Anggota tim proposal tidak ditampilkan dalam daftar ini.
                                </p>

                                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                                    {availableReviewers.map((r) => {
                                        const checked = reviewerIds.includes(r.id)
                                        return (
                                            <label
                                                key={r.id}
                                                className={`flex cursor-pointer items-start gap-3.5 rounded-lg border px-4 py-3 transition-colors duration-150 ${checked ? 'border-navy-600 bg-navy-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setReviewerIds(prev =>
                                                            prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                                                        )
                                                    }}
                                                    className="mt-0.5 size-4 accent-navy-800"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-base font-medium text-slate-900">{r.fullName || r.name}</p>
                                                    <p className="break-all text-sm text-slate-500">{r.email}</p>
                                                </div>
                                            </label>
                                        )
                                    })}
                                </div>
                            </section>
                        )}

                        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
                            <button
                                onClick={() => setReviewerModal(false)}
                                className="btn btn-secondary"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleTugaskanReviewer}
                                disabled={reviewerSubmitting}
                                className="btn btn-primary"
                            >
                                {reviewerSubmitting ? 'Menugaskan...' : `Tugaskan Reviewer (${reviewerIds.length})`}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    )
}
