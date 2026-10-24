/**
 * Export Excel menggunakan SheetJS (xlsx)
 * Install: npm install xlsx
 * Atau pakai CDN: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js
 */
import * as XLSX from 'xlsx'

export function exportToExcel(data, filter = {}) {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Data Proposal ─────────────────────────────────────────────────
  const headers = [
    'No', 'ID', 'Judul Proposal', 'Jenis', 'Status',
    'Pengusul', 'NIDN', 'Program Studi',
    'Periode', 'Anggaran (Rp)',
    'Anggota Tim', 'Reviewer',
    'Jumlah Review', 'Review Selesai',
    'Catatan Revisi',
    'Tgl Diajukan', 'Tgl Disetujui', 'Tgl Dibuat',
  ]

  const rows = data.rows.map((r) => [
    r.no, r.id, r.judul, r.jenis, r.status,
    r.pengusul, r.nidn, r.programStudi,
    r.periode,
    r.anggaran === '-' ? '' : Number(String(r.anggaran).replace(/\D/g, '')),
    r.anggota, r.reviewer,
    r.jumlahReview, r.reviewSelesai,
    r.catatanRevisi === '-' ? '' : r.catatanRevisi,
    r.submittedAt === '-' ? '' : r.submittedAt,
    r.approvedAt === '-' ? '' : r.approvedAt,
    r.createdAt,
  ])

  const wsData = [headers, ...rows]
  const ws1 = XLSX.utils.aoa_to_sheet(wsData)

  // Lebar kolom
  ws1['!cols'] = [
    { wch: 5 }, { wch: 6 }, { wch: 45 }, { wch: 14 }, { wch: 18 },
    { wch: 25 }, { wch: 16 }, { wch: 25 },
    { wch: 25 }, { wch: 18 },
    { wch: 35 }, { wch: 25 },
    { wch: 15 }, { wch: 15 },
    { wch: 30 },
    { wch: 15 }, { wch: 15 }, { wch: 15 },
  ]

  XLSX.utils.book_append_sheet(wb, ws1, 'Data Proposal')

  // ── Sheet 2: Ringkasan ─────────────────────────────────────────────────────
  const filterParts = []
  if (filter.periodeNama) filterParts.push(['Periode', filter.periodeNama])
  if (filter.jenis) filterParts.push(['Jenis', filter.jenis === 'penelitian' ? 'Penelitian' : 'Pengabdian'])
  if (filter.status) filterParts.push(['Status', filter.status])
  if (filter.tahun) filterParts.push(['Tahun', filter.tahun])
  if (filter.programStudi) filterParts.push(['Program Studi', filter.programStudi])

  const ringkasanData = [
    ['LAPORAN REKAPITULASI PROPOSAL - LPPM'],
    [`Digenerate: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`],
    [],
    ['FILTER AKTIF'],
    ...(filterParts.length > 0 ? filterParts : [['Filter', 'Semua data']]),
    [],
    ['RINGKASAN TOTAL'],
    ['Total Proposal', data.total],
    [],
    ['DISTRIBUSI STATUS'],
    ['Status', 'Jumlah'],
    ...data.ringkasan.perStatus.map((s) => [s.label, s.count]),
    [],
    ['DISTRIBUSI JENIS'],
    ['Jenis', 'Jumlah'],
    ...data.ringkasan.perJenis.map((j) => [j.label, j.count]),
    [],
    ['DISTRIBUSI PER PROGRAM STUDI'],
    ['Program Studi', 'Jumlah'],
    ...data.ringkasan.perProdi.map((p) => [p.programStudi, p.count]),
  ]

  const ws2 = XLSX.utils.aoa_to_sheet(ringkasanData)
  ws2['!cols'] = [{ wch: 30 }, { wch: 20 }]

  XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan')

  // ── Save ───────────────────────────────────────────────────────────────────
  const filename = `Laporan-Proposal-LPPM-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
