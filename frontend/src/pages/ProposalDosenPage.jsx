import { useEffect, useState, useCallback } from 'react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { StatCard, Badge } from './ProposalDosen/components'
import { ProposalDetailModal } from './ProposalDosen/ProposalDetailModal'
import { ProposalFormModal } from './ProposalDosen/ProposalFormModal'
import { UndanganSection } from './ProposalDosen/UndanganSection'
import { JENIS_LABEL, STATUS_LABEL, STATUS_COLOR } from './ProposalDosen/constants'
import { Download, FileText, Plus, Search } from 'lucide-react'

function TabButton({ active, children, badge, onClick }) {
    return (
        <button
            onClick={onClick}
            role="tab"
            aria-selected={active}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-3 pt-2 text-base font-semibold transition-colors ${active
                ? 'border-navy-800 text-navy-950'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-navy-900'
                }`}
        >
            <span>{children}</span>
            {typeof badge === 'number' && badge > 0 && (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brass-400 px-1.5 py-0.5 text-[11px] font-bold leading-none text-navy-950">
                    {badge}
                </span>
            )}
        </button>
    )
}

function FilterChip({ active, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${active
                ? 'border-navy-800 bg-navy-800 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-navy-900'
                }`}
        >
            {children}
        </button>
    )
}

function ProposalTableSkeleton() {
    return (
        <div className="divide-y divide-slate-100" aria-hidden="true">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="grid animate-pulse grid-cols-12 gap-4 px-6 py-5">
                    <div className="col-span-7 space-y-2.5 lg:col-span-4">
                        <div className="h-4 w-4/5 rounded bg-slate-200" />
                        <div className="h-3 w-16 rounded bg-slate-100" />
                    </div>
                    <div className="col-span-5 lg:col-span-2">
                        <div className="h-6 w-24 rounded-full bg-slate-100" />
                    </div>
                    <div className="hidden lg:col-span-2 lg:block">
                        <div className="flex -space-x-2">
                            <div className="size-8 rounded-full bg-slate-200" />
                            <div className="size-8 rounded-full bg-slate-100" />
                            <div className="size-8 rounded-full bg-slate-200" />
                        </div>
                    </div>
                    <div className="hidden lg:col-span-2 lg:block">
                        <div className="h-6 w-24 rounded-full bg-slate-100" />
                    </div>
                    <div className="hidden lg:col-span-2 lg:block">
                        <div className="h-3 w-20 rounded bg-slate-100" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function EmptyProposalState({ onCreate }) {
    return (
        <div className="px-6 py-16 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-navy-50 text-navy-700">
                <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-navy-950">Belum ada proposal</h3>
            <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-slate-500">
                Mulai buat proposal penelitian atau pengabdian untuk mengelola dokumen, anggota tim, dan proses pengajuan
                dalam satu tempat.
            </p>
            <button onClick={onCreate} className="btn btn-primary mt-6">
                <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
                Buat Proposal
            </button>
        </div>
    )
}

function HeaderButton({ href, download, onClick, children, dark = false }) {
    const className = dark ? 'btn btn-primary' : 'btn btn-secondary'

    if (href) {
        return (
            <a href={href} download={download} className={className}>
                {children}
            </a>
        )
    }

    return (
        <button onClick={onClick} className={className}>
            {children}
        </button>
    )
}

// Tumpukan inisial anggota tim (maks. 3) + sisa jumlahnya
function AnggotaStack({ anggota }) {
    if (!anggota || anggota.length === 0) {
        return <span className="whitespace-nowrap text-sm text-slate-400">Belum ada anggota</span>
    }

    return (
        <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
                {anggota.slice(0, 3).map((a) => (
                    <div
                        key={a.id}
                        title={a.user?.fullName || a.user?.name}
                        className="grid size-8 place-items-center rounded-full border-2 border-white bg-navy-100 text-xs font-semibold text-navy-800"
                    >
                        {(a.user?.name || a.user?.fullName || '?').charAt(0).toUpperCase()}
                    </div>
                ))}
            </div>
            {anggota.length > 3 && (
                <span className="text-sm font-medium text-slate-500">+{anggota.length - 3}</span>
            )}
        </div>
    )
}

export default function ProposalDosenPage() {
    const [tab, setTab] = useState('proposal')
    const [proposals, setProposals] = useState([])
    const [total, setTotal] = useState(0)
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [invitationCount, setInvitationCount] = useState(0)

    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [filterJenis, setFilterJenis] = useState('')
    const [page, setPage] = useState(1)
    const limit = 10

    const [selectedId, setSelectedId] = useState(null)
    const [editData, setEditData] = useState(null)
    const [showCreate, setShowCreate] = useState(false)
    const [deleting, setDeleting] = useState(null)

    const fetchAll = useCallback(() => {
        setLoading(true)
        const params = { page, limit }
        if (search) params.search = search
        if (filterStatus) params.status = filterStatus
        if (filterJenis) params.jenis = filterJenis

        Promise.all([proposalDosenApi.getAll(params), proposalDosenApi.getStats()])
            .then(([listRes, statsRes]) => {
                setProposals(listRes.data.data || [])
                setTotal(listRes.data.meta?.total || 0)
                setStats(statsRes.data.data)
            })
            .catch((e) => console.error(e))
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search, filterStatus, filterJenis])

    useEffect(() => {
        proposalDosenApi
            .getMyInvitations()
            .then((res) => {
                const pending = (res.data.data || []).filter((i) => i.statusUndangan === 'pending').length
                setInvitationCount(pending)
            })
            .catch(() => { })
    }, [])

    useEffect(() => {
        fetchAll()
    }, [page, search, filterStatus, filterJenis]) // eslint-disable-line

    const handleDelete = async (id) => {
        if (!confirm('Hapus proposal ini?')) return
        setDeleting(id)
        try {
            await proposalDosenApi.delete(id)
            fetchAll()
        } catch (e) {
            alert(e.response?.data?.message || 'Gagal menghapus proposal.')
        } finally {
            setDeleting(null)
        }
    }

    const totalPages = Math.ceil(total / limit)

    const activeFiltersCount = [search, filterStatus, filterJenis].filter(Boolean).length

    // Tombol aksi baris (Detail / Edit / Hapus) — dipakai di tabel dan daftar ponsel
    const renderRowActions = (p) => (
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
                onClick={() => setSelectedId(p.id)}
                className="btn btn-ghost btn-sm px-2.5 text-navy-800"
            >
                Detail
            </button>

            {(p.status === 'draft' || p.status === 'revisi') && (
                <>
                    <button
                        onClick={() => setEditData(p)}
                        className="btn btn-ghost btn-sm px-2.5"
                    >
                        Edit
                    </button>
                    <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deleting === p.id}
                        className="btn btn-ghost btn-sm px-2.5 text-red-700 hover:bg-red-50 hover:text-red-800"
                    >
                        {deleting === p.id ? '...' : 'Hapus'}
                    </button>
                </>
            )}
        </div>
    )

    return (
        <>
            <div className="page space-y-6">
                {/* Judul halaman */}
                <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <h1 className="page-title">Kelola proposal penelitian dan pengabdian</h1>
                        <p className="page-desc">
                            Pantau status proposal, buka detail pengajuan, kelola draft, dan tindak lanjuti undangan tim
                            dari satu halaman kerja yang rapi.
                        </p>
                    </div>

                    {tab === 'proposal' && (
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                            <HeaderButton href="/template-proposal.docx" download="Template_Proposal.docx">
                                <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                Download Template
                            </HeaderButton>

                            <HeaderButton onClick={() => setShowCreate(true)} dark>
                                <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                Buat Proposal
                            </HeaderButton>
                        </div>
                    )}
                </header>

                {/* Tab */}
                <div role="tablist" className="flex gap-7 border-b border-slate-200">
                    <TabButton active={tab === 'proposal'} onClick={() => setTab('proposal')}>
                        Proposal Saya
                    </TabButton>
                    <TabButton active={tab === 'undangan'} badge={invitationCount} onClick={() => setTab('undangan')}>
                        Undangan Tim
                    </TabButton>
                </div>

                {tab === 'proposal' && (
                    <>
                        {/* Statistik */}
                        {stats && (
                            <section className="card overflow-hidden" aria-label="Ringkasan status proposal">
                                <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 xl:grid-cols-6">
                                    <StatCard label="Total" value={stats.total} color="bg-navy-800" />
                                    <StatCard label="Draft" value={stats.draft} color="bg-slate-400" />
                                    <StatCard label="Diajukan" value={stats.diajukan} color="bg-navy-500" />
                                    <StatCard label="Revisi" value={stats.revisi} color="bg-yellow-500" />
                                    <StatCard label="Disetujui" value={stats.disetujui} color="bg-green-600" />
                                    <StatCard label="Ditolak" value={stats.ditolak} color="bg-red-600" />
                                </div>
                            </section>
                        )}

                        {/* Daftar proposal */}
                        <section className="card overflow-hidden">
                            <div className="border-b border-slate-200 px-6 py-5">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold text-navy-950">Daftar proposal</h2>
                                        <p className="mt-0.5 text-sm text-slate-500">
                                            Cari proposal berdasarkan judul atau abstrak, lalu sempitkan hasil dengan status dan jenis.
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                                        <div className="relative lg:w-72">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} aria-hidden="true" />
                                            <input
                                                type="text"
                                                placeholder="Cari judul atau abstrak..."
                                                aria-label="Cari judul atau abstrak"
                                                value={search}
                                                onChange={(e) => {
                                                    setSearch(e.target.value)
                                                    setPage(1)
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        setPage(1)
                                                        fetchAll()
                                                    }
                                                }}
                                                className="input pl-9"
                                            />
                                        </div>

                                        <select
                                            value={filterStatus}
                                            aria-label="Filter status"
                                            onChange={(e) => {
                                                setFilterStatus(e.target.value)
                                                setPage(1)
                                            }}
                                            className="input lg:w-44"
                                        >
                                            <option value="">Semua Status</option>
                                            {Object.entries(STATUS_LABEL).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                    {v}
                                                </option>
                                            ))}
                                        </select>

                                        <select
                                            value={filterJenis}
                                            aria-label="Filter jenis"
                                            onChange={(e) => {
                                                setFilterJenis(e.target.value)
                                                setPage(1)
                                            }}
                                            className="input lg:w-40"
                                        >
                                            <option value="">Semua Jenis</option>
                                            {Object.entries(JENIS_LABEL).map(([k, v]) => (
                                                <option key={k} value={k}>
                                                    {v}
                                                </option>
                                            ))}
                                        </select>

                                        <button
                                            onClick={() => {
                                                setPage(1)
                                                fetchAll()
                                            }}
                                            className="btn btn-primary"
                                        >
                                            Cari
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
                                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <p className="text-sm text-slate-500">
                                            Total <span className="font-semibold text-slate-800">{total}</span> proposal
                                        </p>
                                        {activeFiltersCount > 0 && (
                                            <span className="rounded-full bg-navy-800 px-2.5 py-0.5 text-xs font-semibold text-white">
                                                {activeFiltersCount} filter aktif
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <FilterChip active={filterStatus === ''} onClick={() => { setFilterStatus(''); setPage(1) }}>
                                            Semua Status
                                        </FilterChip>
                                        <FilterChip active={filterStatus === 'draft'} onClick={() => { setFilterStatus('draft'); setPage(1) }}>
                                            Draft
                                        </FilterChip>
                                        <FilterChip active={filterStatus === 'diajukan'} onClick={() => { setFilterStatus('diajukan'); setPage(1) }}>
                                            Diajukan
                                        </FilterChip>
                                        <FilterChip active={filterStatus === 'revisi'} onClick={() => { setFilterStatus('revisi'); setPage(1) }}>
                                            Revisi
                                        </FilterChip>

                                        {(search || filterStatus || filterJenis) && (
                                            <button
                                                onClick={() => {
                                                    setSearch('')
                                                    setFilterStatus('')
                                                    setFilterJenis('')
                                                    setPage(1)
                                                }}
                                                className="btn btn-ghost btn-sm"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Tabel / daftar */}
                            <div className="min-h-[360px]">
                                {loading ? (
                                    <ProposalTableSkeleton />
                                ) : proposals.length === 0 ? (
                                    <EmptyProposalState onCreate={() => setShowCreate(true)} />
                                ) : (
                                    <>
                                        {/* Layar lebar: tabel */}
                                        <div className="hidden overflow-x-auto lg:block">
                                            <table className="table">
                                                <thead>
                                                    <tr>
                                                        <th className="pl-6">Proposal</th>
                                                        <th>Jenis</th>
                                                        <th>Anggota</th>
                                                        <th>Status</th>
                                                        <th>Dibuat</th>
                                                        <th className="pr-6">Aksi</th>
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {proposals.map((p) => (
                                                        <tr
                                                            key={p.id}
                                                            onClick={() => setSelectedId(p.id)}
                                                            className="cursor-pointer"
                                                        >
                                                            <td className="min-w-[18rem] max-w-md pl-6">
                                                                <p className="line-clamp-2 font-medium leading-snug text-slate-900">{p.judul}</p>
                                                                <p className="mt-0.5 text-sm text-slate-500">#{p.id}</p>
                                                            </td>

                                                            <td>
                                                                <Badge
                                                                    label={JENIS_LABEL[p.jenis] || p.jenis}
                                                                    className="badge-tag"
                                                                />
                                                            </td>

                                                            <td>
                                                                <AnggotaStack anggota={p.anggota} />
                                                            </td>

                                                            <td>
                                                                <Badge
                                                                    label={STATUS_LABEL[p.status] || p.status}
                                                                    className={STATUS_COLOR[p.status] || 'badge-neutral'}
                                                                />
                                                            </td>

                                                            <td className="whitespace-nowrap text-sm text-slate-600">
                                                                {new Date(p.createdAt).toLocaleDateString('id-ID', {
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    year: 'numeric',
                                                                })}
                                                            </td>

                                                            <td className="pr-6">
                                                                <div className="-ml-2.5">
                                                                    {renderRowActions(p)}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Layar sempit: daftar bertumpuk */}
                                        <div className="divide-y divide-slate-100 lg:hidden">
                                            {proposals.map((p) => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => setSelectedId(p.id)}
                                                    className="cursor-pointer space-y-3.5 px-5 py-4 transition-colors hover:bg-slate-50"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="line-clamp-2 font-medium leading-snug text-slate-900">{p.judul}</p>
                                                            <p className="mt-0.5 text-sm text-slate-500">#{p.id}</p>
                                                        </div>

                                                        <Badge
                                                            label={STATUS_LABEL[p.status] || p.status}
                                                            className={STATUS_COLOR[p.status] || 'badge-neutral'}
                                                        />
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2.5">
                                                        <Badge
                                                            label={JENIS_LABEL[p.jenis] || p.jenis}
                                                            className="badge-tag"
                                                        />
                                                        <span className="text-sm text-slate-500">
                                                            {new Date(p.createdAt).toLocaleDateString('id-ID', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric',
                                                            })}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-4">
                                                        <AnggotaStack anggota={p.anggota} />
                                                        {renderRowActions(p)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="border-t border-slate-200 px-6 py-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-base text-slate-500">
                                            Halaman <span className="font-semibold text-slate-900">{page}</span> dari{' '}
                                            <span className="font-semibold text-slate-900">{totalPages}</span> — total{' '}
                                            <span className="font-semibold text-slate-900">{total}</span> proposal
                                        </p>

                                        <div className="flex gap-2.5">
                                            <button
                                                disabled={page <= 1}
                                                onClick={() => setPage((p) => p - 1)}
                                                className="btn btn-secondary"
                                            >
                                                Halaman Sebelumnya
                                            </button>
                                            <button
                                                disabled={page >= totalPages}
                                                onClick={() => setPage((p) => p + 1)}
                                                className="btn btn-secondary"
                                            >
                                                Halaman Berikutnya
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>
                    </>
                )}

                {tab === 'undangan' && (
                    <section className="card overflow-hidden">
                        <div className="border-b border-slate-200 px-6 py-4">
                            <h2 className="text-lg font-semibold text-navy-950">Undangan tim</h2>
                            <p className="mt-0.5 text-sm text-slate-500">
                                Tinjau undangan kolaborasi yang masuk dan respons sesuai peran Anda di proposal.
                            </p>
                        </div>
                        <div>
                            <UndanganSection />
                        </div>
                    </section>
                )}
            </div>

            {selectedId && (
                <ProposalDetailModal
                    proposalId={selectedId}
                    onClose={() => setSelectedId(null)}
                    onRefresh={fetchAll}
                />
            )}

            {showCreate && <ProposalFormModal onClose={() => setShowCreate(false)} onSaved={fetchAll} />}

            {editData && (
                <ProposalFormModal
                    editData={editData}
                    onClose={() => setEditData(null)}
                    onSaved={fetchAll}
                />
            )}
        </>
    )
}
