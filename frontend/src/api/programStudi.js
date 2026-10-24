import api from './axios'

// Master program studi. GET publik; tulis khusus admin.
export const programStudiApi = {
  list: (params = {}) => api.get('/program-studi', { params }), // { semua: true } termasuk nonaktif
  create: (data) => api.post('/program-studi', data),
  update: (id, data) => api.patch(`/program-studi/${id}`, data),
  remove: (id) => api.delete(`/program-studi/${id}`),
}
