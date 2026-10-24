import Sidebar from '../components/Sidebar'
import useAuthStore from '../store/authStore'
import DashboardHome from './dashboard/DashboardHome'
import PeriodePage from './PeriodePage'
import UserManagementPage from './UserManagementPage'
import ProposalPage from './ProposalPage'
import ProposalDosenPage from './ProposalDosenPage'
import UndanganPage from './UndanganPage'
import ReviewTugasanPage from './ReviewTugasanPage'
import LaporanHarianPage from './LaporanHarianPage'
import ProfilePage from './ProfilePage'
import ExportPage from './ExportPage' // ← BARU
import KegiatanPage from './KegiatanPage'

const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
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
  // Dosen/mahasiswa yang punya tugasan review juga dianggap reviewer di sisi UI
  const isReviewer = roleNames.includes('reviewer') || user?.hasTugasan === true

  if (!user || loading) {
    return (
      <div className="flex h-dvh overflow-hidden bg-canvas">
        <Sidebar />

        {/* Keadaan memuat: tenang, satu pesan */}
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-6 pt-14 lg:pt-0">
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
    if (page === 'profil') return <ProfilePage />

    if (isAdminOrKetua) {
      if (page === 'periode') return <PeriodePage />
      if (page === 'proposals') return <ProposalPage />
      if (page === 'users') return <UserManagementPage />
      if (page === 'export') return <ExportPage /> // ← BARU
      return <DashboardHome role={primaryRole} isReviewer={isReviewer} />
    }

    if (isMahasiswa) {
      if (page === 'undangan') return <UndanganPage />
      if (page === 'laporan-harian') return <LaporanHarianPage />
      if (page === 'penugasan' && isReviewer) return <ReviewTugasanPage />
      return <DashboardHome role="mahasiswa" isReviewer={isReviewer} />
    }

    if (isDosen) {
      if (page === 'proposal-saya') return <ProposalDosenPage />
      // key = jenis: pindah Penelitian ↔ Pengabdian mengosongkan filter & halaman
      if (page === 'kegiatan') return <KegiatanPage key={jenis} jenis={jenis} />
      if (page === 'undangan') return <UndanganPage />
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
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-navy-800 font-serif text-xl text-white">
              {user.name?.charAt(0)?.toUpperCase() || '?'}
            </div>

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
        <section className="min-h-0 flex-1 overflow-y-auto">
          {renderContent()}
        </section>
      </main>
    </div>
  )
}
