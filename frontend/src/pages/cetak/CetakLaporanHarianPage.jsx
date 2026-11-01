import { useEffect, useState } from 'react'
import { FolderKanban, HeartHandshake, Microscope, Printer } from 'lucide-react'
import { laporanHarianApi } from '../../api/laporanHarian'
import KepalaStatus from '../../components/KepalaStatus'
import { TONE } from '../../utils/toneStatus'
import PanelCari from '../../components/PanelCari'
import { alertDialog } from '../../utils/dialog'
import { downloadRekap } from './laporanHarianPDF'

// ---------------------------------------------------------------------------
// Mahasiswa › Cetak Laporan (/cetak-laporan): hanya project yang punya ≥ 1 laporan harian (bisa dicetak).
// Daftar project (GET /mahasiswa/laporan-harian/proposals) tidak memuat jumlah laporan, jadi laporan tiap
// project dimuat sekali (GET /mahasiswa/laporan-harian/:proposalId, paralel) lalu dipakai ulang saat
// Cetak → PDF rekap (laporanHarianPDF.js, sama dengan tombol rekap di Project Saya). Jumlah di daftar
// project = ApiPending W-49 (opsional, menghemat permintaan).
// ---------------------------------------------------------------------------

const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

export default function CetakLaporanHarianPage() {
  // projects = project yang punya laporan harian: [{ ...project, laporan: [...] }]
  const [projects, setProjects] = useState(null)
  const [failed, setFailed] = useState(false)
  const [sebagianGagal, setSebagianGagal] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    let alive = true
    laporanHarianApi
      .getMyProposals()
      .then(async (r) => {
        const semua = r.data.data || []
        const hasil = await Promise.allSettled(semua.map((p) => laporanHarianApi.getByProposal(p.id)))
        if (!alive) return
        const gagal = hasil.some((h) => h.status === 'rejected')
        if (gagal && hasil.every((h) => h.status === 'rejected') && semua.length) {
          setFailed(true)
          return
        }
        setSebagianGagal(gagal)
        setProjects(
          semua
            .map((p, i) => ({ ...p, laporan: hasil[i].status === 'fulfilled' ? hasil[i].value.data.data || [] : [] }))
            .filter((p) => p.laporan.length > 0),
        )
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  // Laporan sudah dimuat saat halaman dibuka → langsung jadi PDF (tanpa menunggu, jadi tanpa siapkanTab).
  const cetak = (p) => {
    setBusy(p.id)
    try {
      downloadRekap(p.laporan, p.judul)
    } catch {
      alertDialog({ title: 'Gagal mencetak', message: 'PDF laporan harian tidak dapat dibuat. Coba lagi.' })
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
        desc="Cetak rekap laporan harian sebagai PDF. Hanya project yang sudah punya laporan harian yang ditampilkan."
        kartu={[
          { icon: FolderKanban, tone: TONE.navy, label: 'Project siap cetak', value: projects === null ? '…' : projects.length },
          { icon: Microscope, tone: TONE.navy, label: 'Penelitian', value: projects === null ? '…' : projects.filter((p) => p.jenis === 'penelitian').length },
          { icon: HeartHandshake, tone: TONE.hijau, label: 'Pengabdian', value: projects === null ? '…' : projects.filter((p) => p.jenis === 'pengabdian').length },
        ]}
      />

      <hr className="pemisah" />

      <PanelCari id="cetak-lh" value={search} onChange={setSearch} onSubmit={() => {}} placeholder="Cari judul project atau nama dosen pengusul" />

      {sebagianGagal ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800" role="status">
          Laporan harian sebagian project gagal dimuat, sehingga project tersebut tidak ditampilkan. Muat ulang halaman untuk mencoba lagi.
        </p>
      ) : null}

      {failed ? (
        <div className="card px-6 py-12 text-center text-base text-red-600">Daftar project gagal dimuat.</div>
      ) : projects === null ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
      ) : daftar.length === 0 ? (
        <div className="card px-6 py-12 text-center text-base text-slate-500">{projects.length ? 'Tidak ada project yang cocok.' : 'Belum ada project dengan laporan harian untuk dicetak.'}</div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {daftar.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{p.judul}</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  {[JENIS_LABEL[p.jenis] || p.jenis, p.periode?.nama, `Dosen pengusul: ${p.pengusul?.fullName || p.pengusul?.name || '—'}`, `${p.laporan.length} laporan harian`].filter(Boolean).join(' · ')}
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
