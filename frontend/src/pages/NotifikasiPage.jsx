import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BellOff, CheckCheck, ChevronRight, Trash2 } from 'lucide-react'
import { notificationApi } from '../api/notification'
import useAuthStore from '../store/authStore'
import { NOTIF_EVENT, notifyNotificationsChanged } from '../utils/notificationEvents'
import { daysSince, formatDate, timeAgo } from './dashboard/format'
import { DEFAULT_META, TYPE_META, getRoleNames, targetFor } from '../utils/notifikasi'

// ---------------------------------------------------------------------------
// Halaman Notifikasi (/notifikasi), dibuka dari "Lihat semua notifikasi" di
// (judul / "Lihat detail" → halaman detail /notifikasi/:id, NotifikasiDetailPage)
// dropdown lonceng. Data: GET /notifications (page, limit, onlyUnread) +
// PATCH /:id/read, PATCH /read-all, DELETE /:id. Perubahan di halaman ini
// dan di lonceng saling diberitahukan lewat utils/notificationEvents.
// ---------------------------------------------------------------------------

const LIMIT = 20

function groupLabel(value) {
  const days = daysSince(value)
  if (days === null) return 'Lainnya'
  if (days === 0) return 'Hari ini'
  if (days === 1) return 'Kemarin'
  if (days < 7) return 'Minggu ini'
  return 'Lebih lama'
}

function FilterTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${
        active ? 'border-navy-800 text-navy-950' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-navy-900'
      }`}
    >
      {children}
    </button>
  )
}

export default function NotifikasiPage() {
  const user = useAuthStore((s) => s.user)
  const roles = getRoleNames(user?.roles)

  const [filter, setFilter] = useState('semua')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [unreadTotal, setUnreadTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busyAll, setBusyAll] = useState(false)
  const [tick, setTick] = useState(0)

  const onlyUnread = filter === 'belum'

  const loadUnreadTotal = useCallback(() => {
    notificationApi
      .getAll({ onlyUnread: true, limit: 1 })
      .then((r) => setUnreadTotal(Number(r.data.meta?.total) || 0))
      .catch(() => setUnreadTotal(null))
  }, [])

  // Muat halaman pertama (ulang saat filter berubah atau ada perubahan dari lonceng).
  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    notificationApi
      .getAll({ page: 1, limit: LIMIT, ...(onlyUnread ? { onlyUnread: true } : {}) })
      .then((r) => {
        if (!alive) return
        setItems(r.data.data || [])
        setTotal(Number(r.data.meta?.total) || 0)
        setPage(1)
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false))
    loadUnreadTotal()
    return () => {
      alive = false
    }
  }, [onlyUnread, tick, loadUnreadTotal])

  useEffect(() => {
    const onChange = (e) => {
      if (e.detail?.source !== 'page') setTick((t) => t + 1)
    }
    window.addEventListener(NOTIF_EVENT, onChange)
    return () => window.removeEventListener(NOTIF_EVENT, onChange)
  }, [])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const next = page + 1
      const r = await notificationApi.getAll({ page: next, limit: LIMIT, ...(onlyUnread ? { onlyUnread: true } : {}) })
      const seen = new Set(items.map((n) => n.id))
      setItems((prev) => [...prev, ...(r.data.data || []).filter((n) => !seen.has(n.id))])
      setTotal(Number(r.data.meta?.total) || 0)
      setPage(next)
    } catch {
      setFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }

  const markRead = async (n) => {
    if (n.isRead) return
    try {
      await notificationApi.markRead(n.id)
      if (onlyUnread) {
        setItems((prev) => prev.filter((x) => x.id !== n.id))
        setTotal((t) => Math.max(0, t - 1))
      } else {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
      }
      setUnreadTotal((c) => (c === null ? c : Math.max(0, c - 1)))
      notifyNotificationsChanged('page')
    } catch {
      /* biarkan; status tetap belum dibaca */
    }
  }

  const remove = async (n) => {
    try {
      await notificationApi.delete(n.id)
      setItems((prev) => prev.filter((x) => x.id !== n.id))
      setTotal((t) => Math.max(0, t - 1))
      if (!n.isRead) setUnreadTotal((c) => (c === null ? c : Math.max(0, c - 1)))
      notifyNotificationsChanged('page')
    } catch {
      /* abaikan */
    }
  }

  const markAll = async () => {
    setBusyAll(true)
    try {
      await notificationApi.markAllRead()
      setUnreadTotal(0)
      if (onlyUnread) {
        setItems([])
        setTotal(0)
      } else {
        setItems((prev) => prev.map((x) => ({ ...x, isRead: true })))
      }
      notifyNotificationsChanged('page')
    } finally {
      setBusyAll(false)
    }
  }

  // Kelompokkan per rentang waktu (data sudah urut terbaru dulu).
  const groups = []
  items.forEach((n) => {
    const label = groupLabel(n.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(n)
    else groups.push({ label, items: [n] })
  })

  return (
    <div className="page rise space-y-6">
      <header className="space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">Notifikasi</li>
          </ol>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">Notifikasi</h1>
            <p className="page-desc">
              {unreadTotal === null
                ? 'Kabar terbaru tentang proposal, review, laporan, dan periode.'
                : unreadTotal > 0
                  ? `${unreadTotal} notifikasi belum dibaca.`
                  : 'Semua notifikasi sudah dibaca.'}
            </p>
          </div>
          <button
            type="button"
            onClick={markAll}
            disabled={busyAll || !unreadTotal}
            className="btn btn-secondary shrink-0"
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            Tandai semua dibaca
          </button>
        </div>
      </header>

      <div role="tablist" aria-label="Filter notifikasi" className="flex gap-7 border-b border-slate-200">
        <FilterTab active={filter === 'semua'} onClick={() => setFilter('semua')}>
          Semua
        </FilterTab>
        <FilterTab active={filter === 'belum'} onClick={() => setFilter('belum')}>
          Belum dibaca
          {unreadTotal ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brass-400 px-1.5 py-0.5 text-[11px] font-bold leading-none text-navy-950">
              {unreadTotal}
            </span>
          ) : null}
        </FilterTab>
      </div>

      {loading ? (
        <div className="card divide-y divide-slate-100" aria-busy="true">
          <p role="status" className="sr-only">Memuat notifikasi</p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse gap-4 px-6 py-5" aria-hidden="true">
              <div className="size-10 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 rounded bg-slate-100" />
                <div className="h-3 w-3/4 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : failed && items.length === 0 ? (
        <section className="card px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-navy-950">Notifikasi belum dapat dimuat</h2>
          <p className="mt-1.5 text-base text-slate-500">Periksa koneksi Anda, lalu coba lagi.</p>
          <button type="button" onClick={() => setTick((t) => t + 1)} className="btn btn-primary mt-5">
            Coba lagi
          </button>
        </section>
      ) : items.length === 0 ? (
        <section className="card px-6 py-14 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-navy-50 text-navy-700">
            <BellOff className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-navy-950">
            {onlyUnread ? 'Tidak ada notifikasi belum dibaca' : 'Belum ada notifikasi'}
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-base text-slate-500">
            Kabar tentang proposal, review, laporan, dan periode akan muncul di sini.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-2 text-sm font-semibold text-slate-500">{group.label}</h2>
              <ul className="card divide-y divide-slate-100 overflow-hidden">
                {group.items.map((n) => {
                  const meta = TYPE_META[n.type] || DEFAULT_META
                  const Icon = meta.icon
                  const target = targetFor(n, roles)
                  return (
                    <li
                      key={n.id}
                      className={`group flex gap-4 px-5 py-4 sm:px-6 ${n.isRead ? '' : 'bg-navy-50/50'}`}
                    >
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${meta.tone}`}>
                        <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          {!n.isRead ? (
                            <span className="mt-2 size-2 shrink-0 rounded-full bg-navy-600" aria-hidden="true" />
                          ) : null}
                          <h3 className={`break-words text-base leading-snug ${n.isRead ? 'text-slate-700' : 'font-semibold text-navy-950'}`}>
                            <Link to={`/notifikasi/${n.id}`} state={{ notif: n }} className="hover:text-navy-700 hover:underline">
                              {!n.isRead ? <span className="sr-only">Belum dibaca: </span> : null}
                              {n.judul}
                            </Link>
                          </h3>
                        </div>
                        <p className="mt-0.5 break-words text-sm leading-relaxed text-slate-600">{n.pesan}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                          <time dateTime={n.createdAt} title={formatDate(n.createdAt, { dateStyle: 'full' })} className="text-slate-500">
                            {timeAgo(n.createdAt)}
                          </time>
                          <Link
                            to={`/notifikasi/${n.id}`}
                            state={{ notif: n }}
                            className="inline-flex items-center gap-0.5 font-semibold text-navy-700 hover:text-navy-900"
                          >
                            Lihat detail
                            <ChevronRight className="size-3.5" aria-hidden="true" />
                          </Link>
                          {target ? (
                            <Link
                              to={target.to}
                              onClick={() => markRead(n)}
                              className="inline-flex items-center gap-1 font-semibold text-navy-700 hover:text-navy-900"
                            >
                              {target.label}
                              <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            </Link>
                          ) : null}
                          {!n.isRead ? (
                            <button type="button" onClick={() => markRead(n)} className="font-semibold text-slate-600 hover:text-navy-900">
                              Tandai dibaca
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(n)}
                        aria-label={`Hapus notifikasi: ${n.judul}`}
                        title="Hapus"
                        className="icon-btn shrink-0 self-start opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {items.length < total ? (
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={loadMore} disabled={loadingMore} className="btn btn-secondary">
                {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
              </button>
              <p className="text-xs text-slate-500 tabular-nums">
                Menampilkan {items.length} dari {total}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
