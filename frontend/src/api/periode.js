import api from './axios'

export const periodeApi = {
  getAll: (params = {}) => api.get('/periode', { params }),
  getById: (id) => api.get(`/periode/${id}`),
  create: (data) => api.post('/periode', data),
  update: (id, data) => api.patch(`/periode/${id}`, data),

  // Ketua LPPM: hapus langsung, konfirmasi password sendiri (new-api.md bagian 20)
  remove: (id, password) => api.delete(`/periode/${id}`, { data: { password } }),

  // Admin: permintaan hapus yang disetujui Ketua (2 langkah)
  getPendingDeletionRequest: (periodeId) =>
    api.get(`/periode/${periodeId}/deletion-request`),
  requestDelete: (periodeId, password) =>
    api.post(`/periode/${periodeId}/deletion-request`, { password }),
  approveDelete: (requestId, password) =>
    api.post(`/periode/deletion-request/${requestId}/approve`, { password }),
  cancelDeleteRequest: (requestId) =>
    api.post(`/periode/deletion-request/${requestId}/cancel`),
}
