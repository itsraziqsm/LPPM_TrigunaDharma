// Kunci konfigurasi & helper dokumen di menu Cetak Dokumen.
export const REKAP_KEY = 'rekapProposal'
export const SURAT_TUGAS_KEY = 'suratTugas'

// Konfigurasi Surat Tugas → data cetak (hanya petugas yang dicentang).
export function suratTugasData(cfg) {
  return { ...cfg, petugas: (cfg.petugas || []).filter((p) => p.ikut) }
}

// Ringkasan filter rekap untuk ditampilkan di kartu.
export function rekapRingkas(cfg) {
  if (!cfg) return 'Semua data (bawaan)'
  const parts = []
  if (cfg.periodeNama) parts.push(cfg.periodeNama)
  if (cfg.jenis) parts.push(cfg.jenis === 'penelitian' ? 'Penelitian' : 'Pengabdian')
  if (cfg.status) parts.push(`status ${cfg.status}`)
  if (cfg.tahun) parts.push(`tahun ${cfg.tahun}`)
  return parts.length ? parts.join(' · ') : 'Semua data'
}

export const PENGGUNA_KEY = 'tabelPengguna'
export const LUARAN_KEY = 'luaranDosen'

export const PERAN_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
  ketua_stmik: 'Ketua STMIK',
  dosen: 'Dosen',
  reviewer: 'Reviewer',
  mahasiswa: 'Mahasiswa',
}

// Ringkasan konfigurasi Tabel Pengguna: semua peran atau daftar peran terpilih.
export function penggunaRingkas(cfg) {
  if (!cfg || cfg.semua !== false || !cfg.roles?.length) return 'Semua peran'
  return cfg.roles.map((r) => PERAN_LABEL[r] || r).join(', ')
}

// Filter luaran yang bisa dikonfigurasi (tanpa jenis luaran & prioritas) + label nilainya.
export const LUARAN_FILTER = {
  search: { label: 'Kata kunci' },
  status: { label: 'Status capaian', nilai: { tercapai: 'Tercapai', belum: 'Belum' } },
  dapatDiklaim: { label: 'Dapat diklaim', nilai: { true: 'Ya', false: 'Tidak' } },
  adaBukti: { label: 'Bukti', nilai: { true: 'Ada bukti', false: 'Tanpa bukti' } },
  jenisKegiatan: { label: 'Kegiatan', nilai: { penelitian: 'Penelitian', pengabdian: 'Pengabdian' } },
  periodeId: { label: 'Periode' },
}

export function luaranRingkas(cfg) {
  const keluaran = cfg ? [cfg.zip !== false ? 'ZIP bukti' : null, cfg.csv !== false ? 'CSV' : null].filter(Boolean) : ['ZIP bukti', 'CSV']
  const f = cfg?.filter || {}
  const parts = Object.entries(LUARAN_FILTER)
    .filter(([k]) => f[k])
    .map(([k, d]) => (k === 'periodeId' ? cfg.periodeNama || `periode #${f[k]}` : k === 'search' ? `"${f[k]}"` : d.nilai?.[f[k]] || f[k]))
  return `${keluaran.join(' + ')} · ${parts.length ? parts.join(' · ') : 'semua luaran'}`
}
