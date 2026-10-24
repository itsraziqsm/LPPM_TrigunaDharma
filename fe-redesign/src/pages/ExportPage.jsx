import { useEffect, useState, useCallback } from 'react'
import { exportApi } from '../api/export'
import { periodeApi } from '../api/periode'
import { exportToPDF } from '../utils/exportPDF'
import { exportToExcel } from '../utils/exportExcel'

// ─── Konstanta ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'diajukan', label: 'Diajukan' },
  { value: 'review', label: 'Sedang Direview' },
  { value: 'revisi', label: 'Revisi' },
  { value: 'disetujui', label: 'Disetujui' },
  { value: 'ditolak', label: 'Ditolak' },
]

const JENIS_OPTIONS = [
  { value: '', label: 'Semua Jenis' },
  { value: 'penelitian', label: 'Penelitian' },
  { value: 'pengabdian', label: 'Pengabdian' },
]

const STATUS_STYLE = {
  draft: 'badge-neutral',
  diajukan: 'badge-info',
  review: 'badge-review',
  revisi: 'badge-warning',
  disetujui: 'badge-success',
  ditolak: 'badge-danger',
}

const STATUS_LABEL = {
  draft: 'Draft',
  diajukan: 'Diajukan',
  review: 'Sedang Direview',
  revisi: 'Revisi',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
}

// ─── Sub-komponen ───────────────────────────────────────────────────────────────

function Badge({ status }) {
  return (
    <span className={`badge ${STATUS_STYLE[status] || 'badge-neutral'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

const DownloadIcon = () => (
  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

function FilterBar({ filter, periodes, onChange, onSearch, loading }) {
  return (
    <section className="card p-6">
      <h2 className="mb-4 text-lg font-semibold text-navy-950">
        Filter Data
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Periode */}
        <div>
          <label htmlFor="filter-periode" className="label">Periode</label>
          <select
            id="filter-periode"
            value={filter.periodeId}
            onChange={(e) => onChange('periodeId', e.target.value)}
            className="input"
          >
            <option value="">Semua Periode</option>
            {periodes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} ({p.tahun})
              </option>
            ))}
          </select>
        </div>

        {/* Jenis */}
        <div>
          <label htmlFor="filter-jenis" className="label">Jenis Kegiatan</label>
          <select
            id="filter-jenis"
            value={filter.jenis}
            onChange={(e) => onChange('jenis', e.target.value)}
            className="input"
          >
            {JENIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label htmlFor="filter-status" className="label">Status</label>
          <select
            id="filter-status"
            value={filter.status}
            onChange={(e) => onChange('status', e.target.value)}
            className="input"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Tahun — hanya tampil kalau periode belum dipilih */}
        {!filter.periodeId && (
          <div>
            <label htmlFor="filter-tahun" className="label">Tahun</label>
            <input
              id="filter-tahun"
              type="number"
              value={filter.tahun}
              onChange={(e) => onChange('tahun', e.target.value)}
              placeholder="Contoh: 2025"
              className="input"
            />
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <button
          onClick={onSearch}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Memuat...
            </>
          ) : (
            <>
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Tampilkan Data
            </>
          )}
        </button>
      </div>
    </section>
  )
}

function RingkasanCards({ ringkasan }) {
  if (!ringkasan) return null

  return (
    <section aria-label="Ringkasan data" className="card grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {/* Per Status */}
      <div className="p-6">
        <h3 className="mb-3 text-sm font-semibold text-navy-950">Per Status</h3>
        <ul className="space-y-2.5">
          {ringkasan.perStatus.map((s) => (
            <li key={s.label} className="flex items-center justify-between text-base">
              <span className="text-slate-600">{s.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{s.count}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Per Jenis */}
      <div className="p-6">
        <h3 className="mb-3 text-sm font-semibold text-navy-950">Per Jenis</h3>
        <ul className="space-y-2.5">
          {ringkasan.perJenis.map((j) => (
            <li key={j.label} className="flex items-center justify-between text-base">
              <span className="text-slate-600">{j.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{j.count}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Per Prodi */}
      <div className="p-6">
        <h3 className="mb-3 text-sm font-semibold text-navy-950">Per Program Studi</h3>
        <ul className="space-y-2.5">
          {ringkasan.perProdi.slice(0, 6).map((p) => (
            <li key={p.programStudi} className="flex items-center justify-between text-base">
              <span className="truncate text-slate-600">{p.programStudi}</span>
              <span className="ml-2 shrink-0 font-semibold tabular-nums text-slate-900">{p.count}</span>
            </li>
          ))}
          {ringkasan.perProdi.length > 6 && (
            <li className="text-sm text-slate-400">+{ringkasan.perProdi.length - 6} prodi lainnya</li>
          )}
        </ul>
      </div>
    </section>
  )
}

function DataTable({ rows }) {
  if (!rows || rows.length === 0) return null

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-navy-950">Daftar Proposal</h2>
        <p className="mt-0.5 text-sm text-slate-500">{rows.length} proposal ditemukan</p>
      </header>

      <div className="overflow-x-auto">
        <table className="table table-tight min-w-[900px] text-sm">
          <thead>
            <tr>
              <th className="pl-6">No</th>
              <th>Judul</th>
              <th>Jenis</th>
              <th>Pengusul</th>
              <th>Prodi</th>
              <th>Periode</th>
              <th className="text-right">Anggaran</th>
              <th className="text-center">Status</th>
              <th className="pr-6 text-center">Diajukan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="pl-6 text-slate-400">{row.no}</td>
                <td className="min-w-[14rem] max-w-sm">
                  <p className="line-clamp-2 font-medium text-slate-900">{row.judul}</p>
                </td>
                <td className="whitespace-nowrap capitalize text-slate-600">{row.jenis}</td>
                <td>
                  <p className="font-medium text-slate-900">{row.pengusul}</p>
                  {row.nidn !== '-' && <p className="text-xs text-slate-400">{row.nidn}</p>}
                </td>
                <td className="text-slate-600">{row.programStudi}</td>
                <td className="text-slate-600">{row.periode}</td>
                <td className="whitespace-nowrap text-right tabular-nums text-slate-600">
                  {row.anggaran !== '-' ? `Rp ${row.anggaran}` : '-'}
                </td>
                <td className="text-center">
                  <Badge status={row.status.toLowerCase().replace('sedang direview', 'review')} />
                </td>
                <td className="whitespace-nowrap pr-6 text-center text-slate-500">{row.submittedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

const EMPTY_FILTER = { periodeId: '', jenis: '', status: '', tahun: '' }

export default function ExportPage() {
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [periodes, setPeriodes] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(null) // 'pdf' | 'excel'
  const [error, setError] = useState(null)

  // Load daftar periode untuk dropdown
  useEffect(() => {
    periodeApi.getAll().then((res) => {
      setPeriodes(res.data.data || [])
    }).catch(() => {})
  }, [])

  const handleFilterChange = (key, value) => {
    setFilter((prev) => ({
      ...prev,
      [key]: value,
      // Kalau pilih periode, kosongkan tahun (tidak relevan lagi)
      ...(key === 'periodeId' && value ? { tahun: '' } : {}),
    }))
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (filter.periodeId) params.periodeId = filter.periodeId
      if (filter.jenis) params.jenis = filter.jenis
      if (filter.status) params.status = filter.status
      if (filter.tahun) params.tahun = filter.tahun

      const res = await exportApi.getProposals(params)
      setData(res.data.data)
    } catch {
      setError('Gagal memuat data. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  // Bangun konteks filter untuk nama di file
  const buildFilterContext = () => {
    const periodeObj = periodes.find((p) => String(p.id) === String(filter.periodeId))
    return {
      periodeNama: periodeObj ? `${periodeObj.nama} (${periodeObj.tahun})` : '',
      jenis: filter.jenis,
      status: filter.status,
      tahun: filter.tahun,
    }
  }

  const handleExportPDF = async () => {
    if (!data) return
    setExporting('pdf')
    try {
      exportToPDF(data, buildFilterContext())
    } finally {
      setExporting(null)
    }
  }

  const handleExportExcel = async () => {
    if (!data) return
    setExporting('excel')
    try {
      exportToExcel(data, buildFilterContext())
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="page space-y-8">
      {/* Judul halaman */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="page-title">Export Rekapitulasi Proposal</h1>
          <p className="page-desc">
            Atur filter, tampilkan data, lalu unduh sebagai PDF atau Excel.
          </p>
        </div>

        {/* Tombol export — hanya muncul jika data sudah ada */}
        {data && (
          <div className="flex shrink-0 gap-2.5">
            <button
              onClick={handleExportExcel}
              disabled={exporting !== null}
              className="btn btn-secondary"
            >
              {exporting === 'excel' ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <DownloadIcon />
              )}
              Unduh Excel
            </button>

            <button
              onClick={handleExportPDF}
              disabled={exporting !== null}
              className="btn btn-primary"
            >
              {exporting === 'pdf' ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <DownloadIcon />
              )}
              Unduh PDF
            </button>
          </div>
        )}
      </header>

      <div className="space-y-6">
        {/* Filter */}
        <FilterBar
          filter={filter}
          periodes={periodes}
          onChange={handleFilterChange}
          onSearch={fetchData}
          loading={loading}
        />

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Ringkasan */}
        {data && <RingkasanCards ringkasan={data.ringkasan} />}

        {/* Empty state */}
        {data && data.total === 0 && (
          <div className="card px-6 py-12 text-center">
            <p className="text-base text-slate-500">Tidak ada data proposal yang cocok dengan filter ini.</p>
          </div>
        )}

        {/* Tabel preview */}
        {data && data.total > 0 && <DataTable rows={data.rows} />}

        {/* Info total */}
        {data && data.total > 0 && (
          <p className="text-right text-sm text-slate-400">
            Data diambil pada {new Date(data.generatedAt).toLocaleString('id-ID')}
          </p>
        )}
      </div>
    </div>
  )
}
