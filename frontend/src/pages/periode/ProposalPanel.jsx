import { useEffect, useState, useRef } from 'react'
import api from '../../api/axios'
import { STATUS_LABEL, STATUS_COLOR, JENIS_LABEL } from './periodeConstants'
import { Badge, CloseButton, OverlayPanel } from './periodeComponents'
import KetuaProposalDetail from './KetuaProposalDetail'
import AdminProposalDetail from './AdminProposalDetail'
import { ChevronRight } from 'lucide-react'

// ─── Proposal Panel (list) — centered overlay ─────────────────────────────────

export default function ProposalPanel({ periode, isKetua, onClose }) {
    const [proposals, setProposals] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [page, setPage] = useState(1)
    const [meta, setMeta] = useState({ total: 0, limit: 10 })
    const [search, setSearch] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedProposal, setSelectedProposal] = useState(null)
    const debounceRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        const fetch = async () => {
            setLoading(true); setError(null)
            try {
                const params = { periodeId: periode.id, page, limit: 10 }
                if (search) params.search = search
                if (statusFilter) params.status = statusFilter
                const res = await api.get('/proposals', { params })
                if (!cancelled) {
                    setProposals((res.data.data || []).filter(p => p.jenis === periode.jenis))
                    setMeta(res.data.meta || { total: 0, limit: 10 })
                }
            } catch {
                if (!cancelled) setError('Gagal memuat proposal')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        fetch()
        return () => { cancelled = true }
    }, [periode.id, page, search, statusFilter])

    const handleSearchInput = (val) => {
        setSearchInput(val)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => { setSearch(val); setPage(1) }, 400)
    }

    const totalPages = Math.ceil((meta.total || 0) / (meta.limit || 10))

    if (selectedProposal !== null) {
        if (isKetua) {
            return (
                <KetuaProposalDetail
                    key={selectedProposal}
                    proposalId={selectedProposal}
                    onClose={onClose}
                    onBack={() => setSelectedProposal(null)}
                />
            )
        } else {
            const found = proposals.find(p => p.id === selectedProposal)
            if (found) {
                return (
                    <AdminProposalDetail
                        proposal={found}
                        onClose={onClose}
                        onBack={() => setSelectedProposal(null)}
                    />
                )
            }
        }
    }

    return (
        <OverlayPanel onClose={onClose} size="xl">
            {/* Header daftar proposal */}
            <header className="border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-sm text-slate-500">Daftar Proposal</p>
                        <h1 className="mt-1 text-2xl text-navy-950">{periode.nama}</h1>
                        <p className="mt-1.5 text-base text-slate-500">
                            Total proposal pada periode ini: <span className="font-semibold text-slate-700">{meta.total}</span>
                        </p>
                    </div>

                    <CloseButton onClick={onClose} label="Tutup Panel" />
                </div>
            </header>

            {/* Filter dan pencarian */}
            <section className="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div>
                        <label htmlFor="panel-cari" className="label">Cari Judul Proposal</label>
                        <input
                            id="panel-cari"
                            type="text"
                            placeholder="Masukkan judul proposal..."
                            value={searchInput}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            className="input"
                        />
                    </div>

                    <div>
                        <label htmlFor="panel-status" className="label">Filter Status</label>
                        <select
                            id="panel-status"
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                            className="input"
                        >
                            <option value="">Semua</option>
                            {Object.entries(STATUS_LABEL).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="px-6 py-14 text-center">
                        <p className="flex items-center justify-center gap-3 text-base text-slate-500">
                            <span className="spinner text-navy-600" aria-hidden="true" />
                            Memuat daftar proposal...
                        </p>
                    </div>
                ) : error ? (
                    <div className="px-6 py-14 text-center">
                        <p className="text-base font-medium text-red-600">{error}</p>
                    </div>
                ) : proposals.length === 0 ? (
                    <div className="px-6 py-14 text-center">
                        <p className="text-base font-semibold text-slate-700">Tidak ada proposal</p>
                        <p className="mt-1 text-sm text-slate-500">Belum ada data proposal untuk periode ini.</p>
                    </div>
                ) : (
                    <section className="divide-y divide-slate-100">
                        {proposals.map((p) => (
                            <article
                                key={p.id}
                                onClick={() => setSelectedProposal(p.id)}
                                className="group cursor-pointer px-6 py-4 transition-colors duration-150 hover:bg-slate-50"
                            >
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between xl:gap-6">
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-base font-semibold leading-snug text-slate-900 group-hover:text-navy-800">
                                            {p.judul}
                                        </h2>

                                        <div className="mt-1.5 space-y-0.5 text-sm text-slate-500">
                                            <p>
                                                Pengusul: {p.pengusul?.name || p.pengusul?.fullName || '—'}
                                                {p.pengusul?.programStudi ? ` · ${p.pengusul.programStudi}` : ''}
                                            </p>
                                            {p.anggaran != null && (
                                                <p>Anggaran: Rp {Number(p.anggaran).toLocaleString('id-ID')}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-row items-center gap-3 xl:flex-col xl:items-end xl:gap-2">
                                        <div className="flex flex-wrap gap-2">
                                            <Badge
                                                label={STATUS_LABEL[p.status] || p.status}
                                                className={STATUS_COLOR[p.status] || 'badge-neutral'}
                                            />
                                            <Badge
                                                label={JENIS_LABEL[p.jenis] || p.jenis}
                                                className="badge-plain"
                                            />
                                        </div>

                                        <span className="inline-flex items-center gap-1 text-sm font-medium text-navy-700">
                                            Lihat detail proposal
                                            <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                                        </span>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </section>
                )}
            </div>

            {totalPages > 1 && (
                <footer className="border-t border-slate-200 px-6 py-3.5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-slate-500">
                            Halaman {page} dari {totalPages}
                        </span>
                        <div className="grid grid-cols-2 gap-2.5 sm:flex">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="btn btn-secondary btn-sm"
                            >
                                Halaman Sebelumnya
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="btn btn-secondary btn-sm"
                            >
                                Halaman Berikutnya
                            </button>
                        </div>
                    </div>
                </footer>
            )}
        </OverlayPanel>
    )
}
