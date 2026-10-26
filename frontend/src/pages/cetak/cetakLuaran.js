import { luaranApi } from '../../api/luaran'
import { simpanBlob } from '../../utils/unduhBlob'

// Cetak Luaran Dosen (admin): Unduh semua bukti (ZIP) dan/atau Unduh CSV (pemisah ";")
// dengan filter konfigurasi (GET /luaran/unduh-zip|unduh-csv, maks 1000 luaran).

// Galat respons blob (CSV/ZIP) → teks pesan.
export async function pesanBlob(e, fallback) {
  const data = e.response?.data
  if (data instanceof Blob) {
    try {
      const j = JSON.parse(await data.text())
      if (j.errors) return Object.values(j.errors).flat().join(' ')
      return j.message || fallback
    } catch {
      return fallback
    }
  }
  return e.response?.data?.message || fallback
}

export async function unduhLuaran(cfg) {
  const filter = Object.fromEntries(Object.entries(cfg?.filter || {}).filter(([, v]) => v !== '' && v != null))
  if (cfg?.zip !== false) simpanBlob(await luaranApi.unduhZip(filter), 'luaran.zip')
  if (cfg?.csv !== false) simpanBlob(await luaranApi.unduhCsv({ ...filter, pemisah: 'titikkoma' }), 'rekap-luaran.csv')
}
