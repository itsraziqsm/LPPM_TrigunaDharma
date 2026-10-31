import { useEffect, useState } from 'react'
import { FolderKanban, HeartHandshake, Microscope, Printer } from 'lucide-react'
import { laporanHarianApi } from '../../api/laporanHarian'
import KepalaStatus from '../../components/KepalaStatus'
import { TONE } from '../../utils/toneStatus'
import PanelCari from '../../components/PanelCari'
import { alertDialog } from '../../utils/dialog'
import { downloadRekap } from './laporanHarianPDF'

// ---------------------------------------------------------------------------
// Mahasiswa › Cetak Laporan (/cetak-laporan): daftar project (GET /mahasiswa/laporan-harian/proposals),
// tombol Cetak per project → GET /mahasiswa/laporan-harian/:proposalId → PDF rekap laporan harian
// (laporanHarianPDF.js, sama dengan tombol rekap di Project Saya).
// ---------------------------------------------------------------------------

const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

export default function CetakLaporanHarianPage() {
  const [projects, setProjects] = useState(null)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    let alive = true
    laporanHarianApi
      .getMyProposals()
      .then((r) => alive && setProjects(r.data.data || []))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  const cetak = async (p) => {
    setBusy(p.id)
    try {
      const r = await laporanHarianApi.getByProposal(p.id)
      const laporan = r.data.data || []
      if (!laporan.length) {
        alertDialog({ tone: 'info', title: 'Belum ada laporan', message: 'Project ini belum punya laporan harian untuk dicetak.' })
        return
      }
      downloadRekap(laporan, p.judul)
    } catch {
      alertDialog({ title: 'Gagal mencetak', message: 'Laporan harian tidak dapat dimuat. Coba lagi.' })
    } finally {
      setBusy(null)
    }
  }

  const q = search.trim().toLowerCase()
  const daftar = (projects || []).filter((p) => !q || p.judul.toLowerCase().includes(q) || (p.pengusul?.fullName || p.pengusul?.name || '').toLowerCase().includes(q))

  return (
    <div className="page space-y-6">
      {/* Kepala standar (M2) */}
      <KepalaStatus
        judul="Cetak Laporan"
        crumbs={[{ label: 'Cetak Laporan' }]}
        desc="Cetak rekap laporan harian tiap project sebagai PDF."
        kartu={[
          { icon: FolderKanban, tone: TONE.navy, label: 'Total project', value: projects === null ? '…' : projects.length },
          { icon: Microscope, tone: TONE.navy, label: 'Penelitian', value: projects === null ? '…' : projects.filter((p) => p.jenis === 'penelitian').length },
          { icon: HeartHandshake, tone: TONE.hijau, label: 'Pengabdian', value: projects === null ? '…' : projects.filter((p) => p.jenis === 'pengabdian').length },
        ]}
      />

      <PanelCari id="cetak-lh" value={search} onChange={setSearch} onSubmit={() => {}} placeholder="Cari judul project atau nama dosen pengusul" />

      {failed ? (
        <div className="card px-6 py-12 text-center text-base text-red-600">Daftar project gagal dimuat.</div>
      ) : projects === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
      ) : daftar.length === 0 ? (
        <div className="card px-6 py-12 text-center text-base text-slate-500">{projects.length ? 'Tidak ada project yang cocok.' : 'Belum ada project yang Anda ikuti.'}</div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {daftar.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{p.judul}</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  {[JENIS_LABEL[p.jenis] || p.jenis, p.periode?.nama, `Dosen pengusul: ${p.pengusul?.fullName || p.pengusul?.name || '—'}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <button type="button" onClick={() => cetak(p)} disabled={busy === p.id} className="btn btn-secondary btn-sm">
                <Printer className="size-4" aria-hidden="true" />
                {busy === p.id ? 'Menyiapkan…' : 'Cetak rekap'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
