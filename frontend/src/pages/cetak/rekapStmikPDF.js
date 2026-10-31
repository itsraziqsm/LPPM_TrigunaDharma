import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ---------------------------------------------------------------------------
// PDF Cetak Laporan Ketua STMIK (jspdf + autotable). Sumber data: GET /monitoring/proposals
// (tanpa draft) + GET /periode; semua agregat dihitung di peramban.
//   rekapPeriodePDF  — rekap kegiatan per periode (ringkasan + opsional daftar proposal per periode)
//   rekapTahunanPDF  — rekap tahunan: per periode di tahun itu + total + per jenis
//   rekapAnggaranPDF — rekap anggaran proposal disetujui (+ realisasi laporan)
// ---------------------------------------------------------------------------

const NAVY = [13, 28, 63]
const STATUS = ['diajukan', 'review', 'revisi', 'disetujui', 'ditolak']
const STATUS_LABEL = { diajukan: 'Diajukan', review: 'Review', revisi: 'Revisi', disetujui: 'Disetujui', ditolak: 'Ditolak' }
const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

export const rupiah = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
const nama = (u) => u?.fullName || u?.name || '-'
const angka = (v) => Number(v) || 0

// Agregat sekumpulan proposal: jumlah, per status, total anggaran, anggaran disetujui.
export function agregat(list) {
  const perStatus = Object.fromEntries(STATUS.map((s) => [s, 0]))
  let total = 0
  let disetujui = 0
  for (const p of list) {
    if (perStatus[p.status] != null) perStatus[p.status] += 1
    total += angka(p.anggaran)
    if (p.status === 'disetujui') disetujui += angka(p.anggaran)
  }
  return { jumlah: list.length, perStatus, total, disetujui }
}

function kepala(doc, judul, sub) {
  const pageW = doc.internal.pageSize.getWidth()
  const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(judul.toUpperCase(), 14, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('LPPM — Laporan Ketua STMIK', 14, 16)
  doc.text(`Dicetak: ${now}`, pageW - 14, 10, { align: 'right' })
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(9)
  if (sub) doc.text(sub, 14, 30)
  return sub ? 36 : 30
}

const gaya = {
  styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
  headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
  footStyles: { fillColor: [229, 237, 255], textColor: [13, 28, 63], fontStyle: 'bold', fontSize: 8 },
  alternateRowStyles: { fillColor: [246, 248, 252] },
  margin: { left: 14, right: 14 },
}

function kaki(doc, label) {
  const total = doc.internal.getNumberOfPages()
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text(`Halaman ${i} dari ${total}`, w / 2, h - 8, { align: 'center' })
    doc.text(`LPPM — ${label}`, 14, h - 8)
  }
}

const barisRingkas = (label, a) => [label, a.jumlah, ...STATUS.map((s) => a.perStatus[s]), rupiah(a.total), rupiah(a.disetujui)]
const kepalaRingkas = ['Periode', 'Jumlah', ...STATUS.map((s) => STATUS_LABEL[s]), 'Total anggaran', 'Anggaran disetujui']
const kolomRingkas = { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'right' }, 8: { halign: 'right' } }

const perPeriode = (proposals, id) => proposals.filter((p) => p.periode?.id === id)

export function rekapPeriodePDF({ periodes, proposals, denganDaftar, judulFile }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  let y = kepala(doc, 'Rekap Kegiatan per Periode', `${periodes.length} periode · ${proposals.length} proposal (tanpa draft)`)
  const semua = agregat(proposals)
  autoTable(doc, {
    ...gaya,
    startY: y,
    head: [kepalaRingkas],
    body: periodes.map((pe) => barisRingkas(`${pe.nama}${pe.tahun ? ` (${pe.tahun})` : ''}`, agregat(perPeriode(proposals, pe.id)))),
    foot: periodes.length > 1 ? [barisRingkas('Total', semua)] : undefined,
    columnStyles: kolomRingkas,
  })
  if (denganDaftar) {
    for (const pe of periodes) {
      const list = perPeriode(proposals, pe.id)
      y = doc.lastAutoTable.finalY + 10
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage()
        y = 20
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(13, 28, 63)
      doc.text(`${pe.nama}${pe.tahun ? ` (${pe.tahun})` : ''} — ${list.length} proposal`, 14, y)
      doc.setFont('helvetica', 'normal')
      autoTable(doc, {
        ...gaya,
        startY: y + 3,
        head: [['No', 'Judul', 'Pengusul', 'Jenis', 'Status', 'Tahapan', 'Anggaran']],
        body: list.length
          ? list.map((p, i) => [i + 1, p.judul, nama(p.pengusul), JENIS_LABEL[p.jenis] || p.jenis, STATUS_LABEL[p.status] || p.status, p.tahapan?.label || '-', rupiah(p.anggaran)])
          : [[{ content: 'Belum ada proposal yang diajukan.', colSpan: 7, styles: { halign: 'center', textColor: 120 } }]],
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 95 }, 2: { cellWidth: 45 }, 6: { halign: 'right' } },
      })
    }
  }
  kaki(doc, 'Rekap Kegiatan per Periode')
  doc.save(`${judulFile || 'Rekap Kegiatan per Periode'}.pdf`)
}

export function rekapTahunanPDF({ tahun, periodes, proposals }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const y = kepala(doc, `Rekap Kegiatan Tahun ${tahun}`, `${periodes.length} periode · ${proposals.length} proposal (tanpa draft)`)
  autoTable(doc, {
    ...gaya,
    startY: y,
    head: [kepalaRingkas],
    body: periodes.map((pe) => barisRingkas(pe.nama, agregat(perPeriode(proposals, pe.id)))),
    foot: [barisRingkas(`Total ${tahun}`, agregat(proposals))],
    columnStyles: kolomRingkas,
  })
  autoTable(doc, {
    ...gaya,
    startY: doc.lastAutoTable.finalY + 8,
    head: [['Jenis kegiatan', 'Jumlah', ...STATUS.map((s) => STATUS_LABEL[s]), 'Total anggaran', 'Anggaran disetujui']],
    body: Object.keys(JENIS_LABEL).map((j) => barisRingkas(JENIS_LABEL[j], agregat(proposals.filter((p) => p.jenis === j)))),
    columnStyles: kolomRingkas,
  })
  kaki(doc, `Rekap Kegiatan Tahun ${tahun}`)
  doc.save(`Rekap Kegiatan Tahun ${tahun}.pdf`)
}

export function rekapAnggaranPDF({ keterangan, proposals }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const disetujui = proposals.filter((p) => p.status === 'disetujui')
  const y = kepala(doc, 'Rekap Anggaran Disetujui', `${keterangan} · ${disetujui.length} proposal disetujui`)
  const totalRealisasi = disetujui.reduce((n, p) => n + angka(p.laporan?.realisasiAnggaran), 0)
  autoTable(doc, {
    ...gaya,
    startY: y,
    head: [['Jenis kegiatan', 'Proposal disetujui', 'Anggaran disetujui', 'Realisasi (laporan)']],
    body: Object.keys(JENIS_LABEL).map((j) => {
      const l = disetujui.filter((p) => p.jenis === j)
      return [JENIS_LABEL[j], l.length, rupiah(l.reduce((n, p) => n + angka(p.anggaran), 0)), rupiah(l.reduce((n, p) => n + angka(p.laporan?.realisasiAnggaran), 0))]
    }),
    foot: [['Total', disetujui.length, rupiah(agregat(disetujui).disetujui), rupiah(totalRealisasi)]],
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  })
  autoTable(doc, {
    ...gaya,
    startY: doc.lastAutoTable.finalY + 8,
    head: [['No', 'Judul', 'Pengusul', 'Jenis', 'Periode', 'Disetujui', 'Anggaran', 'Realisasi']],
    body: disetujui.length
      ? disetujui.map((p, i) => [
          i + 1,
          p.judul,
          nama(p.pengusul),
          JENIS_LABEL[p.jenis] || p.jenis,
          p.periode?.nama || '-',
          p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
          rupiah(p.anggaran),
          p.laporan?.realisasiAnggaran != null ? rupiah(p.laporan.realisasiAnggaran) : '-',
        ])
      : [[{ content: 'Belum ada proposal disetujui.', colSpan: 8, styles: { halign: 'center', textColor: 120 } }]],
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 80 }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  })
  kaki(doc, 'Rekap Anggaran Disetujui')
  doc.save('Rekap Anggaran Disetujui.pdf')
}
