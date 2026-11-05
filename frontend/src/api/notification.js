import api from './axios'

export const notificationApi = {
    // + kategori=kegiatan|keputusan|review|admin (W-56)
    getAll: (params) => api.get('/notifications', { params }),
    // { belumDibaca, perKategori: { kegiatan: { total, belumDibaca }, … } } (W-56)
    ringkasan: () => api.get('/notifications/ringkasan'),
    markRead: (id) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.patch('/notifications/read-all'),
    delete: (id) => api.delete(`/notifications/${id}`),
}