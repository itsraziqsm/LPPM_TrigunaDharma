import api from './axios'

export const usersApi = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  updateStatus: (id, status) => api.patch(`/users/${id}/status`, { status }),
  assignRoles: (id, roles) => api.patch(`/users/${id}/roles`, { roles }),
  // Hak akses reviewer dosen (new-api.md bagian 16) — admin & ketua
  getReviewerStatus: (id) => api.get(`/users/${id}/reviewer`),
  setReviewer: (id, isReviewer) => api.patch(`/users/${id}/reviewer`, { isReviewer }),
  // Cabut paksa (khusus Ketua LPPM): pengalihan = [{ tugasanId, reviewerBaruId }]
  // otomatis = true → tugasan yang tidak ada di pengalihan diisi reviewer rekomendasi (W-32)
  forceRevokeReviewer: (id, pengalihan, otomatis = false) =>
    api.post(`/users/${id}/reviewer/force-revoke`, otomatis ? { pengalihan, otomatis: true } : { pengalihan }),
  // Reviewer urut beban (tugasan aktif paling sedikit dulu): { itemId, exclude } → prioritas, sudahDitugaskan (W-32)
  getKandidatReviewer: (params = {}) => api.get('/users/kandidat-reviewer', { params }),
  deleteUser: (id) => api.delete(`/users/${id}`),
  // Search user by role untuk dropdown (semua authenticated user bisa akses)
  search: (params) => api.get('/users/search', { params }),
  // Profile endpoints
  updateProfile: (data) => api.patch('/users/profile/me', data),
  changePassword: (oldPassword, newPassword) =>
    api.patch('/users/profile/password', { oldPassword, newPassword }),
  getProfile: () => api.get('/users/profile/me'),
  // Foto profil (JPG/PNG/WebP, maks 2 MB). URL gambar: API_BASE_URL + user.fotoUrl
  uploadFoto: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/users/profile/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deleteFoto: () => api.delete('/users/profile/foto'),
  // Unduh data akun (file JSON, tanpa envelope)
  exportAccount: () => api.get('/users/profile/export', { responseType: 'blob' }),
  // Hapus (nonaktifkan & anonimkan) akun sendiri — wajib logout setelahnya
  deleteAccount: (password) => api.delete('/users/profile/me', { data: { password } }),
}
