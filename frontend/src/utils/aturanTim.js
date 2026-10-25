// Aturan komposisi tim proposal (anggota SELAIN ketua pengusul), per jenis kegiatan.
//   Pengabdian : dosen tepat 2, mahasiswa tepat 1
//   Penelitian : dosen minimal 2, mahasiswa minimal 0 (bebas)
// Ubah di sini bila ketentuan LPPM berubah; dipakai validasi & keterangan wizard Usulan.
export const ATURAN_TIM = {
  pengabdian: { dosen: { min: 2, max: 2 }, mahasiswa: { min: 1, max: 1 } },
  penelitian: { dosen: { min: 2 }, mahasiswa: { min: 0 } },
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
