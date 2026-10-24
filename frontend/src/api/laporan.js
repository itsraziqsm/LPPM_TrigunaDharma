import api from './axios'

// Endpoint laporan (lihat backend_go/new-api.md bagian 3–5). Status code laporan
// memakai 400/403/404/409 yang sesuai, bukan 500 seperti endpoint lama.
export const laporanApi = {
  // Pengusul (dosen/mahasiswa)
  getMy: (params = {}) => api.get('/laporan/my', { params }),
  getEligible: () => api.get('/laporan/eligible'),
  create: (data) => api.post('/laporan', data), // { proposalId, ... }
  getById: (id) => api.get(`/laporan/${id}`),
  update: (id, data) => api.patch(`/laporan/${id}`, data),
  submit: (id) => api.post(`/laporan/${id}/submit`),
  remove: (id) => api.delete(`/laporan/${id}`),
  uploadDokumen: (id, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/laporan/${id}/dokumen`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  downloadDokumen: (id) => api.get(`/laporan/${id}/dokumen`, { responseType: 'blob' }),

  // Ketua LPPM / admin
  getAll: (params = {}) => api.get('/laporan', { params }),
  updateStatus: (id, data) => api.patch(`/laporan/${id}/status`, data), // { status, catatanRevisi }
  assignReviewers: (id, reviewerIds) => api.post(`/laporan/${id}/reviewers`, { reviewerIds }),
  removeReviewer: (id, reviewerId) => api.delete(`/laporan/${id}/reviewers/${reviewerId}`),

  // Reviewer
  getTugasan: (params = {}) => api.get('/laporan/tugasan', { params }),
  getReviews: (id) => api.get(`/laporan/${id}/reviews`),
  submitReview: (id, data) => api.post(`/laporan/${id}/reviews`, data),
  finalizeReview: (id) => api.post(`/laporan/${id}/reviews/finalize`),
}
