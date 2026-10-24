// Sinkronisasi notifikasi antara lonceng (NotificationBell) dan halaman
// /notifikasi: pihak yang mengubah data memancarkan event ini dengan
// `source`-nya sendiri, pihak lain memuat ulang.
export const NOTIF_EVENT = 'notifications-changed'

export function notifyNotificationsChanged(source) {
  window.dispatchEvent(new CustomEvent(NOTIF_EVENT, { detail: { source } }))
}
