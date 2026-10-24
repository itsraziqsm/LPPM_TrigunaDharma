import api from './axios'

// Master data (rumpun ilmu, bidang, pilihan luaran). Baca: semua user login; tulis: admin.
// kategori: 'rumpun-ilmu' | 'bidang' | 'luaran'; params.jenis = penelitian|pengabdian.
export const masterApi = {
  list: (kategori, params = {}) => api.get(`/master/${kategori}`, { params }),
  create: (kategori, data) => api.post(`/master/${kategori}`, data),
  update: (kategori, id, data) => api.patch(`/master/${kategori}/${id}`, data),
  remove: (kategori, id) => api.delete(`/master/${kategori}/${id}`),
}
