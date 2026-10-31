import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { periodeApi } from '../api/periode'
import { laporanHarianApi } from '../api/laporanHarian'
import { KepalaMasuk } from '../components/PeriodeAktif'
import { FolderPeriode, GrupTahun } from '../components/FolderPeriode'
import { DetailArsip, PratinjauArsip } from '../components/ArsipPeriode'
import { layarPonsel } from '../utils/layar'

// ---------------------------------------------------------------------------
// Mahasiswa › Arsip Project (dulu "Riwayat Project"; /arsip-project, detail /arsip-project/detail/:id; dulu menu "Periode", diganti karena
// rancu dengan fitur Periode admin & ketua). Periode tampil sebagai **folder** (desain sama dengan
// Periode admin/ketua/dosen, components/FolderPeriode): judul + jumlah project, dikelompokkan per
// TAHUN (GrupTahun, buka/tutup diingat di localStorage `riwayatProjectTahunBuka`). Hanya periode
// yang memuat project tempat mahasiswa anggota tim `diterima`. Project dari
// GET /mahasiswa/laporan-harian/proposals (berisi periode {id,nama,tahun}); detail periode dari
// GET /periode. Klik folder → 3 project terbaru + "Lihat lebih banyak" → detail (di ponsel langsung ke detail);
// klik project → Project Saya › Laporan Harian.
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

const STATUS = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, [STATUS_LABEL[k], STATUS_COLOR[k]]]))
const keItem = (p) => ({
  id: p.id,
  judul: p.judul,
  status: p.status,
  updatedAt: p.updatedAt,
  createdAt: p.createdAt,
  keterangan: [JENIS_LABEL[p.jenis] || p.jenis, `Dosen pengusul: ${p.pengusul?.fullName || p.pengusul?.name || '—'}`, p.peran ? `Peran: ${p.peran}` : null]
    .filter(Boolean)
    .join(' · '),
  to: `/project/${p.jenis}?id=${p.id}`,
})

export default function RiwayatProjectPage() {
  const { id: detailParam } = useParams()
  const navigate = useNavigate()
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
  const itemsOf = (id) => projectsOf(id).map(keItem)

  if (detailParam) {
    const id = Number(detailParam)
    return (
      <DetailArsip
        judulMenu="Arsip Project"
        kembaliTo="/arsip-project"
        periode={periodes.find((p) => p.id === id)}
        items={itemsOf(id)}
        satuan="project"
        STATUS={STATUS}
        kosong="Belum ada project di periode ini."
        memuat={!error && data === null}
        gagal={Boolean(error)}
      />
    )
  }

  return (
    <div className="page space-y-6">
      {/* Kepala standar (M2) */}
      <KepalaMasuk
        judul="Arsip Project"
        crumbs={[{ label: 'Arsip Project' }]}
        desc="Semua project kegiatan dosen yang Anda ikuti sebagai anggota tim, per periode dan tahun."
        stats={[
          { label: 'Total project', value: data === null ? '…' : data.reduce((n, g) => n + g.projects.length, 0) },
          { label: 'Periode', value: data === null ? '…' : data.length },
          { label: 'Periode aktif', value: data === null ? '…' : periodes.filter((p) => p.isAktif).length },
        ]}
      />

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
          {(isi) => (
            <div>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {isi.map((p) => (
                  <li key={p.id}>
                    <FolderPeriode
                      periode={p}
                      jumlah={projectsOf(p.id).length}
                      satuan="project"
                      terpilih={pilih === p.id}
                      onClick={() => (layarPonsel() ? navigate(`/arsip-project/detail/${p.id}`) : setPilih((prev) => (prev === p.id ? null : p.id)))}
                    />
                  </li>
                ))}
              </ul>
              <PratinjauArsip
                periode={isi.find((p) => p.id === pilih) || null}
                itemsOf={itemsOf}
                satuan="project"
                detailTo={(id) => `/arsip-project/detail/${id}`}
                STATUS={STATUS}
                kosong="Belum ada project di periode ini."
              />
            </div>
          )}
        </GrupTahun>
      )}
    </div>
  )
}
