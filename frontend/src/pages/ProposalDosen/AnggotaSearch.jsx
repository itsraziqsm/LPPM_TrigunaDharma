import { useCallback, useState } from 'react'
import api from '../../api/axios'
import SearchPopup, { SearchTrigger } from '../../components/SearchPopup'

// ── Komponen Pencarian Anggota ─────────────────────────────────────────────────
// Kolom cari membuka popup pencarian (components/SearchPopup): rekomendasi dari
// GET /users/search mengikuti ketikan; klik/Enter menambahkan ke tim dan popup
// tetap terbuka agar bisa menambah beberapa anggota sekaligus.
// fixedRole: 'dosen' | 'mahasiswa' → pencarian dikunci ke satu peran (filter peran disembunyikan).
export function AnggotaSearch({ onAdd, addedIds, fixedRole, title = 'Cari anggota tim', desc, placeholder }) {
    const [role, setRole] = useState(fixedRole || '')
    const [open, setOpen] = useState(null) // null = tertutup; string = huruf awal

    const fetchRecs = useCallback(async (q) => {
        const params = { q, limit: 10 }
        if (role) params.role = role
        const res = await api.get('/users/search', { params })
        return (res.data.data || []).map((u) => {
            const roleNames = u.roles?.map((r) => r.role?.name).filter(Boolean) || []
            return {
                key: u.id,
                user: u,
                title: u.fullName || u.name,
                subtitle: [u.email, u.nidn ? `NIDN: ${u.nidn}` : null, u.nim ? `NIM: ${u.nim}` : null].filter(Boolean).join(' · '),
                badge: roleNames.includes('mahasiswa') ? 'Mahasiswa' : 'Dosen',
            }
        })
    }, [role])

    const decorate = useCallback(
        (item) => (addedIds.includes(item.user.id) ? { ...item, disabled: true, note: 'Sudah ditambahkan', badgeClass: 'badge-neutral' } : item),
        [addedIds],
    )

    const text = placeholder || 'Cari nama, email, NIDN, atau NIM...'

    return (
        <section className="space-y-3">
            <header>
                <h3 className="text-base font-semibold text-navy-950">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{desc || 'Cari berdasarkan nama, email, NIDN, atau NIM, lalu tambahkan ke daftar anggota.'}</p>
            </header>

            <SearchTrigger label={title} placeholder={text} value="" onOpen={setOpen} />

            <SearchPopup
                open={open !== null}
                onClose={() => setOpen(null)}
                title={title}
                placeholder={text}
                initialQuery={open || ''}
                fetchRecs={fetchRecs}
                decorate={decorate}
                keepOpenOnSelect
                onSelect={(item) => onAdd(item.user)}
                hint="Ketik minimal 2 karakter. Pilih nama untuk menambahkan ke tim; popup tetap terbuka untuk anggota berikutnya."
                emptyText="Tidak ada pengguna ditemukan. Coba kata kunci lain atau ubah filter peran."
            >
                {fixedRole ? null : (
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                        Peran
                        <select aria-label="Filter peran anggota" value={role} onChange={(e) => setRole(e.target.value)} className="input h-8 w-40 py-0 text-sm">
                            <option value="">Semua peran</option>
                            <option value="dosen">Dosen</option>
                            <option value="mahasiswa">Mahasiswa</option>
                        </select>
                    </label>
                )}
            </SearchPopup>
        </section>
    )
}
