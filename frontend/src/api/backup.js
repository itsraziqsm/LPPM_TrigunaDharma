import api from './axios'

// Backup database (admin) — backend_go/new-api.md bagian 19.
export const backupApi = {
  getAll: (params = {}) => api.get('/backup', { params }),
  getJadwal: () => api.get('/backup/jadwal'),
  // 202, berjalan di latar; pantau dengan getById sampai status bukan 'berjalan'
  create: () => api.post('/backup'),
  getById: (id) => api.get(`/backup/${id}`),
  download: (id) => api.get(`/backup/${id}/download`, { responseType: 'blob' }),
  remove: (id) => api.delete(`/backup/${id}`),
}
