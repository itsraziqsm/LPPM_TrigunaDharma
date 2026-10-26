import api from './axios'

// Item luaran (output kegiatan) per proposal — new-api.md bagian 12.1.
// Target diubah saat proposal draft/revisi; capaian & bukti setelah proposal
// disetujui dan selama laporan belum diajukan.
// Label cadangan; daftar resmi (+ prioritas) dari GET /luaran/jenis (W-38).
// Jurnal & poster = luaran prioritas (selalu di atas, bukan wajib).
export const LUARAN_JENIS = {
  jurnal: 'Jurnal',
  poster: 'Poster',
  prosiding: 'Prosiding',
  hki: 'HKI',
  buku: 'Buku',
  produk: 'Produk / TTG',
  media_massa: 'Media massa',
  lainnya: 'Lainnya',
}

export const LUARAN_PRIORITAS = ['jurnal', 'poster']

// Cadangan bila GET /luaran/jenis gagal: [{ kode, label, prioritas }]
export const LUARAN_JENIS_LIST = Object.entries(LUARAN_JENIS).map(([kode, label]) => ({
  kode,
  label,
  prioritas: LUARAN_PRIORITAS.includes(kode),
}))

export const luaranApi = {
  jenis: () => api.get('/luaran/jenis'), // [{ kode, label, prioritas }]
  // Admin (W-38): semua luaran + filter/paginasi, unduh CSV/ZIP (blob)
  getAll: (params = {}) => api.get('/luaran', { params }),
  unduhCsv: (params = {}) => api.get('/luaran/unduh-csv', { params, responseType: 'blob' }),
  unduhZip: (params = {}) => api.get('/luaran/unduh-zip', { params, responseType: 'blob' }),
  byProposal: (proposalId) => api.get(`/luaran/proposal/${proposalId}`),
  create: (data) => api.post('/luaran', data), // { proposalId, jenis, target, targetTanggal? }
  update: (id, data) => api.patch(`/luaran/${id}`, data),
  remove: (id) => api.delete(`/luaran/${id}`),
  saveCapaian: (id, data) => api.patch(`/luaran/${id}/capaian`, data),
  uploadBukti: (id, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/luaran/${id}/bukti`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  downloadBukti: (id) => api.get(`/luaran/${id}/bukti`, { responseType: 'blob' }),
  stats: () => api.get('/luaran/stats'), // { total, tercapai, dapatDiklaim, jurnal, poster, perJenis }
}
