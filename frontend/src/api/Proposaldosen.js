import api from './axios'

export const proposalDosenApi = {
    getStats: (params = {}) => api.get('/dosen/proposals/stats', { params }), // { jenis }
    // Proposal milik orang lain tempat user menjadi anggota (undangan diterima)
    getAsMember: (params = {}) => api.get('/dosen/proposals/as-member', { params }),
    getAll: (params = {}) => api.get('/dosen/proposals', { params }),
    getById: (id) => api.get(`/dosen/proposals/${id}`),
    create: (data) => api.post('/dosen/proposals', data),
    update: (id, data) => api.patch(`/dosen/proposals/${id}`, data),
    submit: (id) => api.post(`/dosen/proposals/${id}/submit`),
    delete: (id) => api.delete(`/dosen/proposals/${id}`),
    searchMembers: (q) => api.get('/dosen/proposals/members/search', { params: { q } }),
    getMyInvitations: () => api.get('/dosen/proposals/invitations'),
    respondInvitation: (id, status) => api.patch(`/dosen/proposals/invitations/${id}`, { status }),

    // Upload dokumen utama (PDF/DOCX) — kirim sebagai FormData
    uploadDokumen: (proposalId, file) => {
        const form = new FormData()
        form.append('file', file)
        return api.post(`/proposals/${proposalId}/dokumen-utama`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
    },

    // URL untuk download / view langsung di browser (pakai token dari localStorage)
    getDokumenUrl: (proposalId) => {
        const base = api.defaults.baseURL || ''
        return `${base}/proposals/${proposalId}/dokumen-utama`
    },
}
