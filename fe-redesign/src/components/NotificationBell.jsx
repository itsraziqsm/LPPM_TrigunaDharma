import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { notificationApi } from '../api/notification'

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
    if (diff < 60) return `${diff}d yang lalu`
    if (diff < 3600) return `${Math.floor(diff / 60)}m yang lalu`
    if (diff < 86400) return `${Math.floor(diff / 3600)}j yang lalu`
    return `${Math.floor(diff / 86400)} hari lalu`
}

const DROPDOWN_WIDTH = 320

export default function NotificationBell() {
    const [open, setOpen] = useState(false)
    const [notifications, setNotifications] = useState([])
    const [unread, setUnread] = useState(0)
    const [loading, setLoading] = useState(false)
    const [pos, setPos] = useState({ top: 0, left: 0 })

    const bellRef = useRef(null)
    const dropdownRef = useRef(null)

    const fetchNotifications = async () => {
        setLoading(true)
        try {
            const res = await notificationApi.getAll({ limit: 20 })
            const data = res.data.data || []
            setNotifications(data)
            setUnread(data.filter((n) => !n.isRead).length)
        } catch {
            // silent
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchNotifications()
        const interval = setInterval(fetchNotifications, 60_000)
        return () => clearInterval(interval)
    }, [])

    // Hitung posisi: selalu muncul di bawah bell, sejajarkan ke kanan bell,
    // tapi pastikan tidak keluar dari kanan/kiri layar
    useLayoutEffect(() => {
        if (!open || !bellRef.current) return
        const rect = bellRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth

        // Coba rata kanan bell, fallback ke kiri bell kalau mepet kanan layar
        let left = rect.right - DROPDOWN_WIDTH
        if (left < 8) left = rect.left  // kalau kiri terpotong, geser ke kanan bell
        if (left + DROPDOWN_WIDTH > viewportWidth - 8) left = viewportWidth - DROPDOWN_WIDTH - 8

        setPos({
            top: rect.bottom + window.scrollY + 8,
            left: left + window.scrollX,
        })
    }, [open])

    useEffect(() => {
        const handler = (e) => {
            if (
                bellRef.current && !bellRef.current.contains(e.target) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target)
            ) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleMarkRead = async (id) => {
        await notificationApi.markRead(id)
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
        setUnread((c) => Math.max(0, c - 1))
    }

    const handleMarkAllRead = async () => {
        await notificationApi.markAllRead()
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
        setUnread(0)
    }

    const handleDelete = async (id, e) => {
        e.stopPropagation()
        await notificationApi.delete(id)
        const removed = notifications.find((n) => n.id === id)
        setNotifications((prev) => prev.filter((n) => n.id !== id))
        if (removed && !removed.isRead) setUnread((c) => Math.max(0, c - 1))
    }

    const dropdown = open
        ? ReactDOM.createPortal(
            <div
                ref={dropdownRef}
                style={{
                    position: 'fixed',
                    top: pos.top - window.scrollY,
                    left: pos.left - window.scrollX,
                    width: DROPDOWN_WIDTH,
                    zIndex: 9999,
                }}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl"
            >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <span className="text-sm font-semibold text-navy-950">Notifikasi</span>
                    {unread > 0 && (
                        <button onClick={handleMarkAllRead} className="text-xs font-medium text-navy-700 hover:underline">
                            Tandai semua dibaca
                        </button>
                    )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {loading && notifications.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-400">Memuat...</p>
                    ) : notifications.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-400">Tidak ada notifikasi</p>
                    ) : (
                        notifications.map((n) => (
                            <div
                                key={n.id}
                                onClick={() => !n.isRead && handleMarkRead(n.id)}
                                className={`group flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3 transition-colors last:border-0 hover:bg-slate-50 ${!n.isRead ? 'bg-navy-50/70' : ''}`}
                            >
                                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${!n.isRead ? 'bg-navy-600' : 'bg-transparent'}`} />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-navy-950' : 'text-slate-700'}`}>
                                        {n.judul}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed line-clamp-2">{n.pesan}</p>
                                    <p className="mt-1 text-xs text-slate-400">{timeAgo(n.createdAt)}</p>
                                </div>
                                <button
                                    onClick={(e) => handleDelete(n.id, e)}
                                    className="shrink-0 hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                                    aria-label="Hapus notifikasi"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>,
            document.body
        )
        : null

    return (
        <>
            <button
                ref={bellRef}
                onClick={() => setOpen((v) => !v)}
                className="relative flex size-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Notifikasi"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-brass-400 px-1 text-[0.625rem] font-bold leading-none text-rail">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>
            {dropdown}
        </>
    )
}