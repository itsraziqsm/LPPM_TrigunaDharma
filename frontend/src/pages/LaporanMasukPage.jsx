import { useCallback, useEffect, useState } from 'react'
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
            : 'Laporan dari periode aktif yang perlu ditindaklanjuti: tugaskan reviewer dan beri keputusan.'
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

      <div className="table-wrap">
        <table className="table table-tight">
          <thead>
            <tr>
              <th scope="col">Diajukan</th>
              <th scope="col">Judul</th>
              <th scope="col">Pengusul</th>
              <th scope="col">Jenis</th>
              <th scope="col">Status</th>
              <th scope="col">Reviewer</th>
              <th scope="col">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr aria-hidden="true">
                <td colSpan={7}>
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                </td>
              </tr>
            ) : failed ? (
              <tr>
                <td colSpan={7} className="py-10 text-center">
                  <p className="text-slate-600">Daftar laporan gagal dimuat.</p>
                  <button type="button" onClick={refresh} className="btn btn-secondary btn-sm mt-3">
                    Coba lagi
                  </button>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  {noPeriode ? 'Tidak ada periode aktif.' : `Tidak ada laporan (${filterLabel.toLowerCase()}) di periode aktif.`}
                </td>
              </tr>
            ) : (
              rows.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap tabular-nums">{tanggal(l.submittedAt || l.createdAt)}</td>
                  <td className="min-w-[16rem] max-w-md">
                    <p className="line-clamp-2 font-semibold text-slate-900">{l.judul}</p>
                    <p className="text-xs text-slate-500">{l.periode?.nama || '—'}</p>
                  </td>
                  <td>{l.pengusul?.fullName || l.pengusul?.name}</td>
                  <td>{JENIS_LABEL[l.jenis] || l.jenis}</td>
                  <td>
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="tabular-nums">{(l.reviewerTugasan || []).length}</td>
                  <td className="text-right">
                    <button type="button" onClick={() => open(l.id)} className="btn btn-ghost btn-sm">
                      {viewOnly ? 'Lihat' : 'Kelola'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > LIMIT ? (
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

      {truncated ? (
        <p className="text-xs text-amber-700">Lebih dari {FETCH_LIMIT} laporan cocok di satu periode; persempit dengan pencarian atau filter.</p>
      ) : null}

    </div>
  )
}
