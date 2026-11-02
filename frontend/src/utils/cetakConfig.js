import { cetakApi } from '../api/cetak'

// Konfigurasi dokumen cetak (Cetak Dokumen) — satu konfigurasi bersama untuk semua Admin/Ketua di server
// (W-42: GET/PUT /cetak/konfigurasi/:dokumen). localStorage = cache agar halaman langsung terisi:
//   loadCetakConfig(key)   — sinkron dari cache
//   muatCetakConfig(key)   — ambil dari server, timpa cache, kembalikan nilai (null bila belum pernah disimpan)
//   saveCetakConfig(key,v) — tulis cache + PUT di latar; clearCetakConfig(key) — kosongkan (PUT null)
const PREFIX = 'cetakDokumen:'
const DOKUMEN = { rekapProposal: 'rekap-proposal', suratTugas: 'surat-tugas', tabelPengguna: 'tabel-pengguna', luaranDosen: 'luaran-dosen' }

const tulisCache = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* abaikan */
  }
}

export async function muatCetakConfig(key) {
  const dok = DOKUMEN[key]
  if (!dok) return loadCetakConfig(key)
  try {
    const r = await cetakApi.getKonfigurasi(dok)
    const d = r.data.data || {}
    const value = d.konfigurasi ? { ...d.konfigurasi, savedAt: d.updatedAt || d.konfigurasi.savedAt, savedBy: d.updatedBy?.fullName || d.updatedBy?.name || null } : null
    tulisCache(key, value)
    return value
  } catch {
    return loadCetakConfig(key)
  }
}

const kirim = (key, value) => {
  const dok = DOKUMEN[key]
  if (!dok) return
  const isi = value ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'savedAt' && k !== 'savedBy')) : null
  cetakApi.putKonfigurasi(dok, isi).catch(() => {
    /* tetap tersimpan di cache peramban ini */
  })
}

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
  tulisCache(key, value)
  kirim(key, value)
  return value
}

export function clearCetakConfig(key) {
  tulisCache(key, null)
  kirim(key, null)
}

// Tanggal panjang Indonesia dari 'YYYY-MM-DD' atau ISO.
export function tanggalPanjang(v) {
  if (!v) return ''
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}
