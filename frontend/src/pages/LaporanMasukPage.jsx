import { useCallback, useEffect, useState } from 'react'
import AreaMemuat, { IndikatorMemuat } from '../components/AreaMemuat'
import KartuNavy from '../components/KartuNavy'
import { barisKlik } from '../utils/barisKlik'
import { ChevronRight } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { laporanApi } from '../api/laporan'
import useJejakMenu from '../hooks/useJejakMenu'
import useDokumenMasuk, { FETCH_LIMIT, FILTERS_MASUK } from '../hooks/useDokumenMasuk'
import { CariFilterMasuk, KepalaMasuk, PeriodeAktif, TanpaPeriodeAktif } from '../components/PeriodeAktif'
import { JENIS_LABEL } from './ProposalDosen/constants'
import { StatusBadge } from './laporan/shared'
import { tanggal } from './laporan/format'
import { getRoleNames } from '../utils/roles'
import useAuthStore from '../store/authStore'
import PermintaanHapusDokumen from '../components/PermintaanHapusDokumen'

// ---------------------------------------------------------------------------
// Laporan Masuk (Ketua LPPM / Admin): daftar laporan (GET /laporan). Detail, penugasan
// reviewer & keputusan di halaman /laporan-masuk/detail/:id (LaporanMasukDetailPage);
// tautan lama ?id=… dialihkan ke sana.
// ---------------------------------------------------------------------------

const LIMIT = 10

// Laporan Masuk = Dokumen Masuk › Laporan Kegiatan: hanya periode aktif, bawaan
// "Perlu ditangani" (logika bersama di hooks/useDokumenMasuk.js).
const fetchLaporan = (params) => laporanApi.getAll(params)

export default function LaporanMasukPage() {
  // Admin (peran pertama): lihat & hapus saja; Ketua mengelola reviewer & keputusan.
  const viewOnly = getRoleNames(useAuthStore((st) => st.user)?.roles)[0] === 'admin'
  const induk = useJejakMenu('akademik')
  // Tautan lama ?id=<id> (notifikasi, panel Periode) → halaman detail.
  const [params] = useSearchParams()
  const openId = params.get('id')
  const [periodeId, setPeriodeId] = useState('') // '' = semua periode aktif
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('perlu')
  const [jenis, setJenis] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)
  const { periodes, periodeFailed, counts, all, truncated, loading, failed, noPeriode } = useDokumenMasuk({
    fetchList: fetchLaporan,
    filter,
    periodeId,
    jenis,
    query,
    tick,
  })

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const navigate = useNavigate()
  const open = (id) => navigate(`/laporan-masuk/detail/${id}`)
  const total = all.length
  const pages = Math.max(1, Math.ceil(total / LIMIT))
  const rows = all.slice((page - 1) * LIMIT, page * LIMIT)
  const filterLabel = FILTERS_MASUK.find((f) => f.key === filter).label

  if (openId) return <Navigate to={`/laporan-masuk/detail/${openId}`} replace />

  return (
    <div className="page space-y-6">
      {/* Kepala: judul + breadcrumb, lalu ringkasan (gaya Undangan) */}
      <KepalaMasuk
        judul="Laporan Masuk"
        desc={
          viewOnly
            ? 'Laporan dari periode aktif. Akses Admin: lihat dan hapus; penugasan reviewer dan keputusan oleh Ketua LPPM.'
            : 'Laporan dari periode aktif yang perlu ditindaklanjuti: reviewer proposal menilainya otomatis, Anda memberi keputusan.'
        }
        crumbs={[...induk, { label: 'Dokumen Masuk' }, { label: 'Laporan Kegiatan' }]}
        stats={[
          { label: 'Total Laporan', value: loading ? '—' : total },
          { label: 'Halaman Aktif', value: page },
          { label: 'Total Halaman', value: pages },
        ]}
      />

      {/* Ketua: permintaan hapus laporan dari Admin (W-34) */}
      {viewOnly ? null : <PermintaanHapusDokumen tipe="laporan" onChanged={refresh} />}

      {noPeriode ? (
        <TanpaPeriodeAktif failed={periodeFailed} noun="Laporan" />
      ) : (
        <PeriodeAktif
          periodes={periodes}
          counts={counts}
          selected={periodeId}
          noun="Laporan"
          onSelect={(id) => {
            setPeriodeId(id)
            setPage(1)
          }}
        />
      )}

      <CariFilterMasuk
        id="laporan"
        search={search}
        onSearch={setSearch}
        onSubmit={() => {
          setPage(1)
          setQuery(search.trim())
        }}
        placeholder="Cari judul atau abstrak laporan"
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

      {/* Tabel bingkai navy (M1); seluruh baris membuka detail */}
      <KartuNavy
        id="daftar-laporan"
        judul="Daftar Laporan"
        desc={`Laporan (${filterLabel.toLowerCase()}) dari periode aktif. Klik baris untuk membuka detail.${
          truncated ? ` Lebih dari ${FETCH_LIMIT} cocok di satu periode; persempit dengan pencarian atau filter.` : ''
        }`}
        badge={loading ? <IndikatorMemuat /> : `${total} laporan`}
      >
        {/* Muat ulang: tabel lama tetap tampil pudar — tanpa kedip (components/AreaMemuat). */}
        <AreaMemuat memuat={loading && all.length > 0} className="table-wrap">
          {/* Ringkas (pola Riwayat Kegiatan): tanpa gulir horizontal — Jenis & periode di bawah judul, tanggal diajukan di bawah
              pengusul, jumlah reviewer di bawah status; ponsel: Pengusul (< md) & Status (< sm) pindah ke sel Judul. */}
          <table className="table table-tight table-fixed">
            <colgroup>
              <col />
              <col className="hidden w-52 md:table-column" />
              <col className="hidden w-36 sm:table-column" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Judul</th>
                <th scope="col" className="hidden md:table-cell">
                  Pengusul
                </th>
                <th scope="col" className="hidden sm:table-cell">
                  Status
                </th>
                <th scope="col">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && all.length === 0 ? (
                <tr aria-hidden="true">
                  <td colSpan={4}>
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ) : failed ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center">
                    <p className="text-slate-600">Daftar laporan gagal dimuat.</p>
                    <button type="button" onClick={refresh} className="btn btn-secondary btn-sm mt-3">
                      Coba lagi
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-500">
                    {noPeriode ? 'Tidak ada periode aktif.' : `Tidak ada laporan (${filterLabel.toLowerCase()}) di periode aktif.`}
                  </td>
                </tr>
              ) : (
                rows.map((l) => {
                  const pengusul = l.pengusul?.fullName || l.pengusul?.name || '—'
                  const reviewer = (l.reviewerTugasan || []).length
                  return (
                  <tr key={l.id} {...barisKlik(() => open(l.id), l.judul)}>
                    <td className="min-w-0">
                      <p className="line-clamp-2 break-words font-semibold text-slate-900" title={l.judul}>
                        {l.judul}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {JENIS_LABEL[l.jenis] || l.jenis} · {l.periode?.nama || '—'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 md:hidden">
                        {pengusul} · diajukan {tanggal(l.submittedAt || l.createdAt)}
                      </p>
                      <div className="mt-1.5 sm:hidden">
                        <StatusBadge status={l.status} />
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <p className="line-clamp-2 break-words font-medium text-slate-900" title={pengusul}>
                        {pengusul}
                      </p>
                      <p className="mt-0.5 whitespace-nowrap text-xs tabular-nums text-slate-500">Diajukan {tanggal(l.submittedAt || l.createdAt)}</p>
                    </td>
                    <td className="hidden sm:table-cell">
                      <StatusBadge status={l.status} />
                      <p className="mt-1 text-xs text-slate-500">{reviewer ? `${reviewer} reviewer` : 'Belum ada reviewer'}</p>
                    </td>
                    <td className="text-right">
                      <ChevronRight className="ml-auto size-4 text-slate-400" aria-hidden="true" />
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </AreaMemuat>

        {total > LIMIT ? (
          <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span className="tabular-nums">
              Halaman {page} dari {pages} · {total} laporan
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Berikutnya
              </button>
            </span>
          </nav>
        ) : null}
      </KartuNavy>
    </div>
  )
}
