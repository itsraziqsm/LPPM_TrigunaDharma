import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { periodeApi } from '../api/periode'
import { proposalDosenApi } from '../api/Proposaldosen'
import Breadcrumb from '../components/Breadcrumb'
import { FolderPeriode, GrupTahun } from '../components/FolderPeriode'
import { STATUS_COLOR, STATUS_LABEL } from './ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Arsip Kegiatan (Dosen, menu dulu "Periode"; route tetap /periode): semua periode sebagai folder, dikelompokkan per tahun. Jumlah
// kegiatan = proposal milik dosen (GET /dosen/proposals, semua halaman) + kegiatan tempat ia
// anggota (GET /dosen/proposals/as-member), dihitung per periode di peramban — endpoint dosen
// belum punya filter periodeId. Klik folder → daftar kegiatannya; baris → Detail Kegiatan.
// ---------------------------------------------------------------------------

const MAKS_HALAMAN = 20
const periodeIdOf = (p) => p.periodeId ?? p.periode?.id

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

  const daftar = pilih ? perPeriode[pilih.id] || [] : []

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Arsip Kegiatan</h1>
          <p className="page-desc">Periode penelitian & pengabdian beserta jumlah kegiatan Anda (sebagai ketua atau anggota) di tiap periode.</p>
        </div>
        <Breadcrumb items={[{ label: 'Arsip Kegiatan' }]} />
      </header>

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
            <div className="space-y-4">
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {isi.map((p) => (
                  <li key={p.id}>
                    <FolderPeriode
                      periode={p}
                      jumlah={(perPeriode[p.id] || []).length}
                      terpilih={pilih?.id === p.id}
                      onClick={() => setPilih((prev) => (prev?.id === p.id ? null : p))}
                    />
                  </li>
                ))}
              </ul>
              {pilih && isi.some((p) => p.id === pilih.id) ? (
                <section aria-label={`Kegiatan ${pilih.nama}`} className="rounded-xl border border-slate-200">
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
                    <h3 className="font-semibold text-navy-950">{pilih.nama}</h3>
                    <span className="text-sm text-slate-500">{daftar.length} kegiatan</span>
                  </header>
                  {daftar.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">Anda belum punya kegiatan di periode ini.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {daftar.map((k) => (
                        <li key={k.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/kegiatan/${k.jenis || pilih.jenis}/detail/${k.id}`)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-slate-900">{k.judul}</span>
                              <span className="text-xs text-slate-500">{k.peranSaya}</span>
                            </span>
                            <span className={`badge ${STATUS_COLOR[k.status] || 'badge-neutral'}`}>{STATUS_LABEL[k.status] || k.status}</span>
                            <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>
          )}
        </GrupTahun>
      )}
    </div>
  )
}
