import api from './axios'

export const proposalApi = {
  // Semua proposal (admin & ketua_lppm)
  getAll: (params = {}) => api.get('/proposals', { params }),

  // Detail lengkap proposal by ID
  getById: (id) => api.get(`/proposals/${id}`),

  // Proposal milik user sendiri
  getMy: (params = {}) => api.get('/proposals/my', { params }),

  // Update status proposal (ketua_lppm)
  updateStatus: (id, data) => api.patch(`/proposals/${id}/status`, data),

  // Hapus proposal
  delete: (id) => api.delete(`/proposals/${id}`),

  // ── Reviewer ──────────────────────────────────────
  // Tugaskan reviewer ke proposal
  tugaskanReviewer: (proposalId, data) =>
    api.post(`/proposals/${proposalId}/reviewers`, data),

  // Hapus reviewer dari proposal
  hapusReviewer: (proposalId, reviewerId) =>
    api.delete(`/proposals/${proposalId}/reviewers/${reviewerId}`),

  // Lihat semua review suatu proposal
  getReviews: (proposalId) => api.get(`/proposals/${proposalId}/reviews`),

  // ── Laporan ───────────────────────────────────────
  getLaporan: (proposalId) => api.get(`/proposals/${proposalId}/laporan`),

  // ── Dokumen Lampiran ──────────────────────────────
  getDokumen: (proposalId) => api.get(`/proposals/${proposalId}/dokumen`),
}
