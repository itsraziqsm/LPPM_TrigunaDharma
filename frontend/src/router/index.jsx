import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PrivateRoute, GuestRoute } from './guards'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import DashboardLayout from '../pages/DashboardLayout'
import ErrorPage from '../pages/ErrorPage'
import VerifyEmailPage from '../pages/VerifyEmailPage'

const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    errorElement: <ErrorPage routeError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <PrivateRoute />,
    errorElement: <ErrorPage routeError />,
    children: [
      { path: '/dashboard', element: <DashboardLayout /> },
      { path: '/periode', element: <DashboardLayout page="periode" /> },
      { path: '/riwayat-project', element: <DashboardLayout page="riwayat-project" /> },
      { path: '/proposals', element: <DashboardLayout page="proposals" /> },
      { path: '/users', element: <DashboardLayout page="users" /> },
      { path: '/undangan', element: <DashboardLayout page="undangan" /> },
      { path: '/undangan/:id', element: <DashboardLayout page="undangan-detail" /> },
      { path: '/penugasan', element: <DashboardLayout page="penugasan" /> },
      { path: '/laporan-harian', element: <DashboardLayout page="laporan-harian" /> },
      { path: '/project/penelitian', element: <DashboardLayout page="project" jenis="penelitian" /> },
      { path: '/project/pengabdian', element: <DashboardLayout page="project" jenis="pengabdian" /> },
      { path: '/profil', element: <DashboardLayout page="profil" /> },
      { path: '/notifikasi', element: <DashboardLayout page="notifikasi" /> },
      { path: '/notifikasi/:id', element: <DashboardLayout page="notifikasi-detail" /> },
      { path: '/luaran', element: <DashboardLayout page="luaran" /> },
      { path: '/laporan-masuk', element: <DashboardLayout page="laporan-masuk" /> },
      { path: '/kegiatan/penelitian/laporan/:id', element: <DashboardLayout page="laporan" jenis="penelitian" /> },
      { path: '/kegiatan/pengabdian/laporan/:id', element: <DashboardLayout page="laporan" jenis="pengabdian" /> },
      { path: '/kegiatan/penelitian/laporan/:id/isi', element: <DashboardLayout page="laporan-isi" jenis="penelitian" /> },
      { path: '/kegiatan/pengabdian/laporan/:id/isi', element: <DashboardLayout page="laporan-isi" jenis="pengabdian" /> },
      { path: '/cetak-dokumen', element: <DashboardLayout page="cetak-dokumen" /> },
      { path: '/backup', element: <DashboardLayout page="backup" /> },
      { path: '/template-proposal', element: <DashboardLayout page="template-proposal" /> },
      { path: '/luaran-dosen', element: <DashboardLayout page="luaran-dosen" /> },
      { path: '/pemantauan', element: <DashboardLayout page="pemantauan" /> },
      { path: '/cetak-dokumen/rekap-proposal', element: <DashboardLayout page="export" /> },
      { path: '/cetak-dokumen/surat-tugas', element: <DashboardLayout page="surat-tugas" /> },
      { path: '/kegiatan/penelitian', element: <DashboardLayout page="kegiatan" jenis="penelitian" /> },
      { path: '/kegiatan/pengabdian', element: <DashboardLayout page="kegiatan" jenis="pengabdian" /> },
      { path: '/kegiatan/penelitian/detail/:id', element: <DashboardLayout page="kegiatan-detail" jenis="penelitian" /> },
      { path: '/kegiatan/pengabdian/detail/:id', element: <DashboardLayout page="kegiatan-detail" jenis="pengabdian" /> },
      { path: '/kegiatan/penelitian/usulan', element: <DashboardLayout page="usulan" jenis="penelitian" /> },
      { path: '/kegiatan/pengabdian/usulan', element: <DashboardLayout page="usulan" jenis="pengabdian" /> },
      { path: '/kegiatan/penelitian/usulan/:id', element: <DashboardLayout page="usulan" jenis="penelitian" /> },
      { path: '/kegiatan/pengabdian/usulan/:id', element: <DashboardLayout page="usulan" jenis="pengabdian" /> },
    ],
  },
  // Publik (login atau tidak): konfirmasi link verifikasi email.
  { path: '/verify-email', element: <VerifyEmailPage />, errorElement: <ErrorPage routeError /> },
  // Halaman galat: /error/401, /error/403, /error/408, /error/500, /error/503, dst.
  { path: '/error/:code', element: <ErrorPage /> },
  // Export/Print Laporan kini menu Cetak Dokumen; tautan lama tetap jalan.
  { path: '/export', element: <Navigate to="/cetak-dokumen" replace /> },
  // Halaman Proposal Saya dilebur ke menu Kegiatan; tautan/bookmark lama tetap jalan.
  { path: '/proposal-saya', element: <Navigate to="/kegiatan/penelitian" replace /> },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '*', element: <ErrorPage code={404} /> },
])

export default router
