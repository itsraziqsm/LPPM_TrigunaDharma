import api from './axios'

export const proposalDosenApi = {
    getStats: (params = {}) => api.get('/dosen/proposals/stats', { params }), // { jenis }
    // Proposal milik orang lain tempat user menjadi anggota (undangan diterima)
    getAsMember: (params = {}) => api.get('/dosen/proposals/as-member', { params }),
    // Nilai kepercayaan { nilai (0–5 | null), skala, komponen[] }; admin/ketua boleh { userId }
    getKepercayaan: (params = {}) => api.get('/dosen/kepercayaan', { params }),
    getAll: (params = {}) => api.get('/dosen/proposals', { params }),
    getById: (id) => api.get(`/dosen/proposals/${id}`),
    // Detail + metadata dokumen utama. Respons /dosen/proposals/:id (bentuk Node) tidak memuat
    // dokumenNama/Mime/Ukuran walau file sudah tersimpan; GET /proposals/:id (boleh untuk
    // pengusul) memuatnya, jadi field itu digabungkan. Bentuk respons sama dengan getById.
    getByIdLengkap: async (id) => {
        const [res, meta] = await Promise.all([
            api.get(`/dosen/proposals/${id}`),
            api.get(`/proposals/${id}`).catch(() => null),
        ])
        const m = meta?.data?.data
        if (m && res.data?.data) {
            const { dokumenNama, dokumenMime, dokumenUkuran, dokumenUrl } = m
            Object.assign(res.data.data, { dokumenNama, dokumenMime, dokumenUkuran, dokumenUrl: res.data.data.dokumenUrl ?? dokumenUrl })
        }
        return res
    },
    create: (data) => api.post('/dosen/proposals', data),
    update: (id, data) => api.patch(`/dosen/proposals/${id}`, data),
    submit: (id) => api.post(`/dosen/proposals/${id}/submit`),
    delete: (id) => api.delete(`/dosen/proposals/${id}`),
    searchMembers: (q) => api.get('/dosen/proposals/members/search', { params: { q } }),
    getMyInvitations: () => api.get('/dosen/proposals/invitations'),
    // Detail undangan (W-35/W-41): undangan + proposal (+ aksesPenuh, targetLuaran, dokumenUtama).
    getInvitation: (id) => api.get(`/dosen/proposals/invitations/${id}`),
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
