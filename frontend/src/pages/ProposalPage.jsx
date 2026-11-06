import { useState } from 'react'
import AreaMemuat, { IndikatorMemuat } from '../components/AreaMemuat'
import { FileText, Gavel, Lock } from 'lucide-react'
import KartuNavy from '../components/KartuNavy'
import { barisKlik, tanpaBaris } from '../utils/barisKlik'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { proposalApi } from '../api/proposal'
import useJejakMenu from '../hooks/useJejakMenu'
import useDokumenMasuk, { FETCH_LIMIT, FILTERS_MASUK } from '../hooks/useDokumenMasuk'
import { CariFilterMasuk, KepalaMasuk, PeriodeAktif, TanpaPeriodeAktif } from '../components/PeriodeAktif'
import { API_BASE_URL } from '../api/axios'
import useAuthStore from '../store/authStore'
import { alertDialog } from '../utils/dialog'
import { getRoleNames } from '../utils/roles'
import HapusDokumen from '../components/HapusDokumen'
import PermintaanHapusDokumen from '../components/PermintaanHapusDokumen'

// Proposal yang sudah disetujui berstatus final: Ketua/Admin tidak bisa mengubahnya lagi.
const isStatusFinal = (status) => status === 'disetujui'

const openDokumenWithAuth = async (proposalId) => {
  const token = localStorage.getItem('accessToken')
  const base = API_BASE_URL

  const res = await fetch(`${base}/proposals/${proposalId}/dokumen-utama`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    alertDialog({ title: 'Gagal membuka dokumen', message: 'Dokumen tidak dapat dibuka. Silakan coba lagi.' })
    return
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

// ── Konstanta ─────────────────────────────────────────────────────────────────
const JENIS_LABEL = {
  penelitian: 'Penelitian',
  pengabdian: 'Pengabdian',
}

const STATUS_LABEL = {
  draft: 'Draft',
  diajukan: 'Diajukan',
  review: 'Review',
  revisi: 'Revisi',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
}

// Status memakai lencana bertitik (kelas ada di index.css)
const STATUS_COLOR = {
  draft: 'badge-neutral',
  diajukan: 'badge-info',
  review: 'badge-review',
  revisi: 'badge-warning',
  disetujui: 'badge-success',
  ditolak: 'badge-danger',
}

// ── Komponen Kecil ────────────────────────────────────────────────────────────
function Badge({ label, className }) {
  return <span className={`badge ${className}`}>{label}</span>
}

// Proposal Kegiatan (Dokumen Masuk): hanya periode aktif, bawaan "Perlu ditangani".
const fetchProposals = (params) => proposalApi.getAll(params)

export default function ProposalPage() {
  const { user } = useAuthStore()
  // Admin (peran pertama): lihat & hapus saja; ubah status/penugasan oleh Ketua LPPM.
  const viewOnly = getRoleNames(user?.roles)[0] === 'admin'
  const induk = useJejakMenu('akademik')

  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('perlu')
  const [jenis, setJenis] = useState('')
  const [periodeId, setPeriodeId] = useState('') // '' = semua periode aktif
  const [tick, setTick] = useState(0)
  const { periodes, periodeFailed, counts, all, truncated, loading, noPeriode } = useDokumenMasuk({
    fetchList: fetchProposals,
    filter,
    periodeId,
    jenis,
    query,
    tick,
  })
  const total = all.length
  const proposals = all.slice((page - 1) * limit, page * limit)

  const totalPages = Math.max(1, Math.ceil(total / limit))

  // Detail & ubah status = halaman /proposals/detail/:id (bukan modal). ?detail=<id>
  // (pencarian global, notifikasi, tautan lama) dialihkan ke sana.
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const linkedId = Number(searchParams.get('detail')) || null
  const bukaDetail = (pid, hash = '') => navigate(`/proposals/detail/${pid}${hash}`)

  if (linkedId) return <Navigate to={`/proposals/detail/${linkedId}`} replace />

  return (
    <>
      <div className="page space-y-6">
        {/* Kepala: judul + breadcrumb, lalu ringkasan (gaya Undangan) */}
        <KepalaMasuk
          judul="Monitoring Proposal Kewirausahaan"
          desc="Kelola proposal penelitian dan pengabdian secara terstruktur, pantau status evaluasi, serta tinjau progres dokumen, reviewer, dan laporan dalam satu halaman kerja."
          crumbs={[...induk, { label: 'Dokumen Masuk' }, { label: 'Proposal Kegiatan' }]}
          stats={[
            { label: 'Total Proposal', value: loading ? '—' : total },
            { label: 'Halaman Aktif', value: page },
            { label: 'Total Halaman', value: totalPages },
          ]}
        />

        {/* Ketua: permintaan hapus dokumen dari Admin (W-34), proposal & laporan */}
        {viewOnly ? null : <PermintaanHapusDokumen onChanged={() => setTick((t) => t + 1)} />}

        {/* Dokumen Masuk: periode aktif + filter "Perlu ditangani" (hooks/useDokumenMasuk) */}
        {noPeriode ? (
          <TanpaPeriodeAktif failed={periodeFailed} noun="Proposal" />
        ) : (
          <PeriodeAktif
            periodes={periodes}
            counts={counts}
            selected={periodeId}
            noun="Proposal"
            onSelect={(id) => {
              setPeriodeId(id)
              setPage(1)
            }}
          />
        )}
        <CariFilterMasuk
          id="proposal"
          search={search}
          onSearch={setSearch}
          onSubmit={() => {
            setPage(1)
            setQuery(search.trim())
          }}
          placeholder="Cari judul proposal, ketua, atau email"
          filter={filter}
          onFilter={(key) => {
            setFilter(key)
            setPage(1)
          }}
          jenis={jenis}
          onJenis={(v) => {
            setJenis(v)
            setPage(1)
          }}
        />

        {/* Tabel data utama — bingkai navy (M1); seluruh baris membuka detail */}
        <KartuNavy
          id="daftar-proposal"
          judul="Daftar Proposal"
          desc={`Proposal (${FILTERS_MASUK.find((f) => f.key === filter).label.toLowerCase()}) dari periode aktif. Klik baris untuk membuka detail.${
            truncated ? ` Lebih dari ${FETCH_LIMIT} cocok di satu periode; persempit dengan pencarian.` : ''
          }`}
          badge={loading ? <IndikatorMemuat /> : `${total} proposal`}
        >
          {/* Muat ulang (filter/cari/periode/aksi): tabel lama tetap tampil pudar — tanpa kedip. */}
          <AreaMemuat memuat={loading && all.length > 0}>
          {loading && all.length === 0 ? (
            <p className="flex items-center justify-center gap-3 py-12 text-center text-base text-slate-500">
              <span className="spinner text-navy-600" aria-hidden="true" />
              Memuat data...
            </p>
          ) : proposals.length === 0 ? (
            <div className="py-12 text-center">
              <h3 className="text-lg font-semibold text-navy-950">Tidak ada proposal ditemukan</h3>
              <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-slate-500">
                Coba ubah kata kunci, filter status, atau periode. Proposal periode sebelumnya ada di menu Periode.
              </p>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                {/* Ringkas (pola Riwayat Kegiatan): tanpa gulir horizontal — Anggaran di bawah Status, jumlah anggota di bawah Ketua,
                    aksi berupa ikon; ponsel: Ketua (< md) & Status (< sm) pindah ke sel Judul. */}
                <table className="table table-tight table-fixed">
                  <colgroup>
                    <col />
                    <col className="hidden w-52 md:table-column" />
                    <col className="hidden w-36 sm:table-column" />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Judul Proposal</th>
                      <th scope="col" className="hidden md:table-cell">
                        Ketua
                      </th>
                      <th scope="col" className="hidden sm:table-cell">
                        Status
                      </th>
                      <th scope="col" className="text-right">
                        <span className="sr-only">Aksi</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => {
                      const ketua = p.pengusul?.fullName || p.pengusul?.name || '—'
                      const anggaran = p.anggaran ? `Rp ${Number(p.anggaran).toLocaleString('id-ID')}` : null
                      return (
                      <tr key={p.id} {...barisKlik(() => bukaDetail(p.id), p.judul)}>
                        <td className="min-w-0">
                          <p className="line-clamp-2 break-words font-semibold leading-snug text-slate-900" title={p.judul}>
                            {p.judul}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <Badge label={JENIS_LABEL[p.jenis] || p.jenis || '—'} className="badge-tag" />
                            <span className="text-xs text-slate-500">ID #{p.id}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500 md:hidden">
                            {ketua} · {p.anggota?.length ?? 0} anggota{anggaran ? ` · ${anggaran}` : ''}
                          </p>
                          <div className="mt-1.5 sm:hidden">
                            <Badge label={STATUS_LABEL[p.status] || p.status || '—'} className={STATUS_COLOR[p.status] || 'badge-neutral'} />
                          </div>
                        </td>
                        <td className="hidden md:table-cell">
                          <p className="line-clamp-2 break-words font-medium text-slate-900" title={ketua}>
                            {ketua}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500" title={p.pengusul?.email || undefined}>
                            {p.pengusul?.email || '—'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">{p.anggota?.length ?? 0} anggota</p>
                        </td>
                        <td className="hidden sm:table-cell">
                          <Badge label={STATUS_LABEL[p.status] || p.status || '—'} className={STATUS_COLOR[p.status] || 'badge-neutral'} />
                          {anggaran ? <p className="mt-1 whitespace-nowrap text-xs tabular-nums text-slate-500">{anggaran}</p> : null}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={tanpaBaris(() => openDokumenWithAuth(p.id))}
                              className="icon-btn text-navy-700 hover:bg-navy-50"
                              title="Lihat dokumen utama"
                              aria-label={`Lihat dokumen utama ${p.judul}`}
                            >
                              <FileText className="size-4" aria-hidden="true" />
                            </button>
                            {viewOnly ? (
                              <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
                                <HapusDokumen
                                  compact
                                  tipe="proposal"
                                  id={p.id}
                                  status={p.status}
                                  noun="proposal"
                                  judul={p.judul}
                                  onDelete={async () => {
                                    await proposalApi.delete(p.id)
                                    setTick((t) => t + 1)
                                  }}
                                />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={tanpaBaris(() => bukaDetail(p.id, '#keputusan'))}
                                disabled={isStatusFinal(p.status)}
                                title={isStatusFinal(p.status) ? 'Proposal sudah disetujui; status tidak dapat diubah lagi.' : 'Ubah status proposal'}
                                aria-label={isStatusFinal(p.status) ? 'Status final' : `Ubah status ${p.judul}`}
                                className="icon-btn text-navy-700 hover:bg-navy-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                              >
                                {isStatusFinal(p.status) ? <Lock className="size-4" aria-hidden="true" /> : <Gavel className="size-4" aria-hidden="true" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 ? (
                <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm text-slate-600">
                  <span className="tabular-nums">
                    Halaman {page} dari {totalPages} · {total} proposal
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                      Sebelumnya
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                      Berikutnya
                    </button>
                  </span>
                </nav>
              ) : null}
            </>
          )}
          </AreaMemuat>
        </KartuNavy>
      </div>

    </>
  )
}
