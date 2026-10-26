import { useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import GlobalSearch from '../components/GlobalSearch'
import useLenis from '../hooks/useLenis'
import useAuthStore from '../store/authStore'
import DashboardHome from './dashboard/DashboardHome'
import PeriodePage from './PeriodePage'
import UserManagementPage from './UserManagementPage'
import ProposalPage from './ProposalPage'
import UndanganPage from './UndanganPage'
import UndanganDetailPage from './UndanganDetailPage'
import ReviewTugasanPage from './ReviewTugasanPage'
import LaporanHarianPage from './LaporanHarianPage'
import ProfilePage from './ProfilePage'
import ExportPage from './ExportPage' // ← BARU
import KegiatanPage from './KegiatanPage'
import KegiatanDetailPage from './KegiatanDetailPage'
import UsulanPage from './UsulanPage'
import LuaranPage from './LuaranPage'
import LaporanPage from './LaporanPage'
import LaporanIsiPage from './LaporanIsiPage'
import LaporanMasukPage from './LaporanMasukPage'
import NotifikasiPage from './NotifikasiPage'
import NotifikasiDetailPage from './NotifikasiDetailPage'
import { canReview } from '../utils/roles'
import CetakDokumenPage from './cetak/CetakDokumenPage'
import SuratTugasPage from './cetak/SuratTugasPage'
import BackupPage from './BackupPage'
import TemplateProposalPage from './TemplateProposalPage'
import LuaranDosenPage from './LuaranDosenPage'
import PemantauanPage from './PemantauanPage'
import ReviewProposalPage from './review/ReviewProposalPage'
import ProposalMasukDetailPage from './ProposalMasukDetailPage'
import LaporanMasukDetailPage from './LaporanMasukDetailPage'
import ReviewLaporanPage from './review/ReviewLaporanPage'
import RiwayatProjectPage from './RiwayatProjectPage'
import LaporanHarianInputPage from './LaporanHarianInputPage'
import UserAvatar from '../components/UserAvatar'

const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
  ketua_stmik: 'Ketua STMIK',
  dosen: 'Dosen',
  reviewer: 'Reviewer',
  mahasiswa: 'Mahasiswa',
}

function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

export default function DashboardLayout({ page, jenis }) {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)

  const roleNames = getRoleNames(user?.roles)
  const primaryRole = roleNames[0] || ''
  const isAdminOrKetua = primaryRole === 'admin' || primaryRole === 'ketua_lppm'
  const isMahasiswa = primaryRole === 'mahasiswa'
  const isDosen = primaryRole === 'dosen'
  // Dosen hanya bila diberi peran reviewer (Admin/Ketua); lihat utils/roles.js
  const isReviewer = canReview(user)

  const location = useLocation()
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const ready = Boolean(user) && !loading
  // Manajemen User menggulir di area daftarnya sendiri (Lenis dipasang di sana),
  // jadi wadah luar dibuat setinggi layar tanpa Lenis.
  const selfScrolling = isAdminOrKetua && page === 'users'
  // Smooth scroll untuk area konten; dipasang ulang (dan kembali ke atas) saat
  // pindah halaman (URL).
  useLenis(scrollRef, {
    contentRef,
    enabled: !selfScrolling,
    resetKey: ready ? location.pathname : 'memuat',
  })

  if (!user || loading) {
    return (
      <div className="flex h-dvh overflow-hidden bg-canvas">
        <Sidebar />

        {/* Keadaan memuat: tenang, satu pesan */}
        <main data-scroll-container className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-6 pt-14 lg:pt-0">
          <section className="w-full max-w-md text-center">
            <span className="spinner mx-auto text-navy-600" />
            <h1 className="mt-6 font-serif text-2xl text-navy-950">
              Menyiapkan dashboard Anda
            </h1>
            <p className="mt-2 text-base leading-relaxed text-slate-500">
              Mohon tunggu sebentar. Data akun dan akses halaman sedang
              dipersiapkan agar tampilan sesuai dengan peran pengguna.
            </p>
          </section>
        </main>
      </div>
    )
  }

  const renderContent = () => {
    // Detail kegiatan: pengusul, anggota tim (dosen/mahasiswa), admin & ketua (baca saja).
    if (page === 'kegiatan-detail') return <KegiatanDetailPage jenis={jenis} />
    if (page === 'profil') return <ProfilePage />
    if (page === 'notifikasi') return <NotifikasiPage />
    if (page === 'notifikasi-detail') return <NotifikasiDetailPage key={location.pathname} />

    // Detail proposal & laporan (halaman, bukan modal): Ketua/Admin = kelola (Dokumen Masuk),
    // reviewer = penilaian tugasan.
    if (page === 'review-proposal' || page === 'review-laporan') {
      if (isAdminOrKetua) return page === 'review-proposal' ? <ProposalMasukDetailPage key={location.pathname} /> : <LaporanMasukDetailPage key={location.pathname} />
      if (isReviewer) return page === 'review-proposal' ? <ReviewProposalPage key={location.pathname} /> : <ReviewLaporanPage key={location.pathname} />
    }

    // Ketua STMIK (W-37): pemantauan saja — Pemantauan Proposal, Rekap Proposal, dashboard.
    if (primaryRole === 'ketua_stmik') {
      if (page === 'pemantauan') return <PemantauanPage />
      if (page === 'export') return <ExportPage />
      if (page === 'cetak-dokumen') return <Navigate to="/cetak-dokumen/rekap-proposal" replace />
      return <DashboardHome role="ketua_stmik" isReviewer={false} />
    }

    if (isAdminOrKetua) {
      if (page === 'pemantauan') return <PemantauanPage />
      if (page === 'periode') return <PeriodePage />
      if (page === 'proposals') return <ProposalPage />
      if (page === 'users') return <UserManagementPage />
      if (page === 'cetak-dokumen') return <CetakDokumenPage />
      if (page === 'export') return <ExportPage />
      if (page === 'surat-tugas') return <SuratTugasPage />
      if (page === 'laporan-masuk') return <LaporanMasukPage />
      if (page === 'backup' && primaryRole === 'admin') return <BackupPage />
      if (page === 'template-proposal' && primaryRole === 'admin') return <TemplateProposalPage />
      if (page === 'luaran-dosen' && primaryRole === 'admin') return <LuaranDosenPage />
      return <DashboardHome role={primaryRole} isReviewer={isReviewer} />
    }

    if (isMahasiswa) {
      // Mahasiswa pengusul juga bisa membuka laporannya (mis. dari notifikasi).
      if (page === 'laporan') return <LaporanPage key={location.pathname} jenis={jenis} />
      if (page === 'laporan-isi') return <LaporanIsiPage key={location.pathname} jenis={jenis} />
      if (page === 'undangan') return <UndanganPage />
      if (page === 'undangan-detail') return <UndanganDetailPage key={location.pathname} />
      if (page === 'laporan-harian') return <LaporanHarianPage />
      // Project Saya per jenis → pilih project → Laporan Harian
      if (page === 'project') return <LaporanHarianPage key={jenis} jenis={jenis} />
      // Input Laporan Harian: halaman satu formulir (?id=<proposalId>)
      if (page === 'laporan-harian-input') return <LaporanHarianInputPage key={location.search} jenis={jenis} />
      if (page === 'riwayat-project') return <RiwayatProjectPage />
      // Menu lama "Periode" mahasiswa → Riwayat Project.
      if (page === 'periode') return <Navigate to="/riwayat-project" replace />
      if (page === 'penugasan' && isReviewer) return <ReviewTugasanPage />
      return <DashboardHome role="mahasiswa" isReviewer={isReviewer} />
    }

    if (isDosen) {
      // key = jenis: pindah Penelitian ↔ Pengabdian mengosongkan filter & halaman
      if (page === 'kegiatan') return <KegiatanPage key={jenis} jenis={jenis} />
      if (page === 'luaran') return <LuaranPage />
      if (page === 'laporan') return <LaporanPage key={location.pathname} jenis={jenis} />
      if (page === 'laporan-isi') return <LaporanIsiPage key={location.pathname} jenis={jenis} />
      if (page === 'usulan') return <UsulanPage key={`${jenis}:${location.pathname}`} jenis={jenis} />
      if (page === 'undangan') return <UndanganPage />
      if (page === 'undangan-detail') return <UndanganDetailPage key={location.pathname} />
      // Dosen yang punya tugasan bisa akses halaman penugasan
      if (page === 'penugasan' && isReviewer) return <ReviewTugasanPage />
      return <DashboardHome role="dosen" isReviewer={isReviewer} />
    }

    if (isReviewer) {
      if (page === 'penugasan') return <ReviewTugasanPage />
      return <DashboardHome role="reviewer" isReviewer />
    }

    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 lg:py-16">
        <article className="card">
          <header className="border-b border-slate-200 px-6 py-5">
            <h1 className="font-serif text-2xl text-navy-950">
              Akses halaman belum tersedia
            </h1>
            <p className="mt-2 text-base leading-relaxed text-slate-500">
              Akun Anda berhasil dikenali, tetapi halaman yang dipilih belum
              memiliki tampilan khusus untuk peran ini.
            </p>
          </header>

          <div className="flex items-start gap-4 px-6 py-6">
            <UserAvatar user={user} className="size-12 text-xl" fallbackClassName="bg-navy-800 font-serif font-normal text-white" />

            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-500">Selamat datang</p>
              <h2 className="break-words text-lg font-semibold text-slate-900">
                {user.name}
              </h2>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="badge badge-info">
                  {ROLE_LABEL[primaryRole] || primaryRole}
                </span>

                {isReviewer && (
                  <span className="badge badge-neutral">
                    Memiliki akses penugasan review
                  </span>
                )}
              </div>

              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Silakan lanjutkan melalui menu di sidebar untuk membuka
                halaman yang tersedia sesuai hak akses akun Anda.
              </p>
            </div>
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar />

      {/* Area konten: satu penggulir, latar kanvas tenang */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden pt-14 lg:pt-0">
        <section ref={scrollRef} data-scroll-container className="min-h-0 flex-1 overflow-y-auto">
          <div ref={contentRef} className={selfScrolling ? 'h-full' : undefined}>
            {renderContent()}
          </div>
        </section>
      </main>
      {ready ? <GlobalSearch roleNames={roleNames} isReviewer={isReviewer} /> : null}
    </div>
  )
}
