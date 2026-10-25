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
