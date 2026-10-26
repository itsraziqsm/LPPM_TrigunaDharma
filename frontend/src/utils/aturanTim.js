// Aturan komposisi tim proposal (anggota SELAIN ketua pengusul), per jenis kegiatan.
//   Penelitian : dosen 0–5, mahasiswa minimal 1 (tanpa batas maksimal)
//   Pengabdian : dosen 1–5, mahasiswa minimal 1 (tanpa batas maksimal)
// Sama dengan pengecekan backend saat submit (komposisi_tim.go, new-api.md bagian 18).
// Ubah di sini bila ketentuan LPPM berubah; dipakai validasi & keterangan wizard Usulan.
export const ATURAN_TIM = {
  penelitian: { dosen: { min: 0, max: 5 }, mahasiswa: { min: 1 } },
  pengabdian: { dosen: { min: 1, max: 5 }, mahasiswa: { min: 1 } },
}

const LABEL = { dosen: 'dosen', mahasiswa: 'mahasiswa' }

// "tepat 2" | "minimal 2" | "bebas"
export function aturanTeks(r) {
  if (!r) return 'bebas'
  if (r.max != null && r.max === r.min) return `tepat ${r.min}`
  if (r.min > 0 && r.max != null) return `${r.min}–${r.max}`
  if (r.min > 0) return `minimal ${r.min}`
  return r.max != null ? `maksimal ${r.max}` : 'bebas'
}

export function hitungTim(anggota) {
  return {
    dosen: anggota.filter((a) => a.kind !== 'mahasiswa').length,
    mahasiswa: anggota.filter((a) => a.kind === 'mahasiswa').length,
  }
}

// Daftar pelanggaran aturan (kosong = sesuai).
export function pelanggaranTim(jenis, anggota) {
  const aturan = ATURAN_TIM[jenis]
  if (!aturan) return []
  const n = hitungTim(anggota)
  const out = []
  for (const kind of ['dosen', 'mahasiswa']) {
    const r = aturan[kind]
    if (!r) continue
    if (n[kind] < r.min || (r.max != null && n[kind] > r.max)) {
      out.push(`anggota ${LABEL[kind]} ${aturanTeks(r)} (sekarang ${n[kind]})`)
    }
  }
  return out
}

// Sudah mencapai batas maksimum untuk jenis anggota tertentu?
export function timPenuh(jenis, anggota, kind) {
  const r = ATURAN_TIM[jenis]?.[kind]
  return r?.max != null && hitungTim(anggota)[kind] >= r.max
}
