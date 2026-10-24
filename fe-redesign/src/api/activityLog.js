import api from './axios'

export const activityLogApi = {
  getAll: (params) => api.get('/activity-logs', { params }),
}
