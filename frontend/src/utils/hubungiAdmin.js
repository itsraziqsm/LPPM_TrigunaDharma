import { teksJejak } from './jejakSaatIni'

// Hubungi Admin lewat WhatsApp (wa.me) dengan pesan templat.
// Nomor admin dari env VITE_ADMIN_WA (format internasional, mis. 6281234567890). Belum ada API
// kontak admin → ApiPending W-50 (lihat docs/waitingApi-list.md).
export const NOMOR_ADMIN_WA = String(import.meta.env.VITE_ADMIN_WA || '').replace(/\D/g, '').replace(/^0/, '62')

export function pesanKendala({ nama, peran }) {
  return [
    `Halo admin, saya mengalami kendala di "${teksJejak()}", dimana ...`,
    'Terima kasih atas perhatiannya.',
    `- ${nama || 'Pengguna'}, ${peran || '-'}`,
  ].join('\n')
}

export const tautanWhatsApp = (pesan) => `https://wa.me/${NOMOR_ADMIN_WA}?text=${encodeURIComponent(pesan)}`
