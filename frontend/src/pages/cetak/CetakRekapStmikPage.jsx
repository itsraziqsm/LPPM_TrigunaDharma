import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Coins, FileText, FolderOpen, Printer } from 'lucide-react'
import { monitoringApi } from '../../api/monitoring'
import { periodeApi } from '../../api/periode'
import { semuaHalaman } from '../../utils/semuaHalaman'
import KepalaStatus from '../../components/KepalaStatus'
import { TONE } from '../../utils/toneStatus'
import { alertDialog } from '../../utils/dialog'
import { agregat, rekapAnggaranPDF, rekapPeriodePDF, rekapTahunanPDF, rupiah } from './rekapStmikPDF'

// ---------------------------------------------------------------------------
// Ketua STMIK › Cetak Laporan (/cetak-laporan; mahasiswa memakai rute yang sama untuk laporan
// harian). Tiga dokumen PDF (rekapStmikPDF.js) dari GET /monitoring/proposals (semua halaman,
// tanpa draft) + GET /periode, agregat dihitung di peramban:
//   1. Rekap kegiatan per periode (satu/semua periode, opsional daftar proposal)
//   2. Rekap tahunan (per periode di tahun itu + per jenis)
//   3. Rekap anggaran disetujui (filter tahun & jenis; + realisasi laporan)
// ---------------------------------------------------------------------------

// Angka ringkas untuk kartu kepala (mis. Rp 30 jt).
const rupiahRingkas = (v) => {
  const n = Number(v || 0)
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return rupiah(n)
}
const urutPeriode = (a, b) => (Number(b.tahun) || 0) - (Number(a.tahun) || 0) || String(a.nama).localeCompare(String(b.nama))

function KartuCetak({ icon: Icon, judul, desc, ringkas, onCetak, disabled, children }) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-navy-950">{judul}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{desc}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
      <p className="mt-auto rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{ringkas}</p>
      <button type="button" onClick={onCetak} disabled={disabled} className="btn btn-primary">
        <Printer className="size-4" aria-hidden="true" />
        Cetak PDF
      </button>
    </section>
  )
}

function Pilih({ id, label, value, onChange, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  )
}

export default function CetakRekapStmikPage() {
  const [periodes, setPeriodes] = useState(null)
  const [proposals, setProposals] = useState(null)
  const [failed, setFailed] = useState(false)
  const [periodeId, setPeriodeId] = useState('')
  const [denganDaftar, setDenganDaftar] = useState(true)
  const [tahun, setTahun] = useState('')
  const [anggaran, setAnggaran] = useState({ tahun: '', jenis: '' })

  useEffect(() => {
    let alive = true
    Promise.all([periodeApi.getAll({ limit: 100 }), semuaHalaman(monitoringApi.proposals, { urut: 'terbaru' })])
      .then(([rp, hasil]) => {
        if (!alive) return
        setPeriodes([...(rp.data.data || [])].sort(urutPeriode))
        setProposals(hasil.items.filter((p) => p.status !== 'draft'))
        if (hasil.terpotong) alertDialog({ tone: 'warning', title: 'Data terlalu banyak', message: 'Sebagian proposal tidak dimuat; rekap mungkin tidak lengkap.' })
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  const daftarTahun = useMemo(() => [...new Set((periodes || []).map((p) => p.tahun).filter(Boolean))].sort((a, b) => b - a), [periodes])
  const tahunDipilih = tahun || String(daftarTahun[0] || '')
  const memuat = !failed && (periodes === null || proposals === null)
  const semua = proposals || []

  // 1. Per periode
  const periodeTerpilih = (periodes || []).filter((p) => !periodeId || String(p.id) === periodeId)
  const isiPeriode = semua.filter((p) => periodeTerpilih.some((pe) => pe.id === p.periode?.id))
  // 2. Tahunan
  const periodeTahun = (periodes || []).filter((p) => String(p.tahun) === tahunDipilih)
  const isiTahun = semua.filter((p) => String(p.periode?.tahun) === tahunDipilih)
  // 3. Anggaran disetujui
  const isiAnggaran = semua.filter(
    (p) => p.status === 'disetujui' && (!anggaran.tahun || String(p.periode?.tahun) === anggaran.tahun) && (!anggaran.jenis || p.jenis === anggaran.jenis),
  )
  const total = agregat(semua)

  return (
    <div className="page space-y-6">
      <KepalaStatus
        judul="Cetak Laporan"
        crumbs={[{ label: 'Cetak Laporan' }]}
        desc="Cetak rekap kegiatan per periode, rekap tahunan, dan rekap anggaran disetujui sebagai PDF. Draft tidak dihitung."
        kartu={[
          { icon: CalendarRange, tone: TONE.navy, label: 'Periode', value: memuat ? '…' : (periodes || []).length },
          { icon: FileText, tone: TONE.navy, label: 'Proposal diajukan', value: memuat ? '…' : total.jumlah },
          { icon: Coins, tone: TONE.hijau, label: 'Anggaran disetujui', value: memuat ? '…' : rupiahRingkas(total.disetujui) },
        ]}
      />

      {failed ? (
        <div className="card px-6 py-12 text-center text-base text-red-600">Data rekap gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
      ) : memuat ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <KartuCetak
            icon={FolderOpen}
            judul="Rekap Kegiatan per Periode"
            desc="Jumlah proposal per status dan anggaran tiap periode, opsional dengan daftar proposalnya."
            ringkas={`${periodeTerpilih.length} periode · ${isiPeriode.length} proposal`}
            disabled={periodeTerpilih.length === 0}
            onCetak={() =>
              rekapPeriodePDF({
                periodes: periodeTerpilih,
                proposals: isiPeriode,
                denganDaftar,
                judulFile: periodeId ? `Rekap Kegiatan - ${periodeTerpilih[0]?.nama}` : 'Rekap Kegiatan per Periode',
              })
            }
          >
            <Pilih id="ck-periode" label="Periode" value={periodeId} onChange={setPeriodeId}>
              <option value="">Semua periode</option>
              {periodes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                  {p.tahun ? ` (${p.tahun})` : ''}
                  {p.isAktif ? ' — aktif' : ''}
                </option>
              ))}
            </Pilih>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 accent-navy-700" checked={denganDaftar} onChange={(e) => setDenganDaftar(e.target.checked)} />
              Sertakan daftar proposal tiap periode
            </label>
          </KartuCetak>

          <KartuCetak
            icon={CalendarRange}
            judul="Rekap Tahunan"
            desc="Rekap semua periode dalam satu tahun, total tahunan, dan rincian per jenis kegiatan."
            ringkas={`${periodeTahun.length} periode · ${isiTahun.length} proposal · disetujui ${rupiah(agregat(isiTahun).disetujui)}`}
            disabled={!tahunDipilih}
            onCetak={() => rekapTahunanPDF({ tahun: tahunDipilih, periodes: periodeTahun, proposals: isiTahun })}
          >
            <Pilih id="ck-tahun" label="Tahun" value={tahunDipilih} onChange={setTahun}>
              {daftarTahun.length === 0 ? <option value="">Belum ada tahun</option> : null}
              {daftarTahun.map((t) => (
                <option key={t} value={String(t)}>
                  {t}
                </option>
              ))}
            </Pilih>
          </KartuCetak>

          <KartuCetak
            icon={Coins}
            judul="Rekap Anggaran Disetujui"
            desc="Anggaran proposal yang disetujui per jenis dan per proposal, beserta realisasi dari laporan."
            ringkas={`${isiAnggaran.length} proposal · ${rupiah(agregat(isiAnggaran).disetujui)}`}
            onCetak={() =>
              rekapAnggaranPDF({
                keterangan: [anggaran.tahun ? `Tahun ${anggaran.tahun}` : 'Semua tahun', anggaran.jenis ? (anggaran.jenis === 'penelitian' ? 'Penelitian' : 'Pengabdian') : 'Semua jenis'].join(' · '),
                proposals: isiAnggaran,
              })
            }
          >
            <Pilih id="ck-ang-tahun" label="Tahun" value={anggaran.tahun} onChange={(v) => setAnggaran((a) => ({ ...a, tahun: v }))}>
              <option value="">Semua tahun</option>
              {daftarTahun.map((t) => (
                <option key={t} value={String(t)}>
                  {t}
                </option>
              ))}
            </Pilih>
            <Pilih id="ck-ang-jenis" label="Jenis kegiatan" value={anggaran.jenis} onChange={(v) => setAnggaran((a) => ({ ...a, jenis: v }))}>
              <option value="">Semua jenis</option>
              <option value="penelitian">Penelitian</option>
              <option value="pengabdian">Pengabdian</option>
            </Pilih>
          </KartuCetak>
        </div>
      )}
    </div>
  )
}
