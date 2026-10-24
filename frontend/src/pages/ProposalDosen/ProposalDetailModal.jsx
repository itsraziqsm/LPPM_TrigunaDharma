import { useEffect, useState } from 'react'
import { proposalDosenApi } from '../../api/Proposaldosen'
import { proposalApi } from '../../api/proposal'
import { Modal, Badge, InfoRow, SectionBox } from './components'
import { JENIS_LABEL, STATUS_LABEL, STATUS_COLOR, UNDANGAN_COLOR } from './constants'
import { LaporanTab } from './LaporanTab'
import { DokumenTab } from './DokumenTab'
import { FileText } from 'lucide-react'

// ── Modal Detail Proposal ─────────────────────────────────────────────────────
// readOnly: dibuka oleh anggota tim (bukan pengusul) → data dari GET /proposals/:id,
// tanpa aksi ajukan dan tanpa tab yang hanya untuk pengusul.
export function ProposalDetailModal({ proposalId, onClose, onRefresh, readOnly = false }) {
    const [detail, setDetail] = useState(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('info')
    const [submitting, setSubmitting] = useState(false)
    const [msg, setMsg] = useState('')

    useEffect(() => {
        const request = readOnly ? proposalApi.getById(proposalId) : proposalDosenApi.getById(proposalId)
        request
            .then(res => setDetail(res.data.data))
            .catch(() => setDetail(null))
            .finally(() => setLoading(false))
    }, [proposalId, readOnly])

    const anggotaPending = (detail?.anggota || []).filter(a => a.statusUndangan === 'pending')
    const anggotaDitolak = (detail?.anggota || []).filter(a => a.statusUndangan === 'ditolak')
    const semuaAnggotaSetuju = anggotaPending.length === 0 && anggotaDitolak.length === 0
    const adaAnggota = (detail?.anggota || []).length > 0
    const bisaDiajukan = !adaAnggota || semuaAnggotaSetuju

    const handleSubmit = async () => {
        if (!bisaDiajukan) return
        if (!confirm('Ajukan proposal ini ke PRPM?')) return
        setSubmitting(true); setMsg('')
        try {
            await proposalDosenApi.submit(proposalId)
            setMsg('Proposal berhasil diajukan!')
            onRefresh?.()
            const res = await proposalDosenApi.getById(proposalId)
            setDetail(res.data.data)
        } catch (e) {
            setMsg(e.response?.data?.message || 'Gagal mengajukan proposal.')
        } finally {
            setSubmitting(false)
        }
    }

    const TABS = [
        { key: 'info', label: 'Informasi Proposal' },
        { key: 'anggota', label: 'Anggota Tim' },
        { key: 'review', label: 'Hasil Review' },
        { key: 'laporan', label: 'Laporan' },
        { key: 'dokumen', label: 'Dokumen' },
    ].filter(t => !readOnly || t.key === 'info' || t.key === 'anggota')

    return (
        <Modal title="Detail Proposal" onClose={onClose} wide>
            {loading ? (
                <p className="flex items-center justify-center gap-3 py-14 text-base text-slate-500">
                    <span className="spinner text-navy-600" aria-hidden="true" />
                    Memuat detail proposal...
                </p>
            ) : !detail ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-10 text-center" role="alert">
                    <p className="text-base font-medium text-red-700">Gagal memuat data proposal.</p>
                </div>
            ) : (
                <div className="space-y-7">
                    {/* Ringkasan proposal */}
                    <section>
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-slate-500">Ringkasan proposal</p>
                                <h2 className="mt-1.5 font-serif text-2xl font-medium leading-snug text-navy-950">{detail.judul}</h2>

                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <Badge label={JENIS_LABEL[detail.jenis] || detail.jenis} className="badge-tag" />
                                    <Badge label={STATUS_LABEL[detail.status] || detail.status} className={STATUS_COLOR[detail.status] || 'badge-neutral'} />
                                    {detail.periode && (
                                        <Badge label={`${detail.periode.nama} ${detail.periode.tahun}`} className="badge-tag" />
                                    )}
                                </div>
                            </div>

                            {!readOnly && (detail.status === 'draft' || detail.status === 'revisi') && (
                                <aside className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 lg:max-w-sm">
                                    <p className="text-base font-semibold text-navy-950">Aksi proposal</p>
                                    <p className="mt-1 text-sm leading-relaxed text-slate-500">
                                        Proposal dapat diajukan ke PRPM setelah seluruh anggota menyetujui undangan.
                                    </p>

                                    <div className="mt-4 flex flex-col gap-3">
                                        <button
                                            onClick={handleSubmit}
                                            disabled={submitting || !bisaDiajukan}
                                            title={!bisaDiajukan ? 'Semua anggota harus menyetujui undangan sebelum proposal bisa diajukan' : ''}
                                            className="btn btn-primary w-full"
                                        >
                                            {submitting ? 'Mengajukan proposal...' : 'Ajukan ke PRPM'}
                                        </button>

                                        {msg && (
                                            <p className={`text-sm ${msg.includes('berhasil') ? 'text-green-700' : 'text-red-700'}`}>
                                                {msg}
                                            </p>
                                        )}
                                    </div>
                                </aside>
                            )}
                        </div>

                        {!bisaDiajukan && (detail.status === 'draft' || detail.status === 'revisi') && (
                            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
                                <p className="text-base font-semibold text-amber-900">Proposal belum dapat diajukan</p>
                                <p className="mt-1 text-sm leading-relaxed text-amber-800">
                                    {anggotaPending.length > 0 && (
                                        <span><strong>{anggotaPending.length} anggota</strong> belum merespons undangan.</span>
                                    )}
                                    {anggotaDitolak.length > 0 && (
                                        <span> <strong>{anggotaDitolak.length} anggota</strong> menolak undangan — hapus atau ganti anggota tersebut.</span>
                                    )}
                                </p>
                            </div>
                        )}

                        {detail.catatanRevisi && (
                            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
                                <p className="text-base font-semibold text-amber-900">Catatan revisi</p>
                                <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-amber-900">{detail.catatanRevisi}</p>
                            </div>
                        )}
                    </section>

                    {/* Tab navigasi */}
                    <section>
                        <div
                            role="tablist"
                            aria-label="Navigasi detail proposal"
                            className="flex gap-6 overflow-x-auto border-b border-slate-200"
                        >
                            {TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    role="tab"
                                    aria-selected={activeTab === tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`-mb-px whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${activeTab === tab.key
                                        ? 'border-navy-800 text-navy-950'
                                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-navy-900'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="pt-6">
                            {activeTab === 'info' && (
                                <div className="space-y-5">
                                    <SectionBox title="Data Umum Proposal">
                                        <InfoRow label="ID Proposal" value={`#${detail.id}`} />
                                        <InfoRow label="Judul Proposal" value={detail.judul} />
                                        <InfoRow label="Jenis Kegiatan" value={JENIS_LABEL[detail.jenis] || detail.jenis} />
                                        <InfoRow label="Status Proposal" value={STATUS_LABEL[detail.status] || detail.status} />
                                        <InfoRow label="Anggaran" value={detail.anggaran ? `Rp ${Number(detail.anggaran).toLocaleString('id-ID')}` : '—'} />
                                        <InfoRow label="Periode" value={detail.periode ? `${detail.periode.nama} (${detail.periode.tahun})` : '—'} />
                                        {detail.skema ? <InfoRow label="Skema" value={detail.skema} /> : null}
                                        {detail.mitra ? <InfoRow label="Mitra" value={detail.mitra} /> : null}
                                        {detail.jenis === 'pengabdian' ? (
                                            <>
                                                <InfoRow label="Jenis Mitra" value={detail.mitraJenis || '—'} />
                                                <InfoRow label="Alamat Mitra" value={detail.mitraAlamat || '—'} />
                                                <InfoRow label="Kontak Mitra" value={detail.mitraKontak || '—'} />
                                                <InfoRow label="Kebutuhan Mitra" value={detail.mitraKebutuhan || '—'} />
                                            </>
                                        ) : null}
                                        <InfoRow label="Rumpun Ilmu" value={detail.rumpunIlmu || '—'} />
                                        <InfoRow label="Bidang" value={detail.bidang || '—'} />
                                        <InfoRow label="Kata Kunci" value={(detail.kataKunci || []).join(', ') || '—'} />
                                        <InfoRow label="Tanggal Diajukan" value={detail.submittedAt ? new Date(detail.submittedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'} />
                                        <InfoRow label="Tanggal Dibuat" value={new Date(detail.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} />
                                    </SectionBox>

                                    <SectionBox title="Abstrak Proposal">
                                        <p className="whitespace-pre-line text-base leading-relaxed text-slate-700">{detail.abstrak || '—'}</p>
                                    </SectionBox>

                                    {(detail.dokumenUrl || detail.dokumenNama) && (
                                        <SectionBox title="Dokumen Utama Proposal">
                                            {detail.dokumenNama ? (
                                                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                                    <div className="flex min-w-0 flex-1 items-start gap-4">
                                                        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                                                            <FileText className="size-5" strokeWidth={1.5} aria-hidden="true" />
                                                        </div>

                                                        <div className="min-w-0 flex-1">
                                                            <p className="break-words text-base font-semibold text-slate-900">{detail.dokumenNama}</p>
                                                            {detail.dokumenUkuran && (
                                                                <p className="mt-0.5 text-sm text-slate-500">
                                                                    {(detail.dokumenUkuran / 1024).toFixed(1)} KB · {detail.dokumenMime?.includes('pdf') ? 'PDF' : 'DOCX'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <a
                                                        href={proposalDosenApi.getDokumenUrl(detail.id)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-secondary shrink-0"
                                                    >
                                                        Lihat dokumen
                                                    </a>
                                                </div>
                                            ) : (
                                                <a
                                                    href={detail.dokumenUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="break-all text-base text-navy-700 underline-offset-2 hover:underline"
                                                >
                                                    {detail.dokumenUrl}
                                                </a>
                                            )}
                                        </SectionBox>
                                    )}
                                </div>
                            )}

                            {activeTab === 'anggota' && (
                                <div className="space-y-4">
                                    {!detail.anggota || detail.anggota.length === 0 ? (
                                        <div className="rounded-xl border border-slate-200 px-5 py-10 text-center">
                                            <p className="text-base font-medium text-slate-700">Tidak ada anggota tim</p>
                                            <p className="mt-1 text-sm text-slate-500">Proposal ini belum memiliki anggota tambahan.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {(detail.status === 'draft' || detail.status === 'revisi') && (
                                                <div className={`rounded-lg border px-4 py-3.5 text-sm leading-relaxed ${bisaDiajukan ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                                    {bisaDiajukan
                                                        ? 'Semua anggota telah menyetujui undangan. Proposal siap diajukan ke PRPM.'
                                                        : 'Masih ada anggota yang belum menyetujui undangan. Proposal belum dapat diajukan.'}
                                                </div>
                                            )}

                                            <div className="card divide-y divide-slate-100 overflow-hidden">
                                                {detail.anggota.map((a) => (
                                                    <article key={a.id} className="px-5 py-4">
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                            <div className="flex items-center gap-4">
                                                                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-navy-100 text-base font-semibold text-navy-800">
                                                                    {(a.user?.name || '?').charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-base font-semibold text-slate-900">{a.user?.fullName || a.user?.name}</p>
                                                                    <p className="mt-0.5 break-all text-sm text-slate-500">{a.user?.email}</p>
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Badge label={a.peran} className="badge-tag" />
                                                                <Badge
                                                                    label={a.statusUndangan === 'diterima' ? 'Diterima' : a.statusUndangan === 'ditolak' ? 'Ditolak' : 'Menunggu respons'}
                                                                    className={UNDANGAN_COLOR[a.statusUndangan] || 'badge-neutral'}
                                                                />
                                                            </div>
                                                        </div>
                                                    </article>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === 'review' && (
                                <div>
                                    {!detail.reviews || detail.reviews.length === 0 ? (
                                        <div className="rounded-xl border border-slate-200 px-5 py-10 text-center">
                                            <p className="text-base font-medium text-slate-700">Belum ada hasil review</p>
                                            <p className="mt-1 text-sm text-slate-500">Penilaian reviewer akan tampil pada bagian ini setelah tersedia.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {detail.reviews.map((rv) => (
                                                <article key={rv.id} className="card overflow-hidden [&:has(>div:empty)>header]:border-b-0">
                                                    <header className="flex flex-col gap-2 border-b border-slate-200 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
                                                        <div className="flex flex-wrap items-center gap-2.5">
                                                            <span className="text-base font-semibold text-slate-900">{rv.reviewer?.fullName || rv.reviewer?.name}</span>
                                                            {rv.isDone && <Badge label="Final" className="badge-success" />}
                                                        </div>
                                                        {rv.rekomendasi && (
                                                            <span className="text-sm font-medium text-slate-600">
                                                                Rekomendasi: {STATUS_LABEL[rv.rekomendasi] || rv.rekomendasi}
                                                            </span>
                                                        )}
                                                    </header>

                                                    <div className="space-y-4 px-5 py-5 empty:hidden">
                                                        {[{ label: 'Relevansi', val: rv.nilaiRelevansi }, { label: 'Metodologi', val: rv.nilaiMetodologi }, { label: 'Anggaran', val: rv.nilaiAnggaran }, { label: 'Luaran', val: rv.nilaiLuaran }]
                                                            .filter(n => n.val !== null && n.val !== undefined).map(n => (
                                                                <div key={n.label} className="grid grid-cols-1 gap-1.5 md:grid-cols-[140px_minmax(0,1fr)_40px] md:items-center md:gap-4">
                                                                    <span className="text-sm text-slate-600">{n.label}</span>
                                                                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                                                        <div className="h-full rounded-full bg-navy-700" style={{ width: `${(n.val / 5) * 100}%` }} />
                                                                    </div>
                                                                    <span className="text-sm font-semibold tabular-nums text-slate-900 md:text-right">{n.val}</span>
                                                                </div>
                                                            ))}

                                                        {rv.catatan && (
                                                            <div className="border-t border-slate-100 pt-4">
                                                                <p className="text-sm font-semibold text-navy-950">Catatan reviewer</p>
                                                                <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-slate-700">{rv.catatan}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'laporan' && (
                                <LaporanTab
                                    proposalId={detail.id}
                                    laporan={detail.laporan || []}
                                    status={detail.status}
                                    onRefresh={async () => {
                                        const res = await proposalDosenApi.getById(proposalId)
                                        setDetail(res.data.data)
                                        onRefresh?.()
                                    }}
                                />
                            )}

                            {activeTab === 'dokumen' && (
                                <DokumenTab
                                    proposalId={detail.id}
                                    dokumenLampiran={detail.dokumenLampiran || []}
                                    status={detail.status}
                                    onRefresh={async () => {
                                        const res = await proposalDosenApi.getById(proposalId)
                                        setDetail(res.data.data)
                                        onRefresh?.()
                                    }}
                                />
                            )}
                        </div>
                    </section>
                </div>
            )}
        </Modal>
    )
}
