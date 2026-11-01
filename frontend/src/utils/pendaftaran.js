// ---------------------------------------------------------------------------
// Registrasi — satu identitas satu pendaftaran (W-48, docs/waitingApi-list.md).
//   validasiDaftar(role, form) → { field: pesan } : email valid, NIDN (dosen) angka ≥ 10 digit,
//                                 NIRM (mahasiswa, field API `nim`) tepat 10 digit.
//   simpanPendaftaran / bacaPendaftaran / hapusPendaftaran — penanda di localStorage (KENYAMANAN saja,
//   bukan pengaman: penguncian sebenarnya per identitas di server). Kedaluwarsa 30 hari.
//   samarkanEmail('budi@kampus.ac.id') → 'bu***@kampus.ac.id'
// ---------------------------------------------------------------------------

const KUNCI = 'pendaftaranTerkirim'
const BERLAKU_MS = 30 * 24 * 60 * 60 * 1000

// Format email umum: tanpa spasi, satu "@", domain ber-titik dengan TLD ≥ 2 huruf.
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

export const ATURAN_ID = {
  dosen: { field: 'nidn', label: 'NIDN', pola: /^\d{10,}$/, pesan: 'NIDN hanya angka, minimal 10 digit.' },
  mahasiswa: { field: 'nim', label: 'NIRM', pola: /^\d{10}$/, pesan: 'NIRM harus tepat 10 digit angka.' },
}

export const rapikanEmail = (v) => String(v || '').trim().toLowerCase()

export function validasiDaftar(role, form) {
  const err = {}
  if (!String(form.name || '').trim()) err.name = 'Nama lengkap wajib diisi.'
  const email = rapikanEmail(form.email)
  if (!email) err.email = 'Email wajib diisi.'
  else if (!POLA_EMAIL.test(email)) err.email = 'Format email tidak valid (contoh: nama@email.com).'
  if (String(form.password || '').length < 8) err.password = 'Password minimal 8 karakter.'
  const aturan = ATURAN_ID[role]
  const id = String(form[aturan.field] || '')
  if (!id) err[aturan.field] = `${aturan.label} wajib diisi.`
  else if (!aturan.pola.test(id)) err[aturan.field] = aturan.pesan
  return err
}

export function samarkanEmail(email) {
  const [nama, domain] = String(email || '').split('@')
  if (!domain) return email || ''
  return `${nama.slice(0, 2)}***@${domain}`
}

export function simpanPendaftaran({ email, role, createdAt }) {
  try {
    localStorage.setItem(KUNCI, JSON.stringify({ email: samarkanEmail(email), role, createdAt: createdAt || new Date().toISOString(), at: Date.now() }))
  } catch {
    /* abaikan */
  }
}

export function bacaPendaftaran() {
  try {
    const v = JSON.parse(localStorage.getItem(KUNCI) || 'null')
    if (!v || Date.now() - (v.at || 0) > BERLAKU_MS) return null
    return v
  } catch {
    return null
  }
}

export function hapusPendaftaran() {
  try {
    localStorage.removeItem(KUNCI)
  } catch {
    /* abaikan */
  }
}
