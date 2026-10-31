import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Coins, FileCheck2, FileText, Users } from 'lucide-react'
import { monitoringApi } from '../../api/monitoring'
import { laporanApi } from '../../api/laporan'
import { proposalApi } from '../../api/proposal'
import { semuaHalaman } from '../../utils/semuaHalaman'
import { BatangTopik, Banding, Donat } from './Grafik'
import { WARNA, fmtPersen, persen } from './warna'

// ---------------------------------------------------------------------------
// Statistik (Ketua STMIK): kartu angka + diagram, semua mengikuti filter halaman (periode, jenis,
// cari, termasuk draft). Data semua halaman (utils/semuaHalaman):
//   GET /monitoring/proposals — status, jenis, anggaran, laporan per proposal
//   GET /laporan              — jumlah & status laporan (tanpa draft)
//   GET /proposals            — topik: bidang, rumpun ilmu, kata kunci
// Kartu: jumlah proposal, jumlah laporan, dosen pengusul, anggaran disetujui. Diagram: keputusan
// proposal (klik = saring tabel), laporan terhadap proposal disetujui, penelitian vs pengabdian,
// topik paling sering diangkat.
// ---------------------------------------------------------------------------

const rupiah = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
const rupiahRingkas = (v) => {
  const n = Number(v || 0)
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return rupiah(n)
}
const angka = (v) => Number(v) || 0
const TOPIK = [
  ['bidang', 'Bidang'],
  ['rumpunIlmu', 'Rumpun ilmu'],
  ['kataKunci', 'Kata kunci'],
]

function hitungTopik(list, field) {
  const m = new Map()
  for (const p of list) {
    const nilai = field === 'kataKunci' ? (Array.isArray(p.kataKunci) ? p.kataKunci : []) : [p[field]]
    for (const v of new Set(nilai.map((x) => String(x || '').trim()).filter(Boolean))) {
      const k = v.toLowerCase()
      const ada = m.get(k)
      m.set(k, { nama: ada?.nama || v, jumlah: (ada?.jumlah || 0) + 1 })
    }
  }
  return [...m.values()].sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama)).slice(0, 8)
}

function KartuAngka({ icon: Icon, label, nilai, ket }) {
  return (
    <div className="card flex items-start justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 font-serif text-2xl font-medium tabular-nums text-navy-950 sm:text-3xl">{nilai}</p>
        {ket ? <p className="mt-1 text-xs leading-snug text-slate-500">{ket}</p> : null}
      </div>
      <span className="hidden size-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700 sm:grid">
        <Icon className="size-5" aria-hidden="true" />
      </span>
    </div>
  )
}

function Panel({ judul, desc, aksi, children }) {
  return (
    <section className="card @container flex flex-col p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-navy-950">{judul}</h2>
          {desc ? <p className="mt-0.5 text-sm text-slate-500">{desc}</p> : null}
        </div>
        {aksi}
      </header>
      {children}
    </section>
  )
}

export default function StatistikVisual({ filter, ringkasan, status, onStatus }) {
  const [data, setData] = useState(null) // { proposals, laporan, topik }
  const [failed, setFailed] = useState(false)
  const [topik, setTopik] = useState('bidang')

  useEffect(() => {
    let alive = true
    setData(null)
    setFailed(false)
    const q = Object.fromEntries(Object.entries({ periodeId: filter.periodeId, jenis: filter.jenis, search: filter.search }).filter(([, v]) => v))
    Promise.all([
      semuaHalaman(monitoringApi.proposals, { ...q, ...(filter.termasukDraft ? { termasukDraft: true } : {}) }),
      semuaHalaman(laporanApi.getAll, q),
      semuaHalaman(proposalApi.getAll, q),
    ])
      .then(([p, l, t]) => {
        if (!alive) return
        setData({
          proposals: p.items,
          laporan: l.items.filter((x) => x.status !== 'draft'),
          topik: t.items.filter((x) => filter.termasukDraft || x.status !== 'draft'),
        })
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [filter])

  const s = useMemo(() => {
    if (!data) return null
    const P = data.proposals
    const per = (st) => P.filter((p) => p.status === st).length
    const disetujui = P.filter((p) => p.status === 'disetujui')
    const sudahLapor = disetujui.filter((p) => p.laporan && p.laporan.status !== 'draft')
    const diputuskan = per('disetujui') + per('ditolak')
    const jenis = (j) => {
      const l = P.filter((p) => p.jenis === j)
      return {
        jumlah: l.length,
        anggaran: l.reduce((n, p) => n + angka(p.anggaran), 0),
        disetujui: l.filter((p) => p.status === 'disetujui').reduce((n, p) => n + angka(p.anggaran), 0),
        laporan: data.laporan.filter((x) => x.jenis === j).length,
      }
    }
    return {
      jumlah: P.length,
      per,
      disetujui: disetujui.length,
      sudahLapor: sudahLapor.length,
      laporanPer: (st) => data.laporan.filter((x) => x.status === st).length,
      tingkatTerima: persen(per('disetujui'), diputuskan),
      diputuskan,
      penelitian: jenis('penelitian'),
      pengabdian: jenis('pengabdian'),
    }
  }, [data])

  const topikItems = useMemo(() => (data ? hitungTopik(data.topik, topik) : []), [data, topik])

  if (failed) return <div className="card px-6 py-10 text-center text-base text-red-600">Statistik gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
  if (!s)
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    )

  const proses = s.per('diajukan') + s.per('review')
  const segKeputusan = [
    ...(filter.termasukDraft ? [{ key: 'draft', label: 'Draft', value: s.per('draft'), color: WARNA.track }] : []),
    { key: 'proses', label: 'Diproses (diajukan & review)', value: proses, color: WARNA.navy },
    { key: 'revisi', label: 'Revisi', value: s.per('revisi'), color: WARNA.brass },
    { key: 'disetujui', label: 'Diterima', value: s.per('disetujui'), color: WARNA.hijau },
    { key: 'ditolak', label: 'Ditolak', value: s.per('ditolak'), color: WARNA.merah },
  ]
  const pilihStatus = (k) => {
    const st = k === 'proses' ? 'diajukan' : k
    onStatus(status === st ? '' : st)
  }

  return (
    <div className="space-y-4">
      {/* Kartu angka */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Ringkasan">
        <KartuAngka
          icon={FileText}
          label="Jumlah proposal"
          nilai={s.jumlah}
          ket={`Penelitian ${s.penelitian.jumlah} · Pengabdian ${s.pengabdian.jumlah}${filter.termasukDraft ? ' · termasuk draft' : ''}`}
        />
        <KartuAngka icon={FileCheck2} label="Jumlah laporan" nilai={data.laporan.length} ket={`${s.laporanPer('disetujui')} laporan diterima`} />
        <KartuAngka icon={Users} label="Dosen pengusul" nilai={ringkasan === undefined ? '…' : (ringkasan?.jumlahDosenPengusul ?? '—')} />
        <KartuAngka
          icon={Coins}
          label="Anggaran disetujui"
          nilai={rupiahRingkas(s.penelitian.disetujui + s.pengabdian.disetujui)}
          ket={`dari ${rupiahRingkas(s.penelitian.anggaran + s.pengabdian.anggaran)} diajukan`}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel judul="Keputusan proposal" desc={`Tingkat penerimaan ${fmtPersen(s.tingkatTerima)} dari ${s.diputuskan} proposal yang sudah diputuskan. Klik untuk menyaring tabel.`}>
          <Donat
            label="Persentase status proposal"
            segmen={segKeputusan}
            tengah={{ nilai: s.jumlah, label: 'proposal' }}
            onPilih={(k) => k !== 'draft' && pilihStatus(k)}
            aktif={status === 'diajukan' ? 'proses' : status}
          />
        </Panel>

        <Panel judul="Laporan terhadap proposal" desc="Proposal yang sudah diterima dan sudah mengirim laporan kegiatan.">
          <Donat
            label="Persentase proposal diterima yang sudah melapor"
            segmen={[
              { key: 'sudah', label: 'Sudah mengirim laporan', value: s.sudahLapor, color: WARNA.navy },
              { key: 'belum', label: 'Belum mengirim laporan', value: s.disetujui - s.sudahLapor, color: WARNA.track },
            ]}
            tengah={{ nilai: fmtPersen(persen(s.sudahLapor, s.disetujui)), label: 'sudah melapor' }}
          />
          <dl className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-sm @md:grid-cols-4">
            {[
              ['Diproses', s.laporanPer('diajukan') + s.laporanPer('review')],
              ['Revisi', s.laporanPer('revisi')],
              ['Diterima', s.laporanPer('disetujui')],
              ['Ditolak', s.laporanPer('ditolak')],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Laporan {k.toLowerCase()}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {v} <span className="text-xs font-normal text-slate-500">{fmtPersen(persen(v, data.laporan.length))}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel judul="Penelitian vs pengabdian" desc="Perbandingan jumlah, anggaran, dan laporan per jenis kegiatan.">
          <Banding
            kiri={{ label: 'Penelitian', color: WARNA.navy }}
            kanan={{ label: 'Pengabdian', color: WARNA.brass }}
            baris={[
              { label: 'Jumlah proposal', kiri: s.penelitian.jumlah, kanan: s.pengabdian.jumlah, format: (v) => String(v) },
              { label: 'Anggaran diajukan', kiri: s.penelitian.anggaran, kanan: s.pengabdian.anggaran, format: rupiahRingkas },
              { label: 'Anggaran disetujui', kiri: s.penelitian.disetujui, kanan: s.pengabdian.disetujui, format: rupiahRingkas },
              { label: 'Jumlah laporan', kiri: s.penelitian.laporan, kanan: s.pengabdian.laporan, format: (v) => String(v) },
            ]}
          />
        </Panel>

        <Panel
          judul="Topik paling sering diangkat"
          desc="8 teratas dari proposal yang diajukan."
          aksi={
            <div role="tablist" aria-label="Jenis topik" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
              {TOPIK.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={topik === k}
                  onClick={() => setTopik(k)}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${topik === k ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          }
        >
          <BatangTopik items={topikItems} />
        </Panel>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <ClipboardCheck className="size-3.5" aria-hidden="true" />
        Persentase dibulatkan satu desimal. Arahkan kursor ke diagram untuk melihat rinciannya.
      </p>
    </div>
  )
}
