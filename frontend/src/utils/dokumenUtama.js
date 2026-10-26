import api from '../api/axios'
import { alertDialog } from './dialog'

// Buka/unduh dokumen utama proposal (GET /proposals/:id/dokumen-utama, perlu token → blob).
// PDF dibuka di tab baru; format lain diunduh dengan nama aslinya.
export async function bukaDokumenUtama(id, namaFile) {
  try {
    const res = await api.get(`/proposals/${id}/dokumen-utama`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    if (namaFile && !String(res.data.type).includes('pdf')) a.download = namaFile
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    alertDialog({ title: 'Gagal membuka dokumen', message: 'Dokumen utama tidak dapat dibuka. Coba lagi.' })
  }
}
