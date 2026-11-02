import api from './axios'

// Riwayat per user lintas perangkat (W-47, new-api.md bagian 29.1). Respons tulis = riwayat terbaru
// { halaman: [{path, at}], cari: [{to, title, subtitle, badge, at}] }.
export const riwayatApi = {
  get: () => api.get('/users/profile/riwayat'),
  catatHalaman: (path) => api.post('/users/profile/riwayat/halaman', { path }),
  catatCari: (item) => api.post('/users/profile/riwayat/cari', item),
  hapusCari: () => api.delete('/users/profile/riwayat/cari'),
}
