import api from './axios'

// Cetak Dokumen (W-42, new-api.md bagian 30.3) — admin & Ketua LPPM.
//   Konfigurasi bersama per dokumen: rekap-proposal | surat-tugas | tabel-pengguna | luaran-dosen
//   Surat tugas: POST = nomor otomatis + arsip; GET daftar (?kegiatanId, ?tahun, page, limit) / detail.
export const cetakApi = {
  getKonfigurasi: (dokumen) => api.get(`/cetak/konfigurasi/${dokumen}`),
  putKonfigurasi: (dokumen, konfigurasi) => api.put(`/cetak/konfigurasi/${dokumen}`, { konfigurasi }),
  buatSuratTugas: (data) => api.post('/surat-tugas', data),
  daftarSuratTugas: (params = {}) => api.get('/surat-tugas', { params }),
  getSuratTugas: (id) => api.get(`/surat-tugas/${id}`),
}
