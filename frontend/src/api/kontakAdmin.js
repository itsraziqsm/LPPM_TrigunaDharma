import api from './axios'

// Kontak admin (W-50, new-api.md bagian 29.2): GET semua peran login; PATCH admin
// ({ whatsapp?, nama?, jamLayanan? }, nomor dinormalisasi server ke 62…).
export const kontakAdminApi = {
  get: () => api.get('/kontak-admin'),
  update: (data) => api.patch('/kontak-admin', data),
}
