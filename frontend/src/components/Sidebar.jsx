import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import { proposalDosenApi } from '../api/Proposaldosen'
import NotificationBell from './NotificationBell'
import { BookOpen, Calendar, ChevronRight, ClipboardCheck, ClipboardList, FileDown, FileText, House, LogOut, Menu, Users, X } from 'lucide-react'

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
      <House className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
]

const ADMIN_NAV_ITEMS = [
  {
    path: '/periode', label: 'Periode', icon: (
      <Calendar className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
  {
    path: '/users', label: 'User', icon: (
      <Users className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
  // ← BARU: Menu Export Laporan
  {
    path: '/export', label: 'Export Laporan', icon: (
      <FileDown className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
]

const DOSEN_NAV_ITEMS = [
  // Grup bertingkat: dirender oleh NavGroup (buka-tutup, otomatis terbuka
  // bila salah satu anaknya aktif).
  {
    path: '/kegiatan', label: 'Kegiatan', icon: (
      <ClipboardList className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    ),
    children: [
      { path: '/kegiatan/penelitian', label: 'Penelitian' },
      { path: '/kegiatan/pengabdian', label: 'Pengabdian' },
    ],
  },
  {
    path: '/proposal-saya', label: 'Proposal Saya', icon: (
      <FileText className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
  {
    path: '/undangan', label: 'Undangan Tim', badge: true, icon: (
      <Users className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    ),
  },
]

const MAHASISWA_NAV_ITEMS = [
  {
    path: '/undangan', label: 'Undangan Tim', badge: true, icon: (
      <Users className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    ),
  },
  {
    path: '/laporan-harian', label: 'Laporan Harian', icon: (
      <ClipboardList className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
]

const REVIEWER_NAV_ITEMS = [
  {
    path: '/penugasan', label: 'Penugasan Review', icon: (
      <ClipboardCheck className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
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
        <ChevronRight className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} strokeWidth={1.8} aria-hidden="true" />
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
          <Menu className="size-5" strokeWidth={1.6} aria-hidden="true" />
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
            <BookOpen className="text-brass-400" size={19} strokeWidth={1.8} aria-hidden="true" />
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
          <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
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
            <LogOut className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span>Keluar dari Sistem</span>
          </button>
        </section>
      </aside>
    </>
  )
}
