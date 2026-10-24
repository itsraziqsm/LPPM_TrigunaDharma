import api, { API_BASE_URL } from './axios'
import { alertDialog } from '../utils/dialog'

const BASE = '/mahasiswa/laporan-harian'

export const laporanHarianApi = {
  // Daftar proposal di mana mahasiswa ini adalah anggota
  getMyProposals: () => api.get(`${BASE}/proposals`),

  // List laporan harian untuk proposal tertentu
  getByProposal: (proposalId) => api.get(`${BASE}/${proposalId}`),

  // Buat laporan harian baru (FormData untuk file upload)
  create: (proposalId, formData) =>
    api.post(`${BASE}/${proposalId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Download dokumen laporan
  getDokumenUrl: (id) => {
    const base = api.defaults.baseURL || ''
    return `${base}${BASE}/dokumen/${id}`
  },

  openDokumen: async (id) => {
    const token = localStorage.getItem('accessToken')
    const base = api.defaults.baseURL || API_BASE_URL
    const res = await fetch(`${base}${BASE}/dokumen/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) { alertDialog({ title: 'Gagal membuka dokumen', message: 'Dokumen tidak dapat dibuka. Silakan coba lagi.' }); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  },

  // Hapus laporan harian
  delete: (id) => api.delete(`${BASE}/${id}`),
}
