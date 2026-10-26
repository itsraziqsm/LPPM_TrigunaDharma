import api from './axios'

// Hapus proposal/laporan yang sudah diajukan dengan izin Ketua LPPM (W-34, new-api.md bagian 23).
// tipe: 'proposal' | 'laporan' → prefix route /proposals atau /laporan.
const base = (tipe) => (tipe === 'laporan' ? '/laporan' : '/proposals')

export const dokumenHapusApi = {
  // Admin: { password, alasan (5–1000) }
  request: (tipe, id, data) => api.post(`${base(tipe)}/${id}/deletion-request`, data),
  // Admin & Ketua: permintaan yang menunggu untuk dokumen itu (data: null bila tidak ada)
  pending: (tipe, id) => api.get(`${base(tipe)}/${id}/deletion-request`),
  // Admin & Ketua: daftar permintaan (?status=pending|approved|rejected|cancelled&tipe=proposal|laporan)
  list: (params = {}) => api.get('/dokumen/deletion-request', { params }),
  // Ketua: setujui → dokumen dihapus
  approve: (requestId, password) => api.post(`/dokumen/deletion-request/${requestId}/approve`, { password }),
  // Admin peminta = batal, Ketua = tolak; catatan opsional
  cancel: (requestId, catatan) =>
    api.post(`/dokumen/deletion-request/${requestId}/cancel`, catatan ? { catatan } : {}),
}

export function pesanGalat(e, fallback) {
  const errs = e.response?.data?.errors
  if (errs) return Object.values(errs).flat().join(' ')
  return e.response?.data?.message || fallback
}
