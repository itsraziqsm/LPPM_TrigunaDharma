import { useCallback, useEffect, useState } from 'react'
import Breadcrumb from '../components/Breadcrumb'
import { CalendarClock, DatabaseBackup, Download, RefreshCw, Trash2 } from 'lucide-react'
import { backupApi } from '../api/backup'
import { alertDialog, confirmDialog } from '../utils/dialog'

// ---------------------------------------------------------------------------
// Backup Data (admin, /backup) — backend_go/new-api.md bagian 19.
//   1. Backup sekarang: POST /backup (202, latar) lalu pantau GET /backup/:id
//      tiap 1,5 detik sampai selesai; 409 bila ada backup lain berjalan.
//      Info jadwal otomatis dari GET /backup/jadwal.
//   2. Daftar Backup: GET /backup (paginasi, filter sumber) dengan kolom
//      "Dilakukan oleh" (sistem / nama admin), unduh .sql.gz & hapus file.
// ---------------------------------------------------------------------------

const LIMIT = 10
const POLL_MS = 1500

const STATUS = {
  berjalan: { label: 'Berjalan', cls: 'badge-review' },
  berhasil: { label: 'Berhasil', cls: 'badge-success' },
  gagal: { label: 'Gagal', cls: 'badge-danger' },
  dihapus: { label: 'Dihapus', cls: 'badge-neutral' },
}

const waktu = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function ukuran(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const durasi = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms} md` : `${(ms / 1000).toFixed(1)} dtk`)
const nama = (u) => u?.fullName || u?.name || u?.email || 'Admin'

function errorText(e, fallback) {
  return e.response?.data?.message || fallback
}

// Pesan galat dari respons blob (unduh) perlu dibaca sebagai teks JSON.
async function blobErrorText(e, fallback) {
  try {
    const text = await e.response?.data?.text?.()
    return JSON.parse(text).message || fallback
  } catch {
    return fallback
  }
}

function Penulis({ log }) {
  if (log.sumber === 'sistem') {
    return (
      <span>
        <span className="font-medium text-slate-900">Sistem</span>
        <span className="block text-xs text-slate-500">Otomatis{log.periode ? ` · jadwal ${log.periode}` : ''}</span>
      </span>
    )
  }
  return (
    <span>
      <span className="font-medium text-slate-900">{nama(log.dibuatOleh)}</span>
      <span className="block text-xs text-slate-500">Manual oleh admin</span>
    </span>
  )
}

export default function BackupPage() {
  const [jadwal, setJadwal] = useState(null)
  const [jadwalFailed, setJadwalFailed] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sumber, setSumber] = useState('')
  const [status, setStatus] = useState('') // berjalan|berhasil|gagal; "dihapus" menunggu API (W-43)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const [running, setRunning] = useState(null) // log backup manual yang sedang dipantau
  const [hasil, setHasil] = useState(null) // { tone, text }
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    backupApi
      .getJadwal()
      .then((r) => alive && setJadwal(r.data.data))
      .catch(() => alive && setJadwalFailed(true))
    return () => {
      alive = false
    }
  }, [tick])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    backupApi
      .getAll({ page, limit: LIMIT, ...(sumber ? { sumber } : {}), ...(status ? { status } : {}) })
      .then((r) => {
        if (!alive) return
        setRows(r.data.data || [])
        setTotal(Number(r.data.meta?.total) || 0)
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [page, sumber, status, tick])

  // Pantau backup manual yang sedang berjalan (GET /backup/:id tiap 1,5 detik).
  const runningId = running?.id
  useEffect(() => {
    if (!runningId) return undefined
    let alive = true
    let timer
    const cek = async () => {
      try {
        const log = (await backupApi.getById(runningId)).data.data
        if (!alive) return
        if (log.status === 'berjalan') {
          timer = setTimeout(cek, POLL_MS)
          return
        }
        setRunning(null)
        setHasil(
          log.status === 'berhasil'
            ? { tone: 'success', text: `Backup selesai: ${log.namaFile} (${ukuran(log.ukuran)}, ${log.jumlahTabel} tabel, ${log.jumlahBaris} baris).` }
            : { tone: 'error', text: `Backup gagal: ${log.pesanError || 'tanpa keterangan'}.` },
        )
        refresh()
      } catch {
        // Jaringan terputus sesaat: coba lagi.
        if (alive) timer = setTimeout(cek, POLL_MS)
      }
    }
    timer = setTimeout(cek, POLL_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [runningId, refresh])

  const backupSekarang = async () => {
    const ok = await confirmDialog({
      tone: 'primary',
      title: 'Backup database sekarang?',
      message: 'Seluruh database (struktur, data, dan file) akan dicadangkan ke server. Proses berjalan di latar dan biasanya selesai dalam beberapa detik.',
      confirmText: 'Mulai backup',
    })
    if (!ok) return
    setHasil(null)
    try {
      const r = await backupApi.create()
      const log = r.data.data
      setRunning(log)
      setPage(1)
      setSumber('')
      refresh()
    } catch (e) {
      alertDialog({ title: 'Backup tidak dapat dimulai', message: errorText(e, 'Coba lagi beberapa saat lagi.') })
    }
  }

  const unduh = async (log) => {
    setBusyId(log.id)
    try {
      const r = await backupApi.download(log.id)
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = log.namaFile || `backup-${log.id}.sql.gz`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      alertDialog({ title: 'Gagal mengunduh backup', message: await blobErrorText(e, 'File backup tidak dapat diunduh.') })
      refresh()
    } finally {
      setBusyId(null)
    }
  }

  const hapus = async (log) => {
    const ok = await confirmDialog({
      tone: 'danger',
      title: 'Hapus file backup?',
      message: `File ${log.namaFile} akan dihapus dari server dan tidak dapat dipulihkan. Catatan di daftar backup tetap disimpan.`,
      confirmText: 'Hapus file',
    })
    if (!ok) return
    setBusyId(log.id)
    try {
      await backupApi.remove(log.id)
      refresh()
    } catch (e) {
      alertDialog({ title: 'Gagal menghapus file backup', message: errorText(e, 'Coba lagi.') })
    } finally {
      setBusyId(null)
    }
  }

  const pages = Math.max(1, Math.ceil(total / LIMIT))
  const sedangBerjalan = Boolean(running) || Boolean(jadwal?.sedangBerjalan)

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Backup Data</h1>
          <p className="page-desc">Cadangkan seluruh database sistem, unduh file backup, dan pantau riwayatnya.</p>
        </div>
        <Breadcrumb items={[{ label: 'Backup Data' }]} />
      </header>

      {/* ── Backup sekarang ─────────────────────────────────────────────── */}
      <section aria-labelledby="backup-sekarang" className="card flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-800 text-white">
            <DatabaseBackup className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="backup-sekarang" className="text-lg font-semibold text-navy-950">
              Backup sekarang
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Mencadangkan struktur, data, dan file ke server (.sql.gz). Hanya satu backup dapat berjalan dalam satu waktu.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <CalendarClock className="size-4 text-slate-400" aria-hidden="true" />
              {jadwal ? (
                jadwal.otomatisAktif ? (
                  <>
                    <span>Otomatis: {jadwal.keterangan}</span>
                    <span className="text-slate-400">·</span>
                    <span>Berikutnya {waktu(jadwal.berikutnyaAt)}</span>
                    {jadwal.terakhirOtomatis ? (
                      <>
                        <span className="text-slate-400">·</span>
                        <span>Terakhir {waktu(jadwal.terakhirOtomatis.mulaiAt)} ({STATUS[jadwal.terakhirOtomatis.status]?.label.toLowerCase() || jadwal.terakhirOtomatis.status})</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span>Backup otomatis dimatikan di server.</span>
                )
              ) : jadwalFailed ? (
                <span>Info jadwal tidak dapat dimuat.</span>
              ) : (
                <span>Memuat jadwal…</span>
              )}
            </p>
          </div>
        </div>
        <button type="button" onClick={backupSekarang} disabled={sedangBerjalan} className="btn btn-primary shrink-0">
          {sedangBerjalan ? <span className="spinner" aria-hidden="true" /> : <DatabaseBackup className="size-4" aria-hidden="true" />}
          {sedangBerjalan ? 'Backup berjalan…' : 'Backup sekarang'}
        </button>
      </section>

      {running ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-navy-200 bg-navy-50 px-4 py-3 text-sm text-navy-800">
          <span className="spinner" aria-hidden="true" />
          Backup sedang berjalan sejak {waktu(running.mulaiAt)}. Halaman ini akan memperbarui otomatis.
        </p>
      ) : null}
      {hasil ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            hasil.tone === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {hasil.text}
        </p>
      ) : null}

      {/* ── Daftar Backup ───────────────────────────────────────────────── */}
      <section aria-labelledby="daftar-backup" className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="daftar-backup" className="text-lg font-semibold text-navy-950">
              Daftar Backup
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{total} backup tercatat, terbaru di atas.</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="backup-sumber" className="sr-only">
              Dilakukan oleh
            </label>
            <select
              id="backup-sumber"
              className="input w-44"
              value={sumber}
              onChange={(e) => {
                setSumber(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Semua pelaku</option>
              <option value="sistem">Sistem (otomatis)</option>
              <option value="admin">Admin (manual)</option>
            </select>
            <label htmlFor="backup-status" className="sr-only">
              Status
            </label>
            <select
              id="backup-status"
              className="input w-44"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">Semua status</option>
              <option value="berjalan">Berjalan</option>
              <option value="berhasil">Berhasil</option>
              <option value="gagal">Gagal</option>
              {/* W-43: backend belum bisa menyaring backup yang filenya dihapus */}
              <option value="dihapus" disabled>
                Dihapus (API belum ada)
              </option>
            </select>
            <button type="button" onClick={refresh} className="btn btn-ghost btn-sm" title="Muat ulang">
              <RefreshCw className="size-4" aria-hidden="true" />
              <span className="sr-only">Muat ulang</span>
            </button>
          </div>
        </header>

        <div className="table-wrap rounded-none border-0">
          <table className="table table-tight min-w-[880px]">
            <thead>
              <tr>
                <th scope="col" className="pl-6">Waktu</th>
                <th scope="col">Dilakukan oleh</th>
                <th scope="col">Status</th>
                <th scope="col">File</th>
                <th scope="col">Isi</th>
                <th scope="col">Durasi</th>
                <th scope="col" className="pr-6 text-right">
                  Tindakan
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr aria-hidden="true">
                  <td colSpan={7} className="pl-6">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ) : failed ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center">
                    <p className="text-slate-600">Daftar backup gagal dimuat.</p>
                    <button type="button" onClick={refresh} className="btn btn-secondary btn-sm mt-3">
                      Coba lagi
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Belum ada backup{sumber || status ? ' yang cocok dengan filter' : ''}.
                  </td>
                </tr>
              ) : (
                rows.map((log) => {
                  // Backup berhasil yang filenya sudah dihapus (dihapusAt) tampil berstatus "Dihapus".
                  const st = log.dihapusAt ? STATUS.dihapus : STATUS[log.status] || { label: log.status, cls: 'badge-neutral' }
                  return (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap pl-6 tabular-nums">{waktu(log.mulaiAt)}</td>
                      <td>
                        <Penulis log={log} />
                      </td>
                      <td>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                        {log.status === 'gagal' && log.pesanError ? (
                          <span className="mt-1 block max-w-[14rem] text-xs text-red-700">{log.pesanError}</span>
                        ) : null}
                        {log.dihapusAt ? (
                          <span className="mt-1 block max-w-[14rem] text-xs text-slate-500">
                            {waktu(log.dihapusAt)}
                            {log.dihapusOleh ? ` oleh ${nama(log.dihapusOleh)}` : ''}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[16rem]">
                        {log.namaFile ? (
                          <span className={`block truncate font-mono text-xs ${log.dihapusAt ? 'text-slate-400 line-through' : 'text-slate-700'}`} title={log.namaFile}>
                            {log.namaFile}
                          </span>
                        ) : (
                          '—'
                        )}
                        {log.dihapusAt ? (
                          <span className="mt-0.5 block text-xs text-slate-500">File tidak tersedia lagi</span>
                        ) : log.ukuran != null ? (
                          <span className="mt-0.5 block text-xs text-slate-500">{ukuran(log.ukuran)}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap text-sm text-slate-600">
                        {log.jumlahTabel != null ? `${log.jumlahTabel} tabel · ${Number(log.jumlahBaris || 0).toLocaleString('id-ID')} baris` : '—'}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{durasi(log.durasiMs)}</td>
                      <td className="pr-6">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => unduh(log)}
                            disabled={!log.fileTersedia || busyId === log.id}
                            className="btn btn-ghost btn-sm"
                          >
                            <Download className="size-4" aria-hidden="true" />
                            Unduh
                          </button>
                          <button
                            type="button"
                            onClick={() => hapus(log)}
                            disabled={!log.fileTersedia || busyId === log.id}
                            className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && total > LIMIT ? (
          <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 text-sm text-slate-600">
            <span className="tabular-nums">
              Halaman {page} dari {pages}
            </span>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Berikutnya
              </button>
            </span>
          </footer>
        ) : null}
      </section>

      <p className="text-xs text-slate-500">
        Memulihkan backup dilakukan di server oleh pengelola sistem (lihat dokumentasi backend), bukan dari halaman ini.
      </p>
    </div>
  )
}
