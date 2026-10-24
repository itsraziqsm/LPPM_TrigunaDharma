import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PrivateRoute, GuestRoute } from './guards'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import DashboardLayout from '../pages/DashboardLayout'

const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <PrivateRoute />,
    children: [
      { path: '/dashboard', element: <DashboardLayout /> },
      { path: '/periode', element: <DashboardLayout page="periode" /> },
      { path: '/proposals', element: <DashboardLayout page="proposals" /> },
      { path: '/users', element: <DashboardLayout page="users" /> },
      { path: '/proposal-saya', element: <DashboardLayout page="proposal-saya" /> },
      { path: '/undangan', element: <DashboardLayout page="undangan" /> },
      { path: '/penugasan', element: <DashboardLayout page="penugasan" /> },
      { path: '/laporan-harian', element: <DashboardLayout page="laporan-harian" /> },
      { path: '/profil', element: <DashboardLayout page="profil" /> },
      { path: '/export', element: <DashboardLayout page="export" /> }, // ← BARU
      { path: '/kegiatan/penelitian', element: <DashboardLayout page="kegiatan" jenis="penelitian" /> },
      { path: '/kegiatan/pengabdian', element: <DashboardLayout page="kegiatan" jenis="pengabdian" /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
])

export default router
