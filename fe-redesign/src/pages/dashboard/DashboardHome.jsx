import useAuthStore from '../../store/authStore'
import DashboardScreen from './DashboardScreen'
import { adapterKeyForRole } from './adapters'
import useDashboardData from './useDashboardData'

// Satu dashboard untuk semua peran (admin, Ketua LPPM, dosen, mahasiswa,
// reviewer). Peran hanya menentukan adapter data yang dipakai; susunan halaman
// sama. Dosen/mahasiswa/pengelola yang juga memegang tugasan review mendapat
// ringkasan tugasan tambahan di dalam susunan yang sama.
export default function DashboardHome({ role, isReviewer }) {
  const user = useAuthStore((s) => s.user)
  const adapterKey = adapterKeyForRole(role)

  const state = useDashboardData({
    adapterKey,
    withReviewerDigest: Boolean(isReviewer) && adapterKey !== 'reviewer',
  })

  if (!adapterKey) return null

  return (
    <DashboardScreen
      role={role}
      adapterKey={adapterKey}
      user={user}
      loading={state.loading}
      refreshing={state.refreshing}
      model={state.model}
      failed={state.failed}
      updatedAt={state.updatedAt}
      onReload={state.reload}
    />
  )
}
