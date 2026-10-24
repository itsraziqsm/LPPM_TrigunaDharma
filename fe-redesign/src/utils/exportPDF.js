import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const STATUS_COLOR = {
  Draft: [156, 163, 175],
  Diajukan: [96, 165, 250],
  'Sedang Direview': [251, 191, 36],
  Revisi: [251, 146, 60],
  Disetujui: [74, 222, 128],
  Ditolak: [248, 113, 113],
}

function formatRupiah(val) {
  if (!val || val === '-') return '-'
  return 'Rp ' + Number(String(val).replace(/\D/g, '')).toLocaleString('id-ID')
}

export function exportToPDF(data, filter = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(17, 24, 39)
  doc.rect(0, 0, pageW, 22, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('LAPORAN REKAPITULASI PROPOSAL', margin, 10)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Sistem Manajemen Penelitian & Pengabdian (LPPM)', margin, 16)

  const genDate = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  doc.text(`Digenerate: ${genDate}`, pageW - margin, 16, { align: 'right' })

  // ── Filter aktif ─────────────────────────────────────────────────────────────
  doc.setTextColor(55, 65, 81)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  let filterText = 'Filter: '
  const parts = []
  if (filter.periodeNama) parts.push(`Periode: ${filter.periodeNama}`)
  if (filter.jenis) parts.push(`Jenis: ${filter.jenis === 'penelitian' ? 'Penelitian' : 'Pengabdian'}`)
  if (filter.status) parts.push(`Status: ${filter.status}`)
  if (filter.tahun) parts.push(`Tahun: ${filter.tahun}`)
  if (filter.programStudi) parts.push(`Prodi: ${filter.programStudi}`)
  filterText += parts.length > 0 ? parts.join(' · ') : 'Semua data'

  doc.text(filterText, margin, 28)
  doc.text(`Total: ${data.total} proposal`, pageW - margin, 28, { align: 'right' })

  // ── Ringkasan per status ─────────────────────────────────────────────────────
  let y = 33
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 24, 39)
  doc.text('Ringkasan per Status:', margin, y)

  y += 4
  const colW = 38
  data.ringkasan.perStatus.forEach((item, i) => {
    const x = margin + i * colW
    const color = STATUS_COLOR[item.label] || [156, 163, 175]
    doc.setFillColor(...color)
    doc.roundedRect(x, y, colW - 2, 10, 1.5, 1.5, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(String(item.count), x + (colW - 2) / 2, y + 4.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(item.label, x + (colW - 2) / 2, y + 8.5, { align: 'center' })
  })

  // ── Tabel utama ──────────────────────────────────────────────────────────────
  y += 16

  const columns = [
    { header: 'No', dataKey: 'no' },
    { header: 'Judul Proposal', dataKey: 'judul' },
    { header: 'Jenis', dataKey: 'jenis' },
    { header: 'Pengusul', dataKey: 'pengusul' },
    { header: 'NIDN', dataKey: 'nidn' },
    { header: 'Prodi', dataKey: 'programStudi' },
    { header: 'Periode', dataKey: 'periode' },
    { header: 'Anggaran', dataKey: 'anggaran' },
    { header: 'Status', dataKey: 'status' },
    { header: 'Tgl Diajukan', dataKey: 'submittedAt' },
    { header: 'Tgl Disetujui', dataKey: 'approvedAt' },
  ]

  const rows = data.rows.map((r) => ({
    ...r,
    anggaran: formatRupiah(r.anggaran),
  }))

  autoTable(doc, {
    startY: y,
    columns,
    body: rows,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 },
      overflow: 'linebreak',
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [17, 24, 39],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      no: { halign: 'center', cellWidth: 8 },
      judul: { cellWidth: 52 },
      jenis: { halign: 'center', cellWidth: 20 },
      nidn: { halign: 'center', cellWidth: 20 },
      programStudi: { cellWidth: 28 },
      periode: { cellWidth: 28 },
      anggaran: { halign: 'right', cellWidth: 26 },
      status: { halign: 'center', cellWidth: 22 },
      submittedAt: { halign: 'center', cellWidth: 20 },
      approvedAt: { halign: 'center', cellWidth: 20 },
    },
    didDrawCell(hookData) {
      // Warnai badge status
      if (hookData.column.dataKey === 'status' && hookData.section === 'body') {
        const { x, y: cy, width, height } = hookData.cell
        const statusVal = hookData.cell.raw
        const color = STATUS_COLOR[statusVal] || [156, 163, 175]
        doc.setFillColor(...color)
        const bW = width - 4, bH = height - 3
        doc.roundedRect(x + 2, cy + 1.5, bW, bH, 1.5, 1.5, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(6.5)
        doc.setFont('helvetica', 'bold')
        doc.text(statusVal, x + width / 2, cy + height / 2 + 0.5, { align: 'center' })
      }
    },
    // Footer halaman
    didDrawPage(hookData) {
      const pageCount = doc.internal.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(156, 163, 175)
      doc.setFont('helvetica', 'normal')
      doc.text(
        `Halaman ${hookData.pageNumber} dari ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 6,
        { align: 'center' },
      )
    },
  })

  const filename = `Laporan-Proposal-LPPM-${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
