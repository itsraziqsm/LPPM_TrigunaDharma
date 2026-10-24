import { JENIS_LABEL, STATUS_LABEL, STATUS_COLOR } from './periodeConstants'
import { Badge, CloseButton, OverlayPanel, SectionLabel } from './periodeComponents'

// ─── Admin Proposal Detail ────────────────────────────────────────────────────

export default function AdminProposalDetail({ proposal, onClose, onBack }) {
    const ketua = proposal.pengusul
    const anggota = proposal.anggota || []

    return (
        <OverlayPanel onClose={onClose} size="md">
            {/* Header detail */}
            <header className="border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={onBack}
                                className="btn btn-ghost btn-sm -ml-2.5"
                                title="Kembali"
                            >
                                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                                Kembali ke daftar
                            </button>
                            <span className="text-sm text-slate-500">Detail Proposal</span>
                        </div>

                        <h1 className="mt-3 text-2xl leading-snug text-navy-950">
                            {proposal.judul}
                        </h1>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge
                                label={STATUS_LABEL[proposal.status] || proposal.status}
                                className={STATUS_COLOR[proposal.status] || 'badge-neutral'}
                            />
                            <Badge
                                label={JENIS_LABEL[proposal.jenis] || proposal.jenis}
                                className="badge-plain"
                            />
                        </div>
                    </div>

                    <CloseButton onClick={onClose} label="Tutup Panel" />
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6">
                <div className="divide-y divide-slate-200">
                    <section className="py-6">
                        <SectionLabel>Ketua Pengusul</SectionLabel>
                        <div className="flex items-center gap-4">
                            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-navy-800">
                                <span className="text-base font-semibold text-white">
                                    {(ketua?.name || '?').charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-base font-semibold text-slate-900">
                                    {ketua?.fullName || ketua?.name || '—'}
                                </p>
                                <p className="mt-0.5 text-sm text-slate-500">{ketua?.email || '—'}</p>
                            </div>
                        </div>
                    </section>

                    {anggota.length > 0 && (
                        <section className="py-6">
                            <SectionLabel>Anggota Tim</SectionLabel>
                            <div className="mb-3 text-sm text-slate-500">Jumlah anggota: {anggota.length}</div>
                            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                                {anggota.map((a) => (
                                    <article key={a.id} className="flex items-center gap-4 px-4 py-3">
                                        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-50">
                                            <span className="text-sm font-semibold text-navy-700">
                                                {(a.user?.name || '?').charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-base font-medium text-slate-900">
                                                {a.user?.fullName || a.user?.name || '—'}
                                            </p>
                                            <p className="text-sm capitalize text-slate-500">{a.peran || '—'}</p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="py-6">
                        <SectionLabel>Ringkasan Pengajuan</SectionLabel>
                        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                            <div>
                                <dt className="text-sm text-slate-500">Jenis Proposal</dt>
                                <dd className="mt-0.5 text-base font-semibold text-slate-900">
                                    {JENIS_LABEL[proposal.jenis] || proposal.jenis}
                                </dd>
                            </div>

                            <div>
                                <dt className="text-sm text-slate-500">Anggaran</dt>
                                <dd className="mt-0.5 text-base font-semibold text-slate-900 tabular-nums">
                                    {proposal.anggaran != null ? `Rp ${Number(proposal.anggaran).toLocaleString('id-ID')}` : '—'}
                                </dd>
                            </div>
                        </dl>
                    </section>
                </div>
            </div>
        </OverlayPanel>
    )
}
