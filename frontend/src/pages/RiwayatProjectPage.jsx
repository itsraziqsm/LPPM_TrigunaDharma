import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { periodeApi } from '../api/periode'
import { laporanHarianApi } from '../api/laporanHarian'
import Breadcrumb from '../components/Breadcrumb'
import { FolderPeriode, GrupTahun } from '../components/FolderPeriode'

// ---------------------------------------------------------------------------
// Mahasiswa › Arsip Project (dulu "Riwayat Project"; /riwayat-project; dulu menu "Periode", diganti karena
// rancu dengan fitur Periode admin & ketua). Periode tampil sebagai **folder** (desain sama dengan
// Periode admin/ketua/dosen, components/FolderPeriode): judul + jumlah project, dikelompokkan per
// TAHUN (GrupTahun, buka/tutup diingat di localStorage `riwayatProjectTahunBuka`). Hanya periode
// yang memuat project tempat mahasiswa anggota tim `diterima`. Project dari
// GET /mahasiswa/laporan-harian/proposals (berisi periode {id,nama,tahun}); detail periode dari
// GET /periode. Klik folder → daftar project; klik project → Project Saya › Laporan Harian.
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

export default function RiwayatProjectPage() {
  const [data, setData] = useState(null) // [{ periode, projects }]
  const [error, setError] = useState('')
  const [pilih, setPilih] = useState(null) // id periode yang dibuka

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
          if (!groups.has(id)) groups.set(id, { periode: { id, ...p.periode, ...detail.get(id) }, projects: [] })
          groups.get(id).projects.push(p)
        })
        setData([...groups.values()])
      })
      .catch(() => alive && setError('Daftar periode gagal dimuat.'))
    return () => {
      alive = false
    }
  }, [])

  const periodes = (data || []).map((g) => g.periode)
  const projectsOf = (id) => data?.find((g) => g.periode.id === id)?.projects || []

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Arsip Project</h1>
          <p className="page-desc">Semua project kegiatan dosen yang Anda ikuti sebagai anggota tim, per periode dan tahun.</p>
        </div>
        <Breadcrumb items={[{ label: 'Arsip Project' }]} />
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
          <h2 className="text-lg font-semibold text-navy-950">Belum ada riwayat project</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            Project muncul setelah Anda menerima undangan ikut serta dalam kegiatan dosen.
          </p>
          <Link to="/undangan" className="btn btn-secondary btn-sm mt-4">
            Lihat Undangan Ikut Serta
          </Link>
        </section>
      ) : (
        <GrupTahun periodes={periodes} kunci="riwayatProjectTahunBuka">
          {(isi) => {
            const terpilih = isi.find((p) => p.id === pilih)
            const projects = terpilih ? projectsOf(terpilih.id) : []
            return (
              <div className="space-y-4">
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {isi.map((p) => (
                    <li key={p.id}>
                      <FolderPeriode
                        periode={p}
                        jumlah={projectsOf(p.id).length}
                        satuan="project"
                        terpilih={pilih === p.id}
                        onClick={() => setPilih((prev) => (prev === p.id ? null : p.id))}
                      />
                    </li>
                  ))}
                </ul>
                {terpilih ? (
                  <section aria-label={`Project ${terpilih.nama}`} className="rounded-xl border border-slate-200">
                    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
                      <h3 className="font-semibold text-navy-950">{terpilih.nama}</h3>
                      <span className="text-sm text-slate-500">{projects.length} project</span>
                    </header>
                    <ul className="divide-y divide-slate-100">
                      {projects.map((p) => (
                        <li key={p.id}>
                          <Link
                            to={`/project/${p.jenis}?id=${p.id}`}
                            className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50"
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
                  </section>
                ) : null}
              </div>
            )
          }}
        </GrupTahun>
      )}
    </div>
  )
}
