import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, FolderOpen, ListChecks } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { layarPonsel } from '../utils/layar'
import { periodeApi } from '../api/periode'
import { proposalDosenApi } from '../api/Proposaldosen'
import KepalaStatus from '../components/KepalaStatus'
import { TONE } from '../utils/toneStatus'
import { FolderPeriode, GrupTahun } from '../components/FolderPeriode'
import { DetailArsip, PratinjauArsip } from '../components/ArsipPeriode'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Arsip Kegiatan (Dosen, dulu menu "Periode"; /arsip-kegiatan, detail /arsip-kegiatan/detail/:id): semua periode
// sebagai folder, dikelompokkan per tahun. Jumlah
// kegiatan = proposal milik dosen (GET /dosen/proposals, semua halaman) + kegiatan tempat ia
// anggota (GET /dosen/proposals/as-member), dihitung per periode di peramban — endpoint dosen
// belum punya filter periodeId. Klik folder → 3 kegiatan terbaru + "Lihat lebih banyak" → detail periode
// (semua kegiatan, cari + filter status); baris → Detail Kegiatan.
// ---------------------------------------------------------------------------

const MAKS_HALAMAN = 20
const periodeIdOf = (p) => p.periodeId ?? p.periode?.id
const STATUS = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, [STATUS_LABEL[k], STATUS_COLOR[k]]]))
const keItem = (k) => ({
  id: k.id,
  judul: k.judul,
  status: k.status,
  updatedAt: k.updatedAt,
  createdAt: k.createdAt,
  keterangan: [JENIS_LABEL[k.jenis] || k.jenis, k.peranSaya].filter(Boolean).join(' · '),
  to: `/kegiatan/${k.jenis}/detail/${k.id}`,
})

async function semuaProposal() {
  const out = []
  for (let page = 1; page <= MAKS_HALAMAN; page += 1) {
    const r = await proposalDosenApi.getAll({ page, limit: 100 })
    const rows = r.data.data || []
    out.push(...rows)
    if (!rows.length || out.length >= (Number(r.data.meta?.total) || 0)) break
  }
  return out
}

export default function PeriodeDosenPage() {
  const { id: detailParam } = useParams()
  const navigate = useNavigate()
  const [periodes, setPeriodes] = useState(null)
  const [kegiatan, setKegiatan] = useState(null) // [{ ...proposal, peranSaya }]
  const [failed, setFailed] = useState(false)
  const [pilih, setPilih] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([periodeApi.getAll(), semuaProposal(), proposalDosenApi.getAsMember({ limit: 100 }).catch(() => ({ data: { data: [] } }))])
      .then(([rp, milik, anggota]) => {
        if (!alive) return
        setPeriodes(rp.data.data || [])
        const seen = new Set()
        setKegiatan(
          [...milik.map((p) => ({ ...p, peranSaya: 'Ketua' })), ...(anggota.data.data || []).map((p) => ({ ...p, peranSaya: 'Anggota' }))].filter(
            (p) => p.status !== undefined && !seen.has(p.id) && seen.add(p.id),
          ),
        )
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  const perPeriode = useMemo(() => {
    const m = {}
    for (const k of kegiatan || []) {
      const id = periodeIdOf(k)
      if (id != null) (m[id] ||= []).push(k)
    }
    return m
  }, [kegiatan])

  const itemsOf = (id) => (perPeriode[id] || []).map(keItem)

  if (detailParam) {
    const id = Number(detailParam)
    return (
      <DetailArsip
        judulMenu="Arsip Kegiatan"
        kembaliTo="/arsip-kegiatan"
        periode={(periodes || []).find((p) => p.id === id)}
        items={itemsOf(id)}
        satuan="kegiatan"
        STATUS={STATUS}
        kosong="Anda belum punya kegiatan di periode ini."
        memuat={!failed && (periodes === null || kegiatan === null)}
        gagal={failed}
      />
    )
  }

  return (
    <div className="page space-y-6">
      {/* Kepala standar (M2) */}
      <KepalaStatus
        judul="Arsip Kegiatan"
        crumbs={[{ label: 'Arsip Kegiatan' }]}
        desc="Periode penelitian & pengabdian beserta jumlah kegiatan Anda (sebagai ketua atau anggota) di tiap periode."
        kartu={[
          { icon: CalendarRange, tone: TONE.navy, label: 'Total periode', value: periodes === null ? '…' : periodes.length },
          { icon: ListChecks, tone: TONE.navy, label: 'Kegiatan saya', value: kegiatan === null ? '…' : kegiatan.length },
          { icon: FolderOpen, tone: TONE.hijau, label: 'Periode berisi', value: kegiatan === null ? '…' : Object.keys(perPeriode).length },
        ]}
      />

      {failed ? (
        <div className="card px-6 py-14 text-center text-base text-red-600">Data periode gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
      ) : periodes === null || kegiatan === null ? (
        <div className="card px-6 py-14 text-center">
          <p className="flex items-center justify-center gap-3 text-base text-slate-500">
            <span className="spinner text-navy-600" aria-hidden="true" />
            Memuat periode...
          </p>
        </div>
      ) : periodes.length === 0 ? (
        <div className="card px-6 py-14 text-center text-base text-slate-500">Belum ada periode.</div>
      ) : (
        <GrupTahun periodes={periodes} kunci="periodeDosenTahunBuka">
          {(isi) => (
            <div>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {isi.map((p) => (
                  <li key={p.id}>
                    <FolderPeriode
                      periode={p}
                      jumlah={(perPeriode[p.id] || []).length}
                      terpilih={pilih?.id === p.id}
                      onClick={() => (layarPonsel() ? navigate(`/arsip-kegiatan/detail/${p.id}`) : setPilih((prev) => (prev?.id === p.id ? null : p)))}
                    />
                  </li>
                ))}
              </ul>
              <PratinjauArsip
                periode={pilih && isi.some((p) => p.id === pilih.id) ? pilih : null}
                itemsOf={itemsOf}
                satuan="kegiatan"
                detailTo={(id) => `/arsip-kegiatan/detail/${id}`}
                STATUS={STATUS}
                kosong="Anda belum punya kegiatan di periode ini."
              />
            </div>
          )}
        </GrupTahun>
      )}
    </div>
  )
}
