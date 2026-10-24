import api from './axios'

export const notificationApi = {
    getAll: (params) => api.get('/notifications', { params }),
    markRead: (id) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.patch('/notifications/read-all'),
    delete: (id) => api.delete(`/notifications/${id}`),
}