import { useEffect, useState } from 'react'
import { Activity, LogIn, ShieldAlert } from 'lucide-react'
import { activityLogApi } from '../api/activityLog'
import KepalaStatus from '../components/KepalaStatus'
import KartuNavy from '../components/KartuNavy'
import PanelCari, { PilihanFilter } from '../components/PanelCari'
import AreaMemuat, { IndikatorMemuat } from '../components/AreaMemuat'
import { TONE } from '../utils/toneStatus'
import { KATEGORI_LOG, aksiTerbaca, kategoriDari } from '../utils/kategoriLog'

// ---------------------------------------------------------------------------
// Log Aktivitas (/log, Admin & Ketua LPPM; dari Beranda › Aktivitas sistem › "Lihat log lebih banyak").
// GET /activity-logs?page&limit=15[&kategori&search&dari&sampai] (W-53, new-api.md bagian 29.4) — semua
// filter di server, `meta.total` mengikuti filter. Kepala: GET /activity-logs/ringkasan (total mengikuti
// cari & tanggal; login & login gagal = hari ini, WIB). Kategori dari field `kategori` (utils/kategoriLog.js).
// ---------------------------------------------------------------------------

const LIMIT = 15
const waktu = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const tgl = (v) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

export default function LogAktivitasPage() {
  const [kategori, setKategori] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [page, setPage] = useState(1)
  const [cari, setCari] = useState('')
  const [cariAktif, setCariAktif] = useState('')
  const [data, setData] = useState({ rows: [], total: 0 })
  const [memuat, setMemuat] = useState(true)
  const [gagal, setGagal] = useState(false)
  const [ringkas, setRingkas] = useState(null)

  const tanggalSalah = Boolean(dari && sampai && dari > sampai)
  const filterTanggal = tanggalSalah ? {} : { ...(dari ? { dari } : {}), ...(sampai ? { sampai } : {}) }
  const kunciFilter = JSON.stringify([cariAktif, filterTanggal])

  // Kartu: ringkasan server (total mengikuti cari & tanggal; angka "hari ini" tidak terpengaruh filter).
  useEffect(() => {
    let alive = true
    const [search, tanggal] = JSON.parse(kunciFilter)
    activityLogApi
      .ringkasan({ ...(search ? { search } : {}), ...tanggal })
      .then((r) => alive && setRingkas(r.data.data || null))
      .catch(() => alive && setRingkas(false))
    return () => {
      alive = false
    }
  }, [kunciFilter])

  useEffect(() => {
    let alive = true
    const [search, tanggal] = JSON.parse(kunciFilter)
    setMemuat(true)
    activityLogApi
      .getAll({ page, limit: LIMIT, ...(kategori ? { kategori } : {}), ...(search ? { search } : {}), ...tanggal })
      .then((r) => {
        if (!alive) return
        setData({ rows: r.data.data || [], total: Number(r.data.meta?.total) || 0 })
        setGagal(false)
      })
      .catch(() => alive && setGagal(true))
      .finally(() => alive && setMemuat(false))
    return () => {
      alive = false
    }
  }, [kategori, page, kunciFilter])

  const pages = Math.max(1, Math.ceil(data.total / LIMIT))
  const rows = data.rows
  const labelKategori = KATEGORI_LOG.find((k) => k.key === kategori)?.label
  const ulang = (fn) => (v) => {
    fn(v)
    setPage(1)
  }
  const aktif = [
    ...(labelKategori ? [{ key: 'kategori', label: `Kategori: ${labelKategori}`, onRemove: () => ulang(setKategori)('') }] : []),
    ...(dari ? [{ key: 'dari', label: `Dari ${tgl(dari)}`, onRemove: () => ulang(setDari)('') }] : []),
    ...(sampai ? [{ key: 'sampai', label: `Sampai ${tgl(sampai)}`, onRemove: () => ulang(setSampai)('') }] : []),
    ...(cariAktif ? [{ key: 'cari', label: `Cari: "${cariAktif}"`, onRemove: () => (setCari(''), ulang(setCariAktif)('')) }] : []),
  ]
  const nilai = (v) => (ringkas === null ? '…' : ringkas === false ? '—' : (v ?? 0))

  return (
    <div className="page space-y-6">
      <KepalaStatus
        judul="Log Aktivitas"
        desc="Riwayat aktivitas pengguna di sistem: login, perubahan proposal, review, laporan, dokumen, dan lainnya."
        crumbs={[{ label: 'Log Aktivitas' }]}
        kartu={[
          { icon: Activity, tone: TONE.navy, label: cariAktif || dari || sampai ? 'Aktivitas sesuai filter' : 'Total aktivitas', value: nilai(ringkas?.total) },
          { icon: LogIn, tone: TONE.hijau, label: 'Login hari ini', value: nilai(ringkas?.loginHariIni) },
          { icon: ShieldAlert, tone: TONE.amber, label: 'Login gagal hari ini', value: nilai(ringkas?.loginGagalHariIni) },
        ]}
      />

      <hr className="pemisah" />

      <PanelCari
        id="log"
        value={cari}
        onChange={setCari}
        onSubmit={() => ulang(setCariAktif)(cari.trim())}
        placeholder="Cari nama, email, aksi, keterangan, atau alamat IP"
        aktif={aktif}
        onReset={() => {
          setKategori('')
          setDari('')
          setSampai('')
          setPage(1)
          setCari('')
          setCariAktif('')
        }}
      >
        <div className="space-y-3">
          <PilihanFilter
            label="Kategori"
            items={[['', 'Semua'], ...KATEGORI_LOG.map((k) => [k.key, k.label])]}
            value={kategori}
            onChange={ulang(setKategori)}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Rentang tanggal</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="log-dari">Dari tanggal</label>
              <input id="log-dari" type="date" className="input h-9 w-auto" value={dari} max={sampai || undefined} onChange={(e) => ulang(setDari)(e.target.value)} />
              <span className="text-sm text-slate-500">sampai</span>
              <label className="sr-only" htmlFor="log-sampai">Sampai tanggal</label>
              <input id="log-sampai" type="date" className="input h-9 w-auto" value={sampai} min={dari || undefined} onChange={(e) => ulang(setSampai)(e.target.value)} />
            </div>
            {tanggalSalah ? <p className="mt-1.5 text-xs text-red-700">Tanggal awal tidak boleh setelah tanggal akhir.</p> : null}
          </fieldset>
        </div>
      </PanelCari>

      <KartuNavy
        id="daftar-log"
        judul="Daftar Aktivitas"
        desc="Terbaru di atas, 15 per halaman."
        badge={memuat && data.rows.length ? <IndikatorMemuat className="text-white" /> : `${data.total} log`}
        bodyClassName="p-0"
      >
        {gagal ? (
          <p className="px-6 py-12 text-center text-base text-red-600">Log aktivitas gagal dimuat. Muat ulang halaman untuk mencoba lagi.</p>
        ) : memuat && data.rows.length === 0 ? (
          <p className="flex items-center justify-center gap-3 px-6 py-12 text-base text-slate-500">
            <span className="spinner text-navy-600" aria-hidden="true" />
            Memuat log…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-base text-slate-500">{aktif.length ? 'Tidak ada log yang cocok dengan filter.' : 'Belum ada aktivitas tercatat.'}</p>
        ) : (
          <AreaMemuat memuat={memuat}>
            <div className="overflow-x-auto">
              <table className="table table-tight w-full">
                <thead>
                  <tr>
                    <th className="w-40">Waktu</th>
                    <th>Pengguna</th>
                    <th className="w-36">Kategori</th>
                    <th>Aksi & keterangan</th>
                    <th className="w-32 max-lg:hidden">Alamat IP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap text-sm tabular-nums text-slate-600">{waktu(l.createdAt)}</td>
                      <td>
                        <span className="block font-medium text-slate-900">{l.user?.name || 'Sistem'}</span>
                        {l.user?.email ? <span className="block text-xs text-slate-500">{l.user.email}</span> : null}
                      </td>
                      <td>
                        <span className={`badge ${l.action === 'LOGIN_GAGAL' ? 'badge-danger' : 'badge-neutral'}`}>{kategoriDari(l).label}</span>
                      </td>
                      <td>
                        <span className="block text-sm font-medium text-slate-800">{aksiTerbaca(l.action)}</span>
                        {l.detail ? <span className="block text-sm text-slate-500">{l.detail}</span> : null}
                        {l.proposal?.judul ? <span className="block text-xs text-slate-400">Proposal: {l.proposal.judul}</span> : null}
                      </td>
                      <td className="text-xs tabular-nums text-slate-500 max-lg:hidden">{l.ipAddress || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AreaMemuat>
        )}
        {pages > 1 && !gagal ? (
          <nav aria-label="Halaman" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span className="tabular-nums">
              Halaman {page} dari {pages} · {data.total} log
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1 || memuat} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages || memuat} onClick={() => setPage(page + 1)}>
                Berikutnya
              </button>
            </span>
          </nav>
        ) : null}
      </KartuNavy>
    </div>
  )
}
