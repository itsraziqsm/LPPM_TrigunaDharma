import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { tampilkanPdf } from '../../utils/pratinjauPdf'
import { KOMPONEN, REKOMENDASI, angkaId, hitungSkor, rupiahId } from '../../utils/rubrikReview'

// Cetak Form Penilaian Reviewer (A4 tegak) mengikuti formulir kertas LPPM:
// kepala → A. Penilaian substansi (tabel skor) → total/rata-rata/keterangan →
// B. Catatan reviewer → C. Rekomendasi (+ tabel dana untuk proposal) → nama reviewer.

const JENIS = { penelitian: 'Penelitian', pengabdian: 'Pengabdian kepada Masyarakat' }

export function cetakFormReview({ tipe, item, form, reviewer }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 20
  let y = 22

  doc.setFont('times', 'bold')
  doc.setFontSize(16)
  doc.text('FORM PENILAIAN REVIEWER', W / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(12)
  const sub = `FORM PENILAIAN ${tipe === 'laporan' ? 'LAPORAN' : 'PROPOSAL'} ${(JENIS[item.jenis] || item.jenis || '').toUpperCase()}`
  doc.text(sub, W / 2, y, { align: 'center' })
  y += 10

  const kepala = [
    [tipe === 'laporan' ? 'Judul Laporan' : 'Judul Kegiatan', item.judul || '—'],
    ['Nama Pengusul', item.pengusul?.fullName || item.pengusul?.name || '—'],
    ['Bidang Ilmu', [item.rumpunIlmu, item.bidang].filter(Boolean).join(' / ') || '—'],
  ]
  doc.setFontSize(11)
  kepala.forEach(([l, v]) => {
    doc.setFont('times', 'bold')
    doc.text(l, M, y)
    doc.setFont('times', 'normal')
    const baris = doc.splitTextToSize(`: ${v}`, W - M - 58)
    doc.text(baris, M + 34, y)
    y += baris.length * 5.2
  })
  y += 2
  doc.setDrawColor(150)
  doc.line(M, y, W - M, y)
  y += 8

  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text('A. PENILAIAN SUBSTANSI', M, y)
  y += 3
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['No', 'Komponen Penilaian', 'Skor (1-5)', 'Catatan Singkat']],
    body: KOMPONEN.map((k, i) => [i + 1, k.label, form.skor?.[k.kode] ?? '—', form.catatanSkor?.[k.kode] || '']),
    theme: 'grid',
    styles: { font: 'times', fontSize: 10.5, cellPadding: 2, lineColor: [180, 180, 180], textColor: [20, 20, 20] },
    headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 70 }, 2: { cellWidth: 22, halign: 'center' } },
  })
  y = doc.lastAutoTable.finalY + 7

  const h = hitungSkor(form.skor)
  doc.setFontSize(11)
  ;[
    ['Total Skor', h.terisi ? String(h.total) : '—'],
    ['Rata-rata Skor', angkaId(h.rata)],
    ['Kelayakan', h.kelayakan?.label || '—'],
  ].forEach(([l, v]) => {
    doc.setFont('times', 'bold')
    doc.text(l, M, y)
    doc.setFont('times', 'normal')
    doc.text(`: ${v}`, M + 30, y)
    y += 5.5
  })
  doc.setFontSize(9.5)
  doc.setTextColor(90)
  doc.text('Keterangan: >= 4,0 layak lanjut; 3,0 - 3,9 layak dengan revisi; < 3,0 tidak layak.', M, y + 1)
  doc.setTextColor(0)
  y += 6
  doc.line(M, y, W - M, y)
  y += 8

  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text('B. CATATAN REVIEWER', M, y)
  y += 6
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  const catatan = doc.splitTextToSize(form.catatan?.trim() || '—', W - 2 * M)
  doc.text(catatan, M, y)
  y += catatan.length * 5.2 + 4
  doc.line(M, y, W - M, y)
  y += 8

  if (y > 235) {
    doc.addPage()
    y = 22
  }
  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text('C. REKOMENDASI', M, y)
  const yRek = y + 7
  doc.setFontSize(11)
  REKOMENDASI.forEach((r, i) => {
    const yy = yRek + i * 6
    doc.rect(M, yy - 3.3, 3.6, 3.6)
    if (form.rekomendasi === r.value) {
      doc.setLineWidth(0.5)
      doc.line(M + 0.7, yy - 1.5, M + 1.6, yy - 0.3)
      doc.line(M + 1.6, yy - 0.3, M + 3.1, yy - 2.9)
      doc.setLineWidth(0.2)
    }
    doc.setFont('times', form.rekomendasi === r.value ? 'bold' : 'normal')
    doc.text(r.label, M + 6, yy)
  })

  if (tipe !== 'laporan') {
    autoTable(doc, {
      startY: y - 2,
      margin: { left: W - M - 78, right: M },
      tableWidth: 78,
      head: [['Dana diusulkan', 'Dana disetujui']],
      body: [[rupiahId(item.anggaran), form.danaDisetujui === '' || form.danaDisetujui == null ? '—' : rupiahId(form.danaDisetujui)]],
      theme: 'grid',
      styles: { font: 'times', fontSize: 10.5, halign: 'center', cellPadding: 2.5, lineWidth: 0.2, lineColor: [120, 120, 120], textColor: [20, 20, 20] },
      headStyles: { fillColor: [255, 255, 255], fontStyle: 'normal' },
      bodyStyles: { fontStyle: 'bold' },
    })
  }

  y = yRek + REKOMENDASI.length * 6 + 8
  doc.setFont('times', 'bold')
  doc.text('Reviewer', M, y)
  y += 24
  doc.text(reviewer || '—', M, y)

  tampilkanPdf(doc, `Form Penilaian - ${(item.judul || '').slice(0, 60)}`)
}
