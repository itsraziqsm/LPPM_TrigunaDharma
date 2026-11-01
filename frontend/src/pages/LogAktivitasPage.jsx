import { useEffect, useMemo, useState } from 'react'
import { Activity, LogIn, FileText } from 'lucide-react'
import { activityLogApi } from '../api/activityLog'
import KepalaStatus from '../components/KepalaStatus'
import KartuNavy from '../components/KartuNavy'
import PanelCari, { PilihanFilter } from '../components/PanelCari'
import AreaMemuat, { IndikatorMemuat } from '../components/AreaMemuat'
import ApiPending from '../components/ApiPending'
import { TONE } from '../utils/toneStatus'
import { KATEGORI_LOG, aksiTerbaca, kategoriDari } from '../utils/kategoriLog'

// ---------------------------------------------------------------------------
// Log Aktivitas (/log, Admin & Ketua LPPM; dari Beranda › Aktivitas sistem › "Lihat log lebih banyak").
// GET /activity-logs?page&limit=15[&action] — 15 per halaman. Kepala KepalaStatus (3 kartu: total aktivitas,
// login tercatat, aktivitas proposal = meta.total dengan limit=1). Filter Kategori dipetakan ke awalan
// `action` (utils/kategoriLog.js) karena backend belum punya kategori; kolom cari hanya menyaring halaman
// yang sedang tampil (API belum punya pencarian teks) — keduanya W-53.
// ---------------------------------------------------------------------------

const LIMIT = 15
const waktu = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function LogAktivitasPage() {
  const [kategori, setKategori] = useState('')
  const [page, setPage] = useState(1)
  const [cari, setCari] = useState('')
  const [cariAktif, setCariAktif] = useState('')
  const [data, setData] = useState({ rows: [], total: 0 })
  const [memuat, setMemuat] = useState(true)
  const [gagal, setGagal] = useState(false)
  const [ringkas, setRingkas] = useState({ total: null, login: null, proposal: null })

  // Kartu ringkasan: total per kategori lewat meta.total (limit=1).
  useEffect(() => {
    let alive = true
    const hitung = (params) =>
      activityLogApi
        .getAll({ page: 1, limit: 1, ...params })
        .then((r) => Number(r.data.meta?.total) || 0)
        .catch(() => null)
    Promise.all([hitung({}), hitung({ action: 'LOGIN' }), hitung({ action: 'proposal.' })]).then(([total, login, proposal]) => {
      if (alive) setRingkas({ total, login, proposal })
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    const k = KATEGORI_LOG.find((x) => x.key === kategori)
    setMemuat(true)
    activityLogApi
      .getAll({ page, limit: LIMIT, ...(k ? { action: k.cari } : {}) })
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
  }, [kategori, page])

  const pages = Math.max(1, Math.ceil(data.total / LIMIT))
  const q = cariAktif.trim().toLowerCase()
  const rows = useMemo(
    () =>
      q
        ? data.rows.filter((l) =>
            [l.user?.name, l.user?.email, l.action, l.detail, l.ipAddress].some((v) => String(v || '').toLowerCase().includes(q)),
          )
        : data.rows,
    [data.rows, q],
  )
  const labelKategori = KATEGORI_LOG.find((k) => k.key === kategori)?.label
  const aktif = [
    ...(labelKategori ? [{ key: 'kategori', label: `Kategori: ${labelKategori}`, onRemove: () => (setKategori(''), setPage(1)) }] : []),
    ...(cariAktif ? [{ key: 'cari', label: `Cari: "${cariAktif}"`, onRemove: () => (setCari(''), setCariAktif('')) }] : []),
  ]

  return (
    <div className="page space-y-6">
      <KepalaStatus
        judul="Log Aktivitas"
        desc="Riwayat aktivitas pengguna di sistem: login, perubahan proposal, review, laporan, dokumen, dan lainnya."
        crumbs={[{ label: 'Log Aktivitas' }]}
        kartu={[
          { icon: Activity, tone: TONE.navy, label: 'Total aktivitas', value: ringkas.total ?? '…' },
          { icon: LogIn, tone: TONE.hijau, label: 'Login tercatat', value: ringkas.login ?? '…' },
          { icon: FileText, tone: TONE.amber, label: 'Aktivitas proposal', value: ringkas.proposal ?? '…' },
        ]}
      />

      <hr className="pemisah" />

      <PanelCari
        id="log"
        value={cari}
        onChange={setCari}
        onSubmit={() => setCariAktif(cari)}
        placeholder="Cari nama, email, aksi, atau keterangan (di halaman ini)"
        aktif={aktif}
        onReset={() => {
          setKategori('')
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
            onChange={(v) => {
              setKategori(v)
              setPage(1)
            }}
          />
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Kategori sementara diturunkan dari jenis aksi; pencarian hanya di halaman yang tampil. <ApiPending />
          </p>
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
          <p className="px-6 py-12 text-center text-base text-slate-500">{data.rows.length ? 'Tidak ada log yang cocok di halaman ini.' : 'Belum ada aktivitas tercatat.'}</p>
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
                        <span className="badge badge-neutral">{kategoriDari(l.action).label}</span>
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
