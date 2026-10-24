import api from './axios'

export const usersApi = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  updateStatus: (id, status) => api.patch(`/users/${id}/status`, { status }),
  assignRoles: (id, roles) => api.patch(`/users/${id}/roles`, { roles }),
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
