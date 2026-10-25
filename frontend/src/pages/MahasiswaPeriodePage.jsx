import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { periodeApi } from '../api/periode'
import { laporanHarianApi } from '../api/laporanHarian'

// ---------------------------------------------------------------------------
// Mahasiswa › Periode (/periode): hanya periode yang memuat project (kegiatan dosen)
// tempat mahasiswa menjadi anggota tim `diterima`. Project dari
// GET /mahasiswa/laporan-harian/proposals (berisi periode {id,nama,tahun}); tanggal &
// status aktif periode dari GET /periode (boleh untuk semua user login). Klik project →
// Project Saya › Laporan Harian (/project/:jenis?id=).
// ---------------------------------------------------------------------------

const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }
const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', review: 'Review', revisi: 'Revisi', disetujui: 'Disetujui', ditolak: 'Ditolak' }
const STATUS_COLOR = {
  draft: 'badge-neutral',
  diajukan: 'badge-info',
  review: 'badge-review',
  revisi: 'badge-warning',
  disetujui: 'badge-success',
  ditolak: 'badge-danger',
}
const hari = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function MahasiswaPeriodePage() {
  const [data, setData] = useState(null) // [{ periode, projects }]
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([laporanHarianApi.getMyProposals(), periodeApi.getAll().catch(() => null)])
      .then(([pr, pe]) => {
        if (!alive) return
        const projects = pr.data.data || []
        const detail = new Map((pe?.data?.data || []).map((p) => [p.id, p]))
        const groups = new Map()
        projects.forEach((p) => {
          const id = p.periode?.id ?? p.periodeId
          if (id == null) return
          if (!groups.has(id)) groups.set(id, { periode: { ...p.periode, ...detail.get(id) }, projects: [] })
          groups.get(id).projects.push(p)
        })
        const list = [...groups.values()].sort(
          (a, b) => Number(Boolean(b.periode.isAktif)) - Number(Boolean(a.periode.isAktif)) || (b.periode.tahun || 0) - (a.periode.tahun || 0),
        )
        setData(list)
      })
      .catch(() => alive && setError('Daftar periode gagal dimuat.'))
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Periode</h1>
          <p className="page-desc">Periode kegiatan dosen yang Anda ikuti sebagai anggota tim, beserta project-nya.</p>
        </div>
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">Periode</li>
          </ol>
        </nav>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : data === null ? (
        <div className="space-y-3" aria-hidden="true">
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : data.length === 0 ? (
        <section className="card px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-navy-950">Belum ada periode</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            Periode muncul setelah Anda menerima undangan ikut serta dalam kegiatan dosen.
          </p>
          <Link to="/undangan" className="btn btn-secondary btn-sm mt-4">
            Lihat Undangan Ikut Serta
          </Link>
        </section>
      ) : (
        <ul className="space-y-4">
          {data.map(({ periode, projects }) => (
            <li key={periode.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                    <CalendarDays className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-navy-950">{periode.nama}</h2>
                    <p className="text-sm text-slate-500">
                      {[JENIS_LABEL[periode.jenis], periode.tahun ? `Tahun ${periode.tahun}` : null, periode.tanggalMulai ? `${hari(periode.tanggalMulai)} – ${hari(periode.tanggalSelesai)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                {periode.isAktif !== undefined ? (
                  <span className={`badge ${periode.isAktif ? 'badge-success' : 'badge-neutral'}`}>{periode.isAktif ? 'Aktif' : 'Nonaktif'}</span>
                ) : null}
              </div>
              <ul className="divide-y divide-slate-100">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/project/${p.jenis}?id=${p.id}`}
                      className="group flex items-center justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900 group-hover:text-navy-800">{p.judul}</span>
                        <span className="mt-0.5 block text-sm text-slate-500">
                          {JENIS_LABEL[p.jenis] || p.jenis} · Dosen pengusul: {p.pengusul?.fullName || p.pengusul?.name || '—'}
                          {p.peran ? ` · Peran: ${p.peran}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`badge ${STATUS_COLOR[p.status] || 'badge-neutral'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                        <ChevronRight className="size-4 text-slate-400 group-hover:text-navy-700" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
