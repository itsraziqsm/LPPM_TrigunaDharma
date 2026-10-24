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
}
