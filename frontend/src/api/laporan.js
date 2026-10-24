import api from './axios'

// Endpoint laporan baru (lihat backend_go/new-api.md).
export const laporanApi = {
  getMy: (params = {}) => api.get('/laporan/my', { params }),
  getEligible: () => api.get('/laporan/eligible'),
  getById: (id) => api.get(`/laporan/${id}`),
}
