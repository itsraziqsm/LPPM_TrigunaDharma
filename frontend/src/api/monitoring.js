import api from './axios'

// Pemantauan proposal (W-37, new-api.md bagian 24) — ketua_stmik, ketua_lppm, admin; baca saja.
// Filter bersama: periodeId, tahun, jenis, search, termasukDraft=true.
export const monitoringApi = {
  ringkasan: (params = {}) => api.get('/monitoring/ringkasan', { params }),
  // + status, urut (terbaru|anggaran|judul|pengusul), page, limit
  proposals: (params = {}) => api.get('/monitoring/proposals', { params }),
  dosen: (params = {}) => api.get('/monitoring/dosen', { params }),
}
