import api from './axios'

export const authApi = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  registerDosen: (data) =>
    api.post('/auth/register/dosen', data),

  registerMahasiswa: (data) =>
    api.post('/auth/register/mahasiswa', data),

  logout: (refreshToken) =>
    api.post('/auth/logout', { refreshToken }),

  me: () =>
    api.get('/auth/me'),
}
