import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { tanggalPanjang } from './cetakConfig'

// Surat Tugas LPPM (A4 tegak) dari konfigurasi halaman Surat Tugas.
// cfg: { nomor, tugas, kegiatan: { tipe, jenis, judul, periode }, petugas: [{ nama, identitas, peran }],
//        tanggalMulai, tanggalSelesai, alamat, kota, tanggalSurat, penandatangan: { nama, nidn, jabatan } }
const INSTANSI = 'STMIK TRIGUNA DHARMA'
const LEMBAGA = 'LEMBAGA PENELITIAN DAN PENGABDIAN KEPADA MASYARAKAT'

export function suratTugasPDF(cfg, { save = true } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 22
  let y = 20

  // Kop surat
  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text(LEMBAGA, W / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(14)
  doc.text(`(LPPM) ${INSTANSI}`, W / 2, y, { align: 'center' })
  y += 4
  doc.setLineWidth(0.8)
  doc.line(M, y, W - M, y)
  doc.setLineWidth(0.2)
  doc.line(M, y + 1.2, W - M, y + 1.2)
  y += 12

  // Judul & nomor
  doc.setFontSize(13)
  doc.text('SURAT TUGAS', W / 2, y, { align: 'center' })
  const tw = doc.getTextWidth('SURAT TUGAS')
  doc.line(W / 2 - tw / 2, y + 1, W / 2 + tw / 2, y + 1)
  y += 6
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text(`Nomor: ${cfg.nomor || '......................................'}`, W / 2, y, { align: 'center' })
  y += 12

  const para = (text) => {
    const lines = doc.splitTextToSize(text, W - 2 * M)
    doc.text(lines, M, y, { align: 'justify', maxWidth: W - 2 * M })
    y += lines.length * 5.2 + 3
  }

  para(
    `Yang bertanda tangan di bawah ini, ${cfg.penandatangan?.jabatan || 'Ketua LPPM'} ${INSTANSI}, dengan ini memberikan tugas kepada:`,
  )

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['No', 'Nama', 'NIDN / NIM', 'Peran']],
    body: (cfg.petugas || []).map((p, i) => [i + 1, p.nama || '-', p.identitas || '-', p.peran || '-']),
    styles: { font: 'times', fontSize: 10.5, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.2, textColor: [20, 20, 20] },
    headStyles: { fillColor: [235, 238, 245], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 38 }, 3: { cellWidth: 38 } },
    theme: 'grid',
  })
  y = doc.lastAutoTable.finalY + 8

  const k = cfg.kegiatan || {}
  const jenis = k.jenis === 'pengabdian' ? 'Pengabdian kepada Masyarakat' : 'Penelitian'
  const info = [jenis, k.periode].filter(Boolean).join(', ')
  para(`Untuk ${cfg.tugas || '-'} dengan judul "${k.judul || '-'}" (${info}), yang dilaksanakan pada:`)

  const rows = [
    ['Tanggal', cfg.tanggalSelesai && cfg.tanggalSelesai !== cfg.tanggalMulai ? `${tanggalPanjang(cfg.tanggalMulai)} s.d. ${tanggalPanjang(cfg.tanggalSelesai)}` : tanggalPanjang(cfg.tanggalMulai) || '-'],
    ['Tempat', cfg.alamat || '-'],
  ]
  rows.forEach(([label, value]) => {
    doc.text(label, M + 6, y)
    doc.text(':', M + 34, y)
    const lines = doc.splitTextToSize(String(value), W - 2 * M - 40)
    doc.text(lines, M + 38, y)
    y += lines.length * 5.2 + 1.5
  })
  y += 4
  para('Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab dan dipergunakan sebagaimana mestinya.')

  // Tanda tangan
  y += 6
  const x = W - M - 70
  doc.text(`${cfg.kota || 'Medan'}, ${tanggalPanjang(cfg.tanggalSurat) || tanggalPanjang(new Date().toISOString())}`, x, y)
  y += 6
  doc.text(`${cfg.penandatangan?.jabatan || 'Ketua LPPM'},`, x, y)
  y += 26
  doc.setFont('times', 'bold')
  doc.text(cfg.penandatangan?.nama || '(.................................)', x, y)
  doc.setFont('times', 'normal')
  if (cfg.penandatangan?.nidn) doc.text(`NIDN ${cfg.penandatangan.nidn}`, x, y + 5.5)

  const safe = (k.judul || 'kegiatan').replace(/[^\w\s-]/g, '').trim().slice(0, 40).replace(/\s+/g, '_')
  if (save) doc.save(`Surat_Tugas_${safe}.pdf`)
  return doc
}
