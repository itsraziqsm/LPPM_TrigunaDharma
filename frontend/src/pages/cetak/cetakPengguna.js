import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { usersApi } from '../../api/users'
import { PERAN_LABEL } from './dokumen'

// Cetak Tabel Pengguna: ambil semua halaman GET /users (maks. 100 per halaman, per peran
// bila dipilih; digabung tanpa duplikat), lalu PDF tabel (jspdf + autotable).

const MAKS_HALAMAN = 50

async function semuaHalaman(params) {
  const out = []
  for (let page = 1; page <= MAKS_HALAMAN; page += 1) {
    const r = await usersApi.getAll({ ...params, page, limit: 100 })
    const rows = r.data.data || []
    out.push(...rows)
    const total = Number(r.data.meta?.total) || 0
    if (!rows.length || out.length >= total) break
  }
  return out
}

export async function ambilPengguna(cfg) {
  const roles = cfg && cfg.semua === false ? cfg.roles || [] : []
  const daftar = roles.length ? (await Promise.all(roles.map((role) => semuaHalaman({ role })))).flat() : await semuaHalaman({})
  const seen = new Set()
  return daftar
    .filter((u) => !seen.has(u.id) && seen.add(u.id))
    .sort((a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '', 'id'))
}

const peranDari = (u) => (u.roles || []).map((r) => r.role?.name || r.name || r).map((n) => PERAN_LABEL[n] || n)

export function penggunaPDF(users, ringkas) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14

  doc.setFillColor(17, 24, 39)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('TABEL PENGGUNA', margin, 10)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Sistem Manajemen Penelitian & Pengabdian (LPPM)', margin, 16)
  const tgl = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(`Digenerate: ${tgl}`, pageW - margin, 16, { align: 'right' })

  doc.setTextColor(55, 65, 81)
  doc.text(`Peran: ${ringkas}`, margin, 28)
  doc.text(`Total: ${users.length} pengguna`, pageW - margin, 28, { align: 'right' })

  autoTable(doc, {
    startY: 32,
    margin: { left: margin, right: margin },
    head: [['No', 'Nama', 'Email', 'NIDN / NIM', 'Peran', 'Status', 'Program Studi', 'Kontak']],
    body: users.map((u, i) => [
      i + 1,
      u.fullName || u.name || '-',
      u.email || '-',
      u.nidn || u.nim || '-',
      peranDari(u).join(', ') || '-',
      u.status || '-',
      u.programStudi || u.prodi || '-',
      u.noHp || u.kontak || '-',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 10, halign: 'right' } },
  })

  doc.save(`tabel-pengguna-${new Date().toISOString().slice(0, 10)}.pdf`)
}
