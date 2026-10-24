import api from './axios'

export const exportApi = {
  getProposals: (params = {}) => api.get('/export/proposals', { params }),
}
