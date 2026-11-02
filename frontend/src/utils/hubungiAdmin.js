import { kontakAdminApi } from '../api/kontakAdmin'
import { teksJejak } from './jejakSaatIni'

// Hubungi Admin lewat WhatsApp (wa.me) dengan pesan templat.
// Nomor dari GET /kontak-admin (W-50, diatur admin di Pengaturan); kosong → cadangan env VITE_ADMIN_WA.
export const NOMOR_ADMIN_WA_ENV = String(import.meta.env.VITE_ADMIN_WA || '').replace(/\D/g, '').replace(/^0/, '62')

let kontak = null // data terakhir dari server
let janji = null

// Muat (sekali, di-cache) kontak admin. `paksa` = abaikan cache (setelah admin mengubahnya).
export function muatKontakAdmin(paksa = false) {
  if (!janji || paksa) {
    janji = kontakAdminApi
      .get()
      .then((r) => {
        kontak = r.data.data || null
        return kontak
      })
      .catch(() => {
        janji = null
        return kontak
      })
  }
  return janji
}

export const setKontakAdmin = (data) => {
  kontak = data
  janji = Promise.resolve(data)
}

export const kontakTermuat = () => kontak
export const nomorAdmin = () => kontak?.whatsapp || NOMOR_ADMIN_WA_ENV

export function pesanKendala({ nama, peran }) {
  return [
    `Halo admin, saya mengalami kendala di "${teksJejak()}", dimana ...`,
    'Terima kasih atas perhatiannya.',
    `- ${nama || 'Pengguna'}, ${peran || '-'}`,
  ].join('\n')
}

export const tautanWhatsApp = (pesan, nomor = nomorAdmin()) => `https://wa.me/${nomor}?text=${encodeURIComponent(pesan)}`
