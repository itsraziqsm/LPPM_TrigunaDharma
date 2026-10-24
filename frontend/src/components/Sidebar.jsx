import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import { proposalDosenApi } from '../api/Proposaldosen'
import NotificationBell from './NotificationBell'

const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
  dosen: 'Dosen',
  reviewer: 'Reviewer',
  mahasiswa: 'Mahasiswa',
}

const NAV_ITEMS = [
  {
    path: '/dashboard', label: 'Dashboard', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  },
]

const ADMIN_NAV_ITEMS = [
  {
    path: '/periode', label: 'Periode', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  },
  {
    path: '/users', label: 'User', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
  // ← BARU: Menu Export Laporan
  {
    path: '/export', label: 'Export Laporan', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
]

const DOSEN_NAV_ITEMS = [
  // Grup bertingkat: dirender oleh NavGroup (buka-tutup, otomatis terbuka
  // bila salah satu anaknya aktif).
  {
    path: '/kegiatan', label: 'Kegiatan', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4" />
      </svg>
    ),
    children: [
      { path: '/kegiatan/penelitian', label: 'Penelitian' },
      { path: '/kegiatan/pengabdian', label: 'Pengabdian' },
    ],
  },
  {
    path: '/proposal-saya', label: 'Proposal Saya', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    path: '/undangan', label: 'Undangan Tim', badge: true, icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

const MAHASISWA_NAV_ITEMS = [
  {
    path: '/undangan', label: 'Undangan Tim', badge: true, icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    path: '/laporan-harian', label: 'Laporan Harian', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    )
  },
]

const REVIEWER_NAV_ITEMS = [
  {
    path: '/penugasan', label: 'Penugasan Review', icon: (
      <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
]

function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map(r => r.role?.name || r.name || '')
}

const navLinkClass = ({ isActive }) =>
  `relative flex h-10 items-center gap-3 rounded-lg px-3 text-[0.8125rem] font-medium transition-colors ${
    isActive
      ? 'bg-white/10 text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brass-400'
      : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
  }`

function NavGroup({ item, onNavigate }) {
  const { pathname } = useLocation()
  const childActive = item.children.some((c) => pathname.startsWith(c.path))
  // Pilihan manual berlaku di halaman tempat ia dibuat; saat pindah halaman
  // grup otomatis terbuka bila anaknya aktif (Sidebar tidak dipasang ulang
  // antar-route karena DashboardLayout tetap komponen yang sama).
  const [manual, setManual] = useState({ path: null, open: false })
  const expanded = manual.path === pathname ? manual.open : childActive || manual.open
  const listId = `nav-group-${item.label.toLowerCase()}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setManual({ path: pathname, open: !expanded })}
        aria-expanded={expanded}
        aria-controls={listId}
        className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[0.8125rem] font-medium transition-colors ${
          childActive ? 'text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
        }`}
      >
        <span className="shrink-0">{item.icon}</span>
        <span className="flex-1 truncate text-left">{item.label}</span>
        <svg
          className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {expanded ? (
        <div id={listId} className="ml-[1.3rem] flex flex-col gap-0.5 border-l border-white/10 py-0.5 pl-2">
          {item.children.map((child) => (
            <NavLink key={child.path} to={child.path} onClick={onNavigate} className={navLinkClass}>
              <span className="flex-1 truncate">{child.label}</span>
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// Dipanggil dari UndanganPage setelah user respond, agar badge langsung update
export function refreshInvitationBadge() {
  window.dispatchEvent(new CustomEvent('invitation-badge-refresh'))
}

// ─── Rail navigasi ───────────────────────────────────────────────────────────
// Desktop : rail navy tetap di kiri (lebar 16rem).
// Mobile  : bilah atas + drawer yang digeser dari kiri.
// Lonceng notifikasi hanya dirender SEKALI (posisi fixed) agar tidak ada
// request ganda: di bilah atas pada mobile, di header rail pada desktop.
// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [pendingCount, setPendingCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  const roleNames = getRoleNames(user?.roles)
  const primaryRole = roleNames[0] || 'user'
  const isAdminOrKetua = primaryRole === 'admin' || primaryRole === 'ketua_lppm'
  const isMahasiswa = primaryRole === 'mahasiswa'
  const isDosen = primaryRole === 'dosen'
  const isDosenOrMahasiswa = isDosen || isMahasiswa
  const isReviewer = roleNames.includes('reviewer') || user?.hasTugasan === true

  useEffect(() => {
    if (!isDosenOrMahasiswa) return

    const fetchCount = () => {
      proposalDosenApi.getMyInvitations()
        .then(res => {
          const count = (res.data.data || []).filter(i => i.statusUndangan === 'pending').length
          setPendingCount(count)
        })
        .catch(() => { })
    }

    fetchCount()

    window.addEventListener('invitation-badge-refresh', fetchCount)
    return () => window.removeEventListener('invitation-badge-refresh', fetchCount)
  }, [isDosenOrMahasiswa])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const allNavItems = [
    ...NAV_ITEMS,
    ...(isAdminOrKetua ? ADMIN_NAV_ITEMS : []),
    ...(isDosen ? DOSEN_NAV_ITEMS : []),
    ...(isMahasiswa ? MAHASISWA_NAV_ITEMS : []),
    ...(isReviewer ? REVIEWER_NAV_ITEMS : []),
  ]

  return (
    <>
      {/* ── Bilah atas (hanya layar kecil) ─────────────────────────────── */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-1 border-b border-white/10 bg-rail pl-2 pr-14 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Buka menu navigasi"
          className="grid size-10 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="font-serif text-lg font-medium tracking-wide text-white">LPPM</span>
      </div>

      {/* ── Lonceng notifikasi (satu instance) ─────────────────────────── */}
      <div className="fixed right-2 top-2 z-40 lg:left-[12.5rem] lg:right-auto lg:top-[1.0625rem]">
        <NotificationBell />
      </div>

      {/* ── Latar gelap drawer (mobile) ────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Rail ───────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-rail text-white transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-dvh lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Merek */}
        <header className="flex h-[4.5rem] shrink-0 items-center gap-3 px-5 pr-14">
          <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/[0.07] ring-1 ring-inset ring-white/10">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brass-400" aria-hidden="true">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-serif text-xl font-medium leading-none tracking-wide text-white">LPPM</p>
            <p className="mt-1.5 truncate text-[0.6875rem] leading-none text-white/50">Pengelolaan Proposal</p>
          </div>
        </header>

        {/* Tombol tutup drawer (mobile) */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Tutup menu navigasi"
          className="absolute right-3 top-4 grid size-8 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Navigasi utama */}
        <nav aria-label="Navigasi utama" className="min-h-0 flex-1 overflow-y-auto px-3 pt-2">
          <div className="flex flex-col gap-0.5">
            {allNavItems.map((item) => item.children ? (
              <NavGroup key={item.path} item={item} onNavigate={() => setMobileOpen(false)} />
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={navLinkClass}
              >
                <span className="shrink-0">
                  {item.icon}
                </span>

                <span className="flex-1 truncate">
                  {item.label}
                </span>

                {item.badge && pendingCount > 0 && (
                  <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brass-400 px-1.5 text-[0.6875rem] font-bold leading-none text-rail">
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Akun & keluar */}
        <section className="shrink-0 border-t border-white/10 p-3">
          <NavLink
            to="/profil"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/[0.05]'}`
            }
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold text-white">
              {(user?.name || '?').charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-semibold text-white">
                {user?.name || '—'}
              </span>
              <span className="block truncate text-xs text-white/55">
                {ROLE_LABEL[primaryRole] || primaryRole}
              </span>
            </span>
          </NavLink>

          <button
            onClick={handleLogout}
            className="mt-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[0.8125rem] font-medium text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <svg className="size-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Keluar dari Sistem</span>
          </button>
        </section>
      </aside>
    </>
  )
}
