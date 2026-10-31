import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, CircleCheck, FileText } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { layarPonsel } from '../../utils/layar'
import { periodeApi } from '../../api/periode'
import { monitoringApi } from '../../api/monitoring'
import { semuaHalaman } from '../../utils/semuaHalaman'
import KepalaStatus from '../../components/KepalaStatus'
import { TONE } from '../../utils/toneStatus'
import { FolderPeriode, GrupTahun } from '../../components/FolderPeriode'
import { DetailArsip, PratinjauArsip } from '../../components/ArsipPeriode'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from '../ProposalDosen/constants'
import useJejakMenu from '../../hooks/useJejakMenu'

// ---------------------------------------------------------------------------
// Ketua STMIK › Akademik › Arsip Periode (/arsip-periode, detail /arsip-periode/detail/:id; hanya baca):
// semua periode sebagai folder (FolderPeriode) dalam dropdown per tahun (GrupTahun). Jumlah =
// proposal yang sudah diajukan (GET /monitoring/proposals semua halaman, tanpa draft) per periode.
// Klik folder → 3 terbaru + "Lihat lebih banyak" → detail periode (cari + filter status);
// ponsel langsung ke detail. Baris → Detail Kegiatan (baca saja, kembali ke Arsip Periode).
// ---------------------------------------------------------------------------

const STATUS = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, [STATUS_LABEL[k], STATUS_COLOR[k]]]))
const DARI = { dari: { to: '/arsip-periode', label: 'Arsip Periode' } }
const keItem = (p) => ({
  id: p.id,
  judul: p.judul,
  status: p.status,
  updatedAt: p.updatedAt,
  createdAt: p.createdAt,
  keterangan: [JENIS_LABEL[p.jenis] || p.jenis, p.pengusul?.fullName || p.pengusul?.name, p.tahapan?.label].filter(Boolean).join(' · '),
  to: `/kegiatan/${p.jenis}/detail/${p.id}`,
  state: DARI,
})

export default function ArsipPeriodeStmikPage() {
  const { id: detailParam } = useParams()
  const navigate = useNavigate()
  const induk = useJejakMenu('akademik')
  const [periodes, setPeriodes] = useState(null)
  const [proposals, setProposals] = useState(null)
  const [failed, setFailed] = useState(false)
  const [pilih, setPilih] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([periodeApi.getAll({ limit: 100 }), semuaHalaman(monitoringApi.proposals, { urut: 'terbaru' })])
      .then(([rp, hasil]) => {
        if (!alive) return
        setPeriodes(rp.data.data || [])
        setProposals(hasil.items)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  const perPeriode = useMemo(() => {
    const m = {}
    for (const p of proposals || []) {
      const id = p.periode?.id
      if (id != null) (m[id] ||= []).push(p)
    }
    return m
  }, [proposals])

  const itemsOf = (id) => (perPeriode[id] || []).map(keItem)

  if (detailParam) {
    const id = Number(detailParam)
    return (
      <DetailArsip
        judulMenu="Arsip Periode"
        kembaliTo="/arsip-periode"
        periode={(periodes || []).find((p) => p.id === id)}
        items={itemsOf(id)}
        satuan="proposal"
        STATUS={STATUS}
        kosong="Belum ada proposal yang diajukan di periode ini."
        memuat={!failed && (periodes === null || proposals === null)}
        gagal={failed}
        induk={induk}
      />
    )
  }

  const memuat = periodes === null || proposals === null

  return (
    <div className="page space-y-6">
      <KepalaStatus
        judul="Arsip Periode"
        crumbs={[...induk, { label: 'Arsip Periode' }]}
        desc="Seluruh periode penelitian & pengabdian beserta jumlah proposal yang diajukan di tiap periode. Hanya baca."
        kartu={[
          { icon: CalendarRange, tone: TONE.navy, label: 'Total periode', value: periodes === null ? '…' : periodes.length },
          { icon: CircleCheck, tone: TONE.hijau, label: 'Periode aktif', value: periodes === null ? '…' : periodes.filter((p) => p.isAktif).length },
          { icon: FileText, tone: TONE.navy, label: 'Total proposal', value: proposals === null ? '…' : proposals.length },
        ]}
      />

      {failed ? (
        <div className="card px-6 py-14 text-center text-base text-red-600">Data periode gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
      ) : memuat ? (
        <div className="card px-6 py-14 text-center">
          <p className="flex items-center justify-center gap-3 text-base text-slate-500">
            <span className="spinner text-navy-600" aria-hidden="true" />
            Memuat periode...
          </p>
        </div>
      ) : periodes.length === 0 ? (
        <div className="card px-6 py-14 text-center text-base text-slate-500">Belum ada periode.</div>
      ) : (
        <GrupTahun periodes={periodes} kunci="arsipPeriodeStmikTahunBuka">
          {(isi) => (
            <div>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {isi.map((p) => (
                  <li key={p.id}>
                    <FolderPeriode
                      periode={p}
                      jumlah={(perPeriode[p.id] || []).length}
                      terpilih={pilih?.id === p.id}
                      satuan="proposal"
                      onClick={() => (layarPonsel() ? navigate(`/arsip-periode/detail/${p.id}`) : setPilih((prev) => (prev?.id === p.id ? null : p)))}
                    />
                  </li>
                ))}
              </ul>
              <PratinjauArsip
                periode={pilih && isi.some((p) => p.id === pilih.id) ? pilih : null}
                itemsOf={itemsOf}
                satuan="proposal"
                detailTo={(id) => `/arsip-periode/detail/${id}`}
                STATUS={STATUS}
                kosong="Belum ada proposal yang diajukan di periode ini."
              />
            </div>
          )}
        </GrupTahun>
      )}
    </div>
  )
}
