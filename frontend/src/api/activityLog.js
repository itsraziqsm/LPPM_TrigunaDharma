import api from './axios'

export const activityLogApi = {
  // + kategori, search, dari, sampai (YYYY-MM-DD) — W-53
  getAll: (params) => api.get('/activity-logs', { params }),
  ringkasan: (params) => api.get('/activity-logs/ringkasan', { params }),
}
