import api from './axios'

// Item luaran (output kegiatan) per proposal — new-api.md bagian 12.1.
// Target diubah saat proposal draft/revisi; capaian & bukti setelah proposal
// disetujui dan selama laporan belum diajukan.
export const LUARAN_JENIS = {
  jurnal: 'Jurnal',
  prosiding: 'Prosiding',
  hki: 'HKI',
  buku: 'Buku',
  produk: 'Produk / TTG',
  media_massa: 'Media massa',
  lainnya: 'Lainnya',
}

export const luaranApi = {
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
  stats: () => api.get('/luaran/stats'), // { total, tercapai, dapatDiklaim, jurnal, perJenis }
}
