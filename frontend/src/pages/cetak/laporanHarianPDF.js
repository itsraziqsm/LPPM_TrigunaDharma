import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Rekap Laporan Harian (PDF, jspdf + autotable): dipakai Project Saya › Laporan Harian dan
// Cetak Laporan mahasiswa (/cetak-laporan).

function fmtDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function downloadRekap(laporan, judulProposal) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

  doc.setFillColor(30, 30, 30)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('REKAP LAPORAN HARIAN', 14, 10)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Dicetak: ${now}`, pageW - 14, 10, { align: 'right' })

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Proposal:', 14, 30)
  doc.setFont('helvetica', 'normal')
  const judulLines = doc.splitTextToSize(judulProposal, pageW - 50)
  doc.text(judulLines, 38, 30)

  doc.setFontSize(8)
  doc.text(`Total Entri: ${laporan.length}`, 14, 30 + judulLines.length * 5 + 2)

  const startY = 30 + judulLines.length * 5 + 8
  autoTable(doc, {
    startY,
    head: [['No', 'Tanggal', 'Kegiatan', 'Dokumen', 'Ukuran', 'Link GDrive']],
    body: laporan.map((l, i) => [
      i + 1,
      fmtDate(l.tanggal),
      l.kegiatan || '-',
      l.dokumenNama || '-',
      l.dokumenUkuran ? fmtSize(l.dokumenUkuran) : '-',
      l.linkGdrive || '-',
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 30 },
      2: { cellWidth: 80 },
      3: { cellWidth: 50 },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 60 },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const pg = doc.internal.getCurrentPageInfo().pageNumber
      const total = doc.internal.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(160, 160, 160)
      doc.text(`Halaman ${pg} dari ${total}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
      doc.text('LPPM — Rekap Laporan Harian', 14, doc.internal.pageSize.getHeight() - 8)
    },
  })

  doc.save(`Rekap Laporan Harian - ${judulProposal}.pdf`)
}

