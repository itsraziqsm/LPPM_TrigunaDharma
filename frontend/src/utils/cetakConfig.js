// Konfigurasi dokumen cetak (Cetak Dokumen). Backend belum punya endpoint untuk
// menyimpan konfigurasi/arsip dokumen (docs/waitingApi-list.md W-32), jadi
// "SOP Frontend": disimpan di localStorage peramban ini saja.
const PREFIX = 'cetakDokumen:'

export function loadCetakConfig(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveCetakConfig(key, data) {
  const value = { ...data, savedAt: new Date().toISOString() }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* penyimpanan tidak tersedia: abaikan */
  }
  return value
}

export function clearCetakConfig(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* abaikan */
  }
}

// Tanggal panjang Indonesia dari 'YYYY-MM-DD' atau ISO.
export function tanggalPanjang(v) {
  if (!v) return ''
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}
