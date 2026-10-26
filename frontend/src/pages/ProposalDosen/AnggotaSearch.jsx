import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import api from '../../api/axios'
import { Search, X } from 'lucide-react'
import UserAvatar from '../../components/UserAvatar'

// ── Komponen Pencarian Anggota ─────────────────────────────────────────────────
// fixedRole: 'dosen' | 'mahasiswa' → pencarian dikunci ke satu peran (filter peran disembunyikan).
// ketuaId: id ketua pengusul → tampil nonaktif "Ketua kegiatan" (tidak bisa jadi anggota).
export function AnggotaSearch({ onAdd, addedIds, ketuaId, fixedRole, title = 'Cari anggota tim', desc, placeholder }) {
    const [query, setQuery] = useState('')
    const [role, setRole] = useState(fixedRole || '')
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)
    const [searched, setSearched] = useState(false)
    const [dropdownStyle, setDropdownStyle] = useState({})
    const debounce = useRef(null)
    const wrapRef = useRef(null)
    const inputRef = useRef(null)

    const updateDropdownPos = useCallback(() => {
        if (!inputRef.current) return
        const rect = inputRef.current.getBoundingClientRect()
        // Buka ke atas bila ruang di bawah kolom tidak cukup untuk daftar hasil.
        const spaceBelow = window.innerHeight - rect.bottom
        const openUp = spaceBelow < 360 && rect.top > spaceBelow
        setDropdownStyle({
            position: 'fixed',
            ...(openUp ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
        })
    }, [])

    const doSearch = useCallback((q, r) => {
        if (q.trim().length < 2) { setResults([]); setOpen(false); setSearched(false); return }
        setLoading(true)
        updateDropdownPos()
        const params = { q: q.trim(), limit: 10 }
        if (r) params.role = r
        api.get('/users/search', { params })
            .then(res => {
                setResults(res.data.data || [])
                setOpen(true)
                setSearched(true)
            })
            .catch(() => { setResults([]); setOpen(true); setSearched(true) })
            .finally(() => setLoading(false))
    }, [updateDropdownPos])

    const handleQueryChange = (e) => {
        const v = e.target.value
        setQuery(v)
        clearTimeout(debounce.current)
        debounce.current = setTimeout(() => doSearch(v, role), 350)
    }

    const handleRoleChange = (e) => {
        const r = e.target.value
        setRole(r)
        clearTimeout(debounce.current)
        if (query.trim().length >= 2) {
            debounce.current = setTimeout(() => doSearch(query, r), 200)
        }
    }

    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    useEffect(() => {
        if (!open) return
        const handle = () => updateDropdownPos()
        window.addEventListener('scroll', handle, true)
        window.addEventListener('resize', handle)
        return () => {
            window.removeEventListener('scroll', handle, true)
            window.removeEventListener('resize', handle)
        }
    }, [open, updateDropdownPos])

    const pick = (user) => {
        onAdd(user)
        setQuery('')
        setResults([])
        setOpen(false)
        setSearched(false)
    }

    const dropdown = open && (
        <div
            style={dropdownStyle}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-navy-950">Hasil pencarian anggota</p>
                <p className="mt-0.5 text-sm text-slate-500">Pilih dosen atau mahasiswa untuk ditambahkan ke tim.</p>
            </div>

            <div className="max-h-80 overflow-y-auto">
                {results.length > 0 ? results.map(u => {
                    const isKetua = ketuaId != null && u.id === ketuaId
                    const alreadyAdded = isKetua || addedIds.includes(u.id)
                    const roleNames = u.roles?.map(r => r.role?.name).filter(Boolean) || []
                    const isMahasiswa = roleNames.includes('mahasiswa')
                    const roleLabel = isMahasiswa ? 'Mahasiswa' : 'Dosen'

                    return (
                        <button
                            key={u.id}
                            onMouseDown={(e) => { e.preventDefault(); if (!alreadyAdded) pick(u) }}
                            disabled={alreadyAdded}
                            className={`flex w-full items-center gap-3.5 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0 ${alreadyAdded
                                ? 'cursor-not-allowed bg-slate-50 opacity-60'
                                : 'cursor-pointer hover:bg-navy-50/60'
                                }`}
                        >
                            <UserAvatar user={u} className="size-9 text-sm" fallbackClassName="bg-navy-100 text-navy-800" />

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-semibold text-slate-900">{u.fullName || u.name}</p>
                                <p className="mt-0.5 break-words text-sm leading-relaxed text-slate-500">
                                    {u.email}
                                    {u.nidn ? ` · NIDN: ${u.nidn}` : ''}
                                    {u.nim ? ` · NIM: ${u.nim}` : ''}
                                </p>
                            </div>

                            <div className="shrink-0">
                                {alreadyAdded ? (
                                    <span className="badge badge-neutral">
                                        {isKetua ? 'Ketua kegiatan' : 'Sudah ditambahkan'}
                                    </span>
                                ) : (
                                    <span className="badge badge-tag">
                                        {roleLabel}
                                    </span>
                                )}
                            </div>
                        </button>
                    )
                }) : (
                    <div className="px-5 py-8 text-center">
                        {loading ? (
                            <p className="text-base text-slate-500">Mencari data pengguna...</p>
                        ) : (
                            <>
                                <p className="text-base font-semibold text-slate-700">Tidak ada pengguna ditemukan</p>
                                <p className="mt-1 text-sm leading-relaxed text-slate-500">Coba gunakan kata kunci lain atau ubah filter peran.</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {results.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5">
                    <p className="text-sm text-slate-500">{results.length} pengguna ditemukan. Klik satu nama untuk menambahkan ke tim.</p>
                </div>
            )}
        </div>
    )

    return (
        <section ref={wrapRef} className="space-y-3">
            <header>
                <h3 className="text-base font-semibold text-navy-950">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{desc || 'Cari berdasarkan nama, email, NIDN, atau NIM, lalu tambahkan ke daftar anggota.'}</p>
            </header>

            <div className={`grid grid-cols-1 gap-3 ${fixedRole ? '' : 'md:grid-cols-[180px_minmax(0,1fr)]'}`}>
                {fixedRole ? null : <select
                    aria-label="Filter peran anggota"
                    value={role}
                    onChange={handleRoleChange}
                    className="input"
                >
                    <option value="">Semua peran</option>
                    <option value="dosen">Dosen</option>
                    <option value="mahasiswa">Mahasiswa</option>
                </select>}

                <div className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        aria-label={title}
                        value={query}
                        onChange={handleQueryChange}
                        onFocus={() => {
                            updateDropdownPos()
                            if (searched) setOpen(true)
                        }}
                        placeholder={placeholder || 'Cari nama, email, NIDN, atau NIM...'}
                        className="input pr-11"
                    />

                    {loading ? (
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <span className="spinner" aria-hidden="true" />
                        </div>
                    ) : query.length > 0 ? (
                        <button
                            onMouseDown={(e) => { e.preventDefault(); setQuery(''); setOpen(false); setSearched(false); setResults([]) }}
                            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                            <span className="sr-only">Bersihkan pencarian</span>
                            <X className="size-4" aria-hidden="true" />
                        </button>
                    ) : (
                        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <Search className="size-[18px]" strokeWidth={1.6} aria-hidden="true" />
                        </div>
                    )}
                </div>
            </div>

            {query.trim().length > 0 && query.trim().length < 2 && (
                <p className="text-sm text-amber-700">Ketik minimal 2 karakter untuk memulai pencarian.</p>
            )}
            {query.trim().length === 0 && (
                <p className="text-sm text-slate-500">Belum ada kata kunci. Masukkan nama, email, NIDN, atau NIM untuk mencari anggota.</p>
            )}

            {createPortal(dropdown, document.body)}
        </section>
    )
}
