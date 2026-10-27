import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { STATUS_LABEL, STATUS_COLOR, JENIS_LABEL } from './periodeConstants'
import { Badge, CloseButton, OverlayPanel } from './periodeComponents'
import { ChevronRight } from 'lucide-react'

function InlineWadah({ children }) {
    return <section className="card flex flex-col overflow-hidden">{children}</section>
}

// ─── Proposal Panel (list) — centered overlay ─────────────────────────────────
// Tab Proposal (GET /proposals?periodeId=) dan Laporan (GET /laporan?periodeId=,
// bawaan status Disetujui): tempat melihat kegiatan periode lama yang sudah
// diterima — Laporan Masuk hanya memuat periode aktif. Klik membuka halaman detail
// /proposals/detail/:id atau /laporan-masuk/detail/:id (bukan modal).

export default function ProposalPanel({ periode, onClose, inline = false }) {
    const [proposals, setProposals] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [page, setPage] = useState(1)
    const [meta, setMeta] = useState({ total: 0, limit: 10 })
    const [search, setSearch] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [tipe, setTipe] = useState('proposal')
    const navigate = useNavigate()
    const isLaporan = tipe === 'laporan'
    const noun = isLaporan ? 'laporan' : 'proposal'
    const debounceRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        const fetch = async () => {
            setLoading(true); setError(null)
            try {
                const params = { periodeId: periode.id, page, limit: 10 }
                if (search) params.search = search
                if (statusFilter) params.status = statusFilter
                const res = await api.get(tipe === 'laporan' ? '/laporan' : '/proposals', { params })
                if (!cancelled) {
                    setProposals((res.data.data || []).filter(p => p.jenis === periode.jenis))
                    setMeta(res.data.meta || { total: 0, limit: 10 })
                }
            } catch {
                if (!cancelled) setError(`Gagal memuat ${tipe === 'laporan' ? 'laporan' : 'proposal'}`)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        fetch()
        return () => { cancelled = true }
    }, [periode.id, page, search, statusFilter, tipe])

    const switchTipe = (next) => {
        if (next === tipe) return
        setTipe(next)
        setStatusFilter(next === 'laporan' ? 'disetujui' : '')
        setPage(1)
    }

    const handleSearchInput = (val) => {
        setSearchInput(val)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => { setSearch(val); setPage(1) }, 400)
    }

    const totalPages = Math.ceil((meta.total || 0) / (meta.limit || 10))

    // inline = bagian halaman Detail Periode (/periode/detail/:id), selain itu overlay.
    const Wadah = inline ? InlineWadah : OverlayPanel

    return (
        <Wadah onClose={onClose} size="xl">
            {/* Header daftar proposal */}
            <header className="border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        {inline ? (
                            <h2 className="text-lg font-semibold text-navy-950">Kegiatan Periode</h2>
                        ) : (
                            <>
                                <p className="text-sm text-slate-500">Kegiatan Periode</p>
                                <h1 className="mt-1 text-2xl text-navy-950">{periode.nama}</h1>
                            </>
                        )}
                        <p className="mt-1.5 text-base text-slate-500">
                            Total {noun}{statusFilter ? ` (${(STATUS_LABEL[statusFilter] || statusFilter).toLowerCase()})` : ''} pada periode ini: <span className="font-semibold text-slate-700">{meta.total}</span>
                        </p>
                    </div>

                    {inline ? null : <CloseButton onClick={onClose} label="Tutup Panel" />}
                </div>
                <div role="tablist" aria-label="Jenis dokumen" className="mt-4 flex gap-6">
                    {[['proposal', 'Proposal'], ['laporan', 'Laporan']].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tipe === key}
                            onClick={() => switchTipe(key)}
                            className={`-mb-5 border-b-2 pb-3 text-sm font-semibold transition-colors ${tipe === key ? 'border-navy-800 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </header>

            {/* Filter dan pencarian */}
            <section className="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div>
                        <label htmlFor="panel-cari" className="label">Cari Judul {isLaporan ? 'Laporan' : 'Proposal'}</label>
                        <input
                            id="panel-cari"
                            type="text"
                            placeholder={`Masukkan judul ${noun}...`}
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
                            Memuat daftar {noun}...
                        </p>
                    </div>
                ) : error ? (
                    <div className="px-6 py-14 text-center">
                        <p className="text-base font-medium text-red-600">{error}</p>
                    </div>
                ) : proposals.length === 0 ? (
                    <div className="px-6 py-14 text-center">
                        <p className="text-base font-semibold text-slate-700">Tidak ada {noun}</p>
                        <p className="mt-1 text-sm text-slate-500">Belum ada data {noun}{statusFilter ? ` berstatus ${(STATUS_LABEL[statusFilter] || statusFilter).toLowerCase()}` : ''} untuk periode ini.</p>
                    </div>
                ) : (
                    <section className="divide-y divide-slate-100">
                        {proposals.map((p) => (
                            <article
                                key={p.id}
                                onClick={() => navigate(isLaporan ? `/laporan-masuk/detail/${p.id}` : `/proposals/detail/${p.id}`)}
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
                                            Lihat detail {noun}
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
        </Wadah>
    )
}
