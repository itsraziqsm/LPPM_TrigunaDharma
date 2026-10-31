import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import Collapse from './Collapse'
import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import { proposalDosenApi } from '../api/Proposaldosen'
import NotificationBell from './NotificationBell'
import UserAvatar from './UserAvatar'
import LogoLppm from './LogoLppm'
import ConfirmDialog from './ConfirmDialog'
import { Archive, Award, BadgeDollarSign, BookOpen, GraduationCap, ChartNoAxesColumn, FileCheck2, FileCog, Calendar, ChevronRight, FolderKanban, MailPlus, DatabaseBackup, ClipboardCheck, ClipboardList, FileText, HeartHandshake, House, Inbox, LogOut, Menu, Microscope, PanelLeftClose, PanelLeftOpen, Printer, Users, X } from 'lucide-react'
import { canReview } from '../utils/roles'

const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
  ketua_stmik: 'Ketua STMIK',
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

// Dokumen Masuk (Proposal & Laporan Kegiatan): Ketua mengelola; Admin lihat & hapus.
const DOKUMEN_MASUK = {
  path: '/dokumen-masuk', label: 'Dokumen Masuk', icon: (
    <Inbox className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
  ),
  children: [
    { path: '/proposals', label: 'Proposal Kegiatan', icon: <FileText className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
    { path: '/laporan-masuk', label: 'Laporan Kegiatan', icon: <FileCheck2 className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
  ],
}

// Menu per peran (sidebar mendukung 3 tingkat). Fitur yang tidak ada di menu = dicabut.
// Admin: Akademik (Dokumen Masuk › Proposal/Laporan Kegiatan, Periode [lihat saja]), Dokumentasi
// (Manajemen Template, Cetak Dokumen), Pengguna, Backup Data.
const ADMIN_NAV_ITEMS = [
  {
    path: '/akademik', label: 'Akademik', icon: <GraduationCap className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />,
    children: [
      DOKUMEN_MASUK,
      { path: '/periode', label: 'Periode', icon: <Calendar className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
    ],
  },
  {
    path: '/dokumentasi', label: 'Dokumentasi', icon: <BookOpen className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />,
    children: [
      { path: '/template-proposal', label: 'Manajemen Template', icon: <FileCog className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
      { path: '/cetak-dokumen', label: 'Cetak Dokumen', icon: <Printer className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
    ],
  },
  { path: '/users', label: 'Pengguna', icon: <Users className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
  { path: '/backup', label: 'Backup Data', icon: <DatabaseBackup className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
]

// Ketua STMIK (hanya baca): Akademik (Daftar Dokumen › Proposal/Laporan, Arsip Periode), Statistik (dulu
// Pemantauan Proposal), Cetak Laporan, Monitor Pengguna (tampilan Pengguna mode baca).
const STMIK_NAV_ITEMS = [
  {
    path: '/akademik', label: 'Akademik', icon: <GraduationCap className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />,
    children: [
      {
        path: '/daftar-dokumen', label: 'Daftar Dokumen', icon: <Inbox className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />,
        children: [
          { path: '/daftar-dokumen/proposal', label: 'Proposal', icon: <FileText className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
          { path: '/daftar-dokumen/laporan', label: 'Laporan', icon: <FileCheck2 className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
        ],
      },
      { path: '/arsip-periode', label: 'Arsip Periode', icon: <Archive className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
    ],
  },
  { path: '/statistik', label: 'Statistik', icon: <ChartNoAxesColumn className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
  { path: '/cetak-laporan', label: 'Cetak Laporan', icon: <Printer className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
  { path: '/users', label: 'Monitor Pengguna', icon: <Users className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
]

// Ketua LPPM: Dokumen Masuk, Periode, Pengguna, Dokumentasi (Cetak Dokumen, Luaran).
const KETUA_NAV_ITEMS = [
  DOKUMEN_MASUK,
  { path: '/periode', label: 'Periode', icon: <Calendar className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
  { path: '/users', label: 'Pengguna', icon: <Users className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
  {
    path: '/dokumentasi', label: 'Dokumentasi', icon: <BookOpen className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />,
    children: [
      { path: '/cetak-dokumen', label: 'Cetak Dokumen', icon: <Printer className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
      { path: '/luaran-dosen', label: 'Luaran', icon: <Award className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
    ],
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
      // Ikon anak dipakai di rail ciut (tampil sebagai ikon terpisah).
      { path: '/kegiatan/penelitian', label: 'Penelitian', icon: <Microscope className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
      { path: '/kegiatan/pengabdian', label: 'Pengabdian', icon: <HeartHandshake className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
    ],
  },
  {
    path: '/arsip-kegiatan', label: 'Arsip Kegiatan', icon: (
      <Archive className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
  {
    path: '/luaran', label: 'Luaran', icon: (
      <BadgeDollarSign className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
  {
    path: '/undangan', label: 'Undangan Kerja Sama', badge: true, icon: (
      <Users className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    ),
  },
]

// Mahasiswa: Dashboard, Project Saya (Penelitian/Pengabdian → pilih project → Laporan
// Harian), Arsip Project (folder per periode), Undangan Ikut Serta, Cetak Laporan (rekap laporan harian).
const MAHASISWA_NAV_ITEMS = [
  {
    path: '/project', label: 'Project Saya', icon: (
      <FolderKanban className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    ),
    children: [
      { path: '/project/penelitian', label: 'Penelitian', icon: <Microscope className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
      { path: '/project/pengabdian', label: 'Pengabdian', icon: <HeartHandshake className="size-[18px]" strokeWidth={1.5} aria-hidden="true" /> },
    ],
  },
  {
    path: '/arsip-project', label: 'Arsip Project', icon: (
      <Archive className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    )
  },
  {
    path: '/undangan', label: 'Undangan Ikut Serta', badge: true, icon: (
      <MailPlus className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    ),
  },
  {
    path: '/cetak-laporan', label: 'Cetak Laporan', icon: (
      <Printer className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
    ),
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
      ? 'bg-white text-navy-950 shadow-sm ring-1 ring-inset ring-navy-100 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brass-400'
      : 'text-slate-600 hover:bg-white/70 hover:text-navy-950'
  }`

// Semua tautan daun (tanpa children) dari pohon menu — dipakai rail ciut & cek grup aktif.
const daunMenu = (items) => items.flatMap((it) => (it.children ? daunMenu(it.children) : [it]))

// Grup menu bertingkat (rekursif, hingga 3 tingkat): tingkat 1 dengan ikon, tingkat
// berikutnya hanya label dengan garis kiri bertingkat.
function NavGroup({ item, onNavigate, depth = 0 }) {
  const { pathname } = useLocation()
  const childActive = daunMenu(item.children).some((c) => pathname.startsWith(c.path))
  // Pilihan manual berlaku di halaman tempat ia dibuat; saat pindah halaman
  // grup otomatis terbuka bila anaknya aktif (Sidebar tidak dipasang ulang
  // antar-route karena DashboardLayout tetap komponen yang sama).
  const [manual, setManual] = useState({ path: null, open: false })
  const expanded = manual.path === pathname ? manual.open : childActive || manual.open
  const listId = `nav-group-${item.path.replace(/\W+/g, '-')}`

  return (
    <div>
      <button
        type="button"
        onClick={() => setManual({ path: pathname, open: !expanded })}
        aria-expanded={expanded}
        aria-controls={listId}
        className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[0.8125rem] font-medium transition-colors ${
          childActive ? 'text-navy-950' : 'text-slate-600 hover:bg-white/70 hover:text-navy-950'
        }`}
      >
        {depth === 0 ? <span className="shrink-0">{item.icon}</span> : null}
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronRight className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <Collapse open={expanded} id={listId}>
        <div className={`${depth === 0 ? 'ml-[1.3rem]' : 'ml-3'} flex flex-col gap-0.5 border-l border-navy-200 py-0.5 pl-2`}>
          {item.children.map((child) =>
            child.children ? (
              <NavGroup key={child.path} item={child} onNavigate={onNavigate} depth={depth + 1} />
            ) : (
              <NavLink key={child.path} to={child.path} onClick={onNavigate} className={navLinkClass}>
                <span className="flex-1 truncate">{child.label}</span>
              </NavLink>
            ),
          )}
        </div>
      </Collapse>
    </div>
  )
}

// ── Sidebar yang bisa diciutkan (desktop) ──────────────────────────────────
// Ctrl/⌘ + B atau tombol "Sembunyikan navigasi". Saat diciutkan hanya logo
// yang tampil; klik logo untuk membuka lagi. Pilihan diingat per peramban.
const COLLAPSE_KEY = 'sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(value) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
}

// Label tombol pengubah sesuai OS untuk bantuan pintasan (⌘ di Mac, Ctrl lainnya).
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'

const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches

// Tombol ikon di rail ciut: label lewat aria-label + tooltip (title).
const railItemClass = ({ isActive }) =>
  `relative grid size-10 place-items-center rounded-lg transition-colors ${
    isActive
      ? 'bg-white text-navy-950 shadow-sm ring-1 ring-inset ring-navy-100 before:absolute before:inset-y-2 before:-left-[0.875rem] before:w-0.5 before:rounded-full before:bg-brass-400'
      : 'text-slate-500 hover:bg-white/70 hover:text-navy-950'
  }`

// Avatar profil di rail ciut (bagian akun berlatar gelap).
const railProfileClass = ({ isActive }) =>
  `grid size-10 place-items-center rounded-lg transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/[0.05]'}`

// Dipanggil dari UndanganPage setelah user respond, agar badge langsung update
export function refreshInvitationBadge() {
  window.dispatchEvent(new CustomEvent('invitation-badge-refresh'))
}

// ─── Rail navigasi ───────────────────────────────────────────────────────────
// Desktop : rail navy tetap di kiri (lebar 16rem), bisa diciutkan menjadi
//           strip logo (4.5rem) lewat Ctrl/⌘ + B atau tombol.
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
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      writeCollapsed(!value)
      return !value
    })

  // Pintasan Ctrl/⌘ + B: ciutkan/buka rail di desktop, buka/tutup laci di ponsel.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return
      e.preventDefault()
      if (e.repeat) return
      if (isDesktop()) {
        setCollapsed((value) => {
          writeCollapsed(!value)
          return !value
        })
      } else {
        setMobileOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Kelas untuk bagian yang disembunyikan saat rail diciutkan (desktop saja).
  const hideWhenCollapsed = collapsed ? 'lg:hidden' : ''

  const roleNames = getRoleNames(user?.roles)
  const primaryRole = roleNames[0] || 'user'
  const isAdminOrKetua = primaryRole === 'admin' || primaryRole === 'ketua_lppm'
  const isMahasiswa = primaryRole === 'mahasiswa'
  const isDosen = primaryRole === 'dosen'
  const isDosenOrMahasiswa = isDosen || isMahasiswa
  const isReviewer = canReview(user)

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

  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const askLogout = () => {
    setMobileOpen(false)
    setConfirmLogout(true)
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  const allNavItems = [
    ...NAV_ITEMS,
    ...(primaryRole === 'ketua_lppm' ? KETUA_NAV_ITEMS : primaryRole === 'admin' ? ADMIN_NAV_ITEMS : []),
    ...(primaryRole === 'ketua_stmik' ? STMIK_NAV_ITEMS : []),
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
      <div
        className={`fixed right-2 top-2 z-40 lg:right-auto ${
          collapsed ? 'lg:left-[1.125rem] lg:top-[4.5rem]' : 'lg:left-[12.5rem] lg:top-[1.0625rem]'
        }`}
      >
        <NotificationBell />
      </div>

      {/* ── Latar gelap drawer (mobile) ────────────────────────────────── */}
      {mobileOpen && (
        <div
          data-scroll-lock
          className="fixed inset-0 z-40 bg-navy-950/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Rail ───────────────────────────────────────────────────────── */}
      <aside
        aria-label="Navigasi"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-rail-soft text-navy-950 transition-[translate,width] duration-200 ease-out lg:relative lg:z-10 lg:h-dvh lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[4.5rem] lg:shadow-none' : ''} shadow-[6px_0_20px_-6px_rgba(13,28,63,0.28)]`}
      >
        {/* Merek (saat diciutkan hanya logo; tombol buka ada di atas profil) */}
        <header className={`flex h-[4.5rem] shrink-0 items-center gap-3 px-5 pr-14 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <LogoLppm className="size-10 shrink-0" />
          <div className={`min-w-0 ${hideWhenCollapsed}`}>
            <p className="font-serif text-xl font-medium leading-none tracking-wide text-navy-950">LPPM</p>
            <p className="mt-1.5 truncate text-[0.6875rem] leading-none text-slate-500">Pengelolaan Proposal</p>
          </div>
        </header>

        {/* Tombol tutup drawer (mobile) */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Tutup menu navigasi"
          className="absolute right-3 top-4 grid size-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-navy-100 hover:text-navy-950 lg:hidden"
        >
          <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </button>

        {/* Navigasi utama */}
        <nav aria-label="Navigasi utama" className={`min-h-0 flex-1 overflow-y-auto px-3 pt-2 ${hideWhenCollapsed}`}>
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
        {/* Rail ciut (desktop): ikon seluruh menu sebagai akses cepat. Ruang
            atas (pt-12) untuk lonceng notifikasi yang diposisikan fixed. */}
        {collapsed ? (
          <>
            <nav aria-label="Navigasi utama" className="hidden min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pt-12 lg:flex">
              {daunMenu(allNavItems)
                .map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    aria-label={item.label}
                    title={item.label}
                    className={railItemClass}
                  >
                    {item.icon}
                    {item.badge && pendingCount > 0 && (
                      <span className="absolute right-1 top-1 size-2 rounded-full bg-brass-400 ring-2 ring-rail-soft" aria-hidden="true" />
                    )}
                  </NavLink>
                ))}
            </nav>
            {/* Satu-satunya tombol buka rail: posisi sama dengan "Sembunyikan menu", ikon dibalik */}
            <div className="hidden shrink-0 justify-center pb-3 pt-2 lg:flex">
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={false}
                aria-keyshortcuts="Control+B"
                aria-label="Tampilkan menu"
                title={`Tampilkan menu (${MOD_KEY} + B)`}
                className="grid size-10 place-items-center rounded-lg bg-white/60 text-slate-600 ring-1 ring-inset ring-navy-200/70 transition-colors hover:bg-white hover:text-navy-950"
              >
                <PanelLeftOpen className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <section aria-label="Akun" className="hidden shrink-0 flex-col items-center gap-1 bg-rail py-3 text-white lg:flex">
              <NavLink to="/profil" aria-label={`Profil: ${user?.name || ''}`} title={user?.name || 'Profil'} className={railProfileClass}>
                <UserAvatar user={user} className="size-8 text-sm" />
              </NavLink>
              <button
                type="button"
                onClick={askLogout}
                aria-label="Keluar dari Sistem"
                title="Keluar dari Sistem"
                className="grid size-10 place-items-center rounded-lg text-white/70 transition-colors hover:bg-red-500/20 hover:text-red-300"
              >
                <LogOut className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </section>
          </>
        ) : null}

        {/* Tombol sembunyikan menu: di bagian terang, tepat di atas profil (desktop) */}
        <div className={`hidden shrink-0 px-3 pb-3 pt-2 lg:block ${hideWhenCollapsed}`}>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={true}
            title={`Sembunyikan menu (${MOD_KEY} + B)`}
            aria-keyshortcuts="Control+B"
            aria-label="Sembunyikan menu"
            className="flex h-10 w-full items-center gap-2 rounded-lg bg-white/60 px-2.5 text-[0.8125rem] font-medium text-slate-600 ring-1 ring-inset ring-navy-200/70 transition-colors hover:bg-white hover:text-navy-950"
          >
            <PanelLeftClose className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1 truncate text-left">Sembunyikan menu</span>
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
              <kbd className="rounded border border-navy-200 bg-white px-1 py-px font-sans text-[0.6875rem] font-semibold leading-4 text-slate-500">{MOD_KEY}</kbd>
              <kbd className="rounded border border-navy-200 bg-white px-1 py-px font-sans text-[0.6875rem] font-semibold leading-4 text-slate-500">B</kbd>
            </span>
          </button>
        </div>

        {/* Bagian bawah gelap (#0D1C3F): profil + keluar */}
        <section aria-label="Akun" className={`flex shrink-0 flex-col gap-1.5 bg-rail p-3 text-white ${hideWhenCollapsed}`}>
          <NavLink
            to="/profil"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/[0.05]'}`
            }
          >
            <UserAvatar user={user} className="size-9 text-sm" />
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
            type="button"
            onClick={askLogout}
            className="flex h-10 w-full items-center gap-3 rounded-lg bg-white/[0.06] px-2.5 text-[0.8125rem] font-medium text-white/80 ring-1 ring-inset ring-white/10 transition-colors hover:bg-red-600 hover:text-white hover:ring-red-500"
          >
            <LogOut className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
            Keluar dari Sistem
          </button>
        </section>
      </aside>

      {confirmLogout ? (
        <ConfirmDialog
          tone="danger"
          icon={LogOut}
          title="Keluar dari sistem?"
          message="Sesi Anda akan diakhiri. Perubahan yang belum disimpan di halaman ini akan hilang."
          confirmText="Ya, keluar"
          busy={loggingOut}
          busyText="Keluar…"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={handleLogout}
        />
      ) : null}
    </>
  )
}
