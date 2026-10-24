import { useState, useCallback, useEffect } from 'react'
import { proposalDosenApi } from '../../api/Proposaldosen'
import { Badge } from './components'
import { JENIS_LABEL, UNDANGAN_COLOR } from './constants'

// ── Tab Undangan Saya ─────────────────────────────────────────────────────────

export function UndanganSection() {
    const [undangan, setUndangan] = useState([])
    const [loading, setLoading] = useState(true)
    const [responding, setResponding] = useState(null)
    const [msg, setMsg] = useState({})

    const fetchUndangan = useCallback(() => {
        setLoading(true)
        proposalDosenApi.getMyInvitations()
            .then(res => setUndangan(res.data.data || []))
            .catch(() => setUndangan([]))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { fetchUndangan() }, [])

    const respond = async (id, status) => {
        setResponding(id); setMsg(m => ({ ...m, [id]: '' }))
        try {
            await proposalDosenApi.respondInvitation(id, status)
            setMsg(m => ({ ...m, [id]: status === 'diterima' ? 'Undangan diterima.' : 'Undangan ditolak.' }))
            fetchUndangan()
        } catch (e) {
            setMsg(m => ({ ...m, [id]: e.response?.data?.message || 'Gagal merespons.' }))
        } finally {
            setResponding(null)
        }
    }

    if (loading) {
        return (
            <p className="flex items-center justify-center gap-3 px-6 py-14 text-base text-slate-500">
                <span className="spinner text-navy-600" aria-hidden="true" />
                Memuat undangan...
            </p>
        )
    }

    if (undangan.length === 0) {
        return (
            <div className="px-6 py-14 text-center">
                <p className="text-base font-medium text-slate-700">Tidak ada undangan saat ini.</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">Anda akan menerima undangan saat ditambahkan sebagai anggota tim proposal.</p>
            </div>
        )
    }

    return (
        <div className="divide-y divide-slate-100">
            {undangan.map((u) => {
                const isPending = u.statusUndangan === 'pending'
                return (
                    <div key={u.id} className="px-6 py-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge
                                        label={u.statusUndangan === 'diterima' ? 'Diterima' : u.statusUndangan === 'ditolak' ? 'Ditolak' : 'Menunggu Respons'}
                                        className={UNDANGAN_COLOR[u.statusUndangan] || 'badge-neutral'}
                                    />
                                    <Badge label={JENIS_LABEL[u.proposal.jenis] || u.proposal.jenis} className="badge-tag" />
                                    <Badge label={`Peran: ${u.peran}`} className="badge-tag" />
                                </div>
                                <p className="text-base font-medium leading-snug text-slate-900">{u.proposal.judul}</p>
                                <p className="mt-1.5 text-sm text-slate-500">
                                    Diusulkan oleh {u.proposal.pengusul.fullName || u.proposal.pengusul.name}
                                    {u.proposal.periode && ` · ${u.proposal.periode.nama} ${u.proposal.periode.tahun}`}
                                </p>
                                <p className="mt-0.5 text-sm text-slate-500">
                                    Undangan dikirim {new Date(u.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            {isPending && (
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        onClick={() => respond(u.id, 'diterima')}
                                        disabled={responding === u.id}
                                        className="btn btn-primary btn-sm"
                                    >
                                        {responding === u.id ? '...' : 'Terima'}
                                    </button>
                                    <button
                                        onClick={() => respond(u.id, 'ditolak')}
                                        disabled={responding === u.id}
                                        className="btn btn-secondary btn-sm"
                                    >
                                        Tolak
                                    </button>
                                </div>
                            )}
                        </div>
                        {msg[u.id] && (
                            <p className={`mt-2.5 text-sm ${msg[u.id].includes('Gagal') ? 'text-red-700' : 'text-green-700'}`}>{msg[u.id]}</p>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
