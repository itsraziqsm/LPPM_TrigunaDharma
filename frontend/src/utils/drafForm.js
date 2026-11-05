// ---------------------------------------------------------------------------
// Penyimpanan draf isian formulir di peramban (localStorage), dipakai hooks/useDrafForm.js.
// Kunci `drafForm:<userId|tamu>:<nama>`; nilai { v, at }; kedaluwarsa 7 hari. Dihapus saat isian berhasil disimpan
// ke server dan semua draf milik user dihapus saat logout (authStore). Password & file TIDAK pernah disimpan —
// pemanggil wajib hanya mengirim isian teks/pilihan.
// ---------------------------------------------------------------------------

const PREFIX = 'drafForm:'
const UMUR_MS = 7 * 24 * 60 * 60 * 1000

export const kunciDraf = (userId, nama) => `${PREFIX}${userId ?? 'tamu'}:${nama}`

export function bacaDraf(kunci) {
  try {
    const raw = localStorage.getItem(kunci)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || Date.now() - (d.at || 0) > UMUR_MS) {
      localStorage.removeItem(kunci)
      return null
    }
    return d.v
  } catch {
    return null
  }
}

export function tulisDraf(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify({ v: nilai, at: Date.now() }))
  } catch {
    /* penyimpanan penuh / diblokir — abaikan */
  }
}

export function hapusDraf(kunci) {
  try {
    localStorage.removeItem(kunci)
  } catch {
    /* abaikan */
  }
}

// Hapus semua draf milik user (logout) — juga draf tamu.
export function hapusSemuaDraf(userId) {
  try {
    const awalan = [`${PREFIX}${userId}:`, `${PREFIX}tamu:`]
    Object.keys(localStorage)
      .filter((k) => awalan.some((a) => k.startsWith(a)))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* abaikan */
  }
}

export const samaNilai = (a, b) => JSON.stringify(a) === JSON.stringify(b)
