import api from './axios'

// Template proposal yang bisa diganti admin (W-36, new-api.md bagian 21).
// jenis: 'umum' | 'penelitian' | 'pengabdian'. Endpoint /aktif* publik.
export const templateProposalApi = {
  aktif: (jenis) => api.get('/template-proposal/aktif', { params: { jenis } }),
  // Admin
  getAll: (params = {}) => api.get('/template-proposal', { params }),
  upload: ({ file, jenis, tahun, keterangan }) => {
    const fd = new FormData()
    fd.append('file', file)
    if (jenis) fd.append('jenis', jenis)
    if (tahun) fd.append('tahun', String(tahun))
    if (keterangan) fd.append('keterangan', keterangan)
    return api.post('/template-proposal', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  download: (id) => api.get(`/template-proposal/${id}/unduh`, { responseType: 'blob' }),
  aktifkan: (id) => api.patch(`/template-proposal/${id}/aktifkan`),
  remove: (id) => api.delete(`/template-proposal/${id}`),
}
