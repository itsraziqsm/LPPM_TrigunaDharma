import api from './axios'

export const reviewerApi = {
  // Daftar tugasan review milik reviewer yang login
  getMyTugasan: (params = {}) => api.get('/reviewer/my-tugasan', { params }),

  // Submit nilai review ke suatu proposal
  submitReview: (proposalId, data) => api.post(`/proposals/${proposalId}/reviews`, data),

  // Finalisasi review (tandai selesai)
  finalizeReview: (proposalId) => api.post(`/proposals/${proposalId}/reviews/finalize`),

  // Lihat semua review suatu proposal (termasuk milik reviewer lain jika ketua)
  getReviews: (proposalId) => api.get(`/proposals/${proposalId}/reviews`),
}
