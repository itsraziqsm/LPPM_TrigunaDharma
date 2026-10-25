import { useEffect, useState, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../api/axios'
import { laporanHarianApi } from '../api/laporanHarian'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ChevronLeft, ChevronRight, CircleCheck, CloudUpload, Download, ExternalLink, FileText, Plus, Trash2, X } from 'lucide-react'
import { alertDialog, confirmDialog } from '../utils/dialog'
import SearchPopup, { SearchTrigger } from '../components/SearchPopup'

// ── Konstanta ──────────────────────────────────────────────────────────────

const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }
const STATUS_COLOR = {
  draft: 'badge-neutral',
  diajukan: 'badge-info',
  review: 'badge-review',
  revisi: 'badge-warning',
  disetujui: 'badge-success',
  ditolak: 'badge-danger',
}
const STATUS_LABEL = {
  draft: 'Draft', diajukan: 'Diajukan', review: 'Review',
  revisi: 'Revisi', disetujui: 'Disetujui', ditolak: 'Ditolak',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Sub-komponen ───────────────────────────────────────────────────────────

function Badge({ label, className }) {
  return (
    <span className={`badge ${className}`}>
      {label}
    </span>
  )
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay">
      <section
        aria-modal="true"
        role="dialog"
        aria-label={title}
        className={`dialog flex max-h-full flex-col ${wide ? 'max-w-4xl' : 'max-w-xl'}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-3">
          <h3 className="line-clamp-2 min-w-0 text-lg font-semibold leading-snug text-navy-950">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            title="Tutup"
            className="icon-btn"
          >
            <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>
        {/* Penggulir tanpa padding agar footer lengket menempel di dasar dialog */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-6">{children}</div>
        </div>
      </section>
    </div>
  )
}

// ── Form Laporan Harian ────────────────────────────────────────────────────

function FormLaporan({ proposal, onClose, onSuccess }) {
  const [form, setForm] = useState({ tanggal: '', kegiatan: '', linkGdrive: '' })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) { setFile(null); return }
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(f.type)) {
      setError('Hanya file PDF atau DOCX yang diizinkan.')
      setFile(null)
      fileRef.current.value = ''
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Ukuran file maksimal 10 MB.')
      setFile(null)
      fileRef.current.value = ''
      return
    }
    setError('')
    setFile(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.tanggal || !form.kegiatan.trim()) {
      setError('Tanggal dan kegiatan wajib diisi.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('tanggal', form.tanggal)
      fd.append('kegiatan', form.kegiatan.trim())
      if (form.linkGdrive.trim()) fd.append('linkGdrive', form.linkGdrive.trim())
      if (file) fd.append('file', file)
      await laporanHarianApi.create(proposal.id, fd)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal menyimpan laporan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={`Input Laporan Harian — ${proposal.judul}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Layout form dibuat dua tingkat: informasi inti lebih dulu, lampiran sesudahnya */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="card overflow-hidden">
              <header className="border-b border-slate-200 px-5 py-4">
                <h4 className="text-base font-semibold text-navy-950">Informasi Kegiatan</h4>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                  Isi tanggal pelaksanaan dan uraian kegiatan harian dengan jelas.
                </p>
              </header>

              <div className="space-y-5 px-5 py-5">
                <div>
                  <label htmlFor="lh-tanggal" className="label">
                    Tanggal <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="lh-tanggal"
                    type="date"
                    name="tanggal"
                    value={form.tanggal}
                    onChange={handleChange}
                    required
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="lh-kegiatan" className="label">
                    Kegiatan <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="lh-kegiatan"
                    name="kegiatan"
                    value={form.kegiatan}
                    onChange={handleChange}
                    rows={6}
                    required
                    placeholder="Deskripsikan kegiatan yang dilakukan hari ini..."
                    className="input resize-none leading-relaxed"
                  />
                </div>
              </div>
            </section>

            <section className="card overflow-hidden">
              <header className="border-b border-slate-200 px-5 py-4">
                <h4 className="text-base font-semibold text-navy-950">Dokumentasi Tambahan</h4>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                  Lampirkan dokumen pendukung atau tautan Google Drive bila tersedia.
                </p>
              </header>

              <div className="space-y-5 px-5 py-5">
                <div>
                  <span className="label">
                    Upload Laporan Harian (PDF / DOCX)
                  </span>
                  <div className="overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50/60 focus-within:border-navy-500 focus-within:ring-4 focus-within:ring-navy-600/15">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleFile}
                      className="sr-only"
                      id="file-upload"
                    />

                    {file ? (
                      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-green-50 text-green-700">
                            <CircleCheck className="size-5" strokeWidth={1.8} aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-medium text-slate-900">{file.name}</p>
                            <p className="mt-0.5 text-sm text-slate-500">
                              Ukuran file: {fmtSize(file.size)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <label
                            htmlFor="file-upload"
                            className="btn btn-secondary btn-sm cursor-pointer"
                          >
                            Ganti File
                          </label>
                          <button
                            type="button"
                            onClick={() => { setFile(null); fileRef.current.value = '' }}
                            className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            Hapus File
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label
                        htmlFor="file-upload"
                        className="flex cursor-pointer flex-col items-center px-6 py-8 text-center transition-colors hover:bg-navy-50/60"
                      >
                        <span className="grid size-11 place-items-center rounded-full bg-navy-50 text-navy-700">
                          <CloudUpload className="size-5" strokeWidth={1.5} aria-hidden="true" />
                        </span>
                        <span className="mt-3 text-base font-semibold text-slate-800">
                          Pilih dokumen laporan harian
                        </span>
                        <span className="mt-1 text-sm text-slate-500">
                          Klik area ini untuk memilih file dari perangkat Anda.
                        </span>
                        <span className="mt-1 text-sm text-slate-400">
                          Format PDF atau DOCX, ukuran maksimal 10 MB.
                        </span>
                        <span className="btn btn-secondary btn-sm mt-4">
                          Pilih File
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="lh-link" className="label">
                    Link Google Drive (Poster / Video)
                  </label>
                  <input
                    id="lh-link"
                    type="url"
                    name="linkGdrive"
                    value={form.linkGdrive}
                    onChange={handleChange}
                    placeholder="https://drive.google.com/..."
                    className="input"
                  />
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                    Opsional, gunakan untuk melampirkan poster atau video pendukung.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h4 className="text-base font-semibold text-navy-950">Ringkasan Proposal</h4>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-sm text-slate-500">Judul Proposal</dt>
                  <dd className="mt-0.5 text-base leading-relaxed text-slate-900">{proposal.judul}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Jenis</dt>
                  <dd className="mt-0.5 text-base text-slate-900">{JENIS_LABEL[proposal.jenis] || proposal.jenis}</dd>
                </div>
                {proposal.pengusul && (
                  <div>
                    <dt className="text-sm text-slate-500">Pengusul</dt>
                    <dd className="mt-0.5 text-base text-slate-900">
                      {proposal.pengusul.fullName || proposal.pengusul.name}
                    </dd>
                  </div>
                )}
                {proposal.peran && (
                  <div>
                    <dt className="text-sm text-slate-500">Peran Anda</dt>
                    <dd className="mt-0.5 text-base capitalize text-slate-900">{proposal.peran}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="px-1">
              <h4 className="text-base font-semibold text-navy-950">Panduan Singkat</h4>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600 marker:text-slate-400">
                <li>Isi laporan sesuai tanggal kegiatan yang benar.</li>
                <li>Gunakan uraian kegiatan yang singkat namun jelas.</li>
                <li>Lampirkan dokumen bila dibutuhkan untuk evaluasi.</li>
              </ul>
            </section>
          </aside>
        </div>

        <footer className="sticky bottom-0 -mx-6 -mb-6 flex flex-col-reverse gap-2.5 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Menyimpan...' : 'Simpan Laporan'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

// ── Download Rekap CSV ─────────────────────────────────────────────────────

function downloadRekap(laporan, judulProposal) {
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

async function downloadDokumen(l) {
  const token = localStorage.getItem('accessToken')
  const base = API_BASE_URL
  const res = await fetch(`${base}/mahasiswa/laporan-harian/dokumen/${l.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) { alertDialog({ title: 'Gagal mengunduh dokumen', message: 'Silakan coba lagi.' }); return }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = l.dokumenNama || `laporan-${l.id}`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Tabel Laporan ──────────────────────────────────────────────────────────

function TabelLaporan({ laporan, onDelete, deleting, judulProposal }) {
  const [downloading, setDownloading] = useState(null)

  if (laporan.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-navy-50 text-navy-700">
          <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <p className="text-base font-semibold text-slate-800">Belum ada laporan harian</p>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
          Laporan yang telah Anda input akan ditampilkan pada bagian ini untuk kebutuhan evaluasi dan rekap.
        </p>
      </div>
    )
  }

  const handleDownloadDokumen = async (l) => {
    setDownloading(l.id)
    try { await downloadDokumen(l) } finally { setDownloading(null) }
  }

  return (
    <section className="space-y-4">
      <div className="hidden lg:block">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kegiatan</th>
                <th>Dokumen</th>
                <th>Link GDrive</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {laporan.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap align-top font-medium text-slate-900">
                    {fmtDate(l.tanggal)}
                  </td>
                  <td className="align-top">
                    <p className="max-w-md leading-relaxed text-slate-700">
                      {l.kegiatan}
                    </p>
                  </td>
                  <td className="align-top">
                    {l.dokumenNama ? (
                      <div className="space-y-0.5">
                        <button
                          onClick={() => laporanHarianApi.openDokumen(l.id)}
                          className="btn btn-ghost btn-sm -ml-3 text-navy-800"
                          title="Buka dokumen"
                        >
                          <FileText className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                          <span className="max-w-[180px] truncate">{l.dokumenNama}</span>
                        </button>
                        {l.dokumenUkuran && (
                          <p className="text-sm text-slate-500">Ukuran: {fmtSize(l.dokumenUkuran)}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">Tidak ada dokumen</span>
                    )}
                  </td>
                  <td className="align-top">
                    {l.linkGdrive ? (
                      <a
                        href={l.linkGdrive}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm -ml-3 text-navy-800"
                      >
                        <ExternalLink className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                        Lihat Dokumen
                      </a>
                    ) : (
                      <span className="text-sm text-slate-400">Tidak ada tautan</span>
                    )}
                  </td>
                  <td className="align-top">
                    <div className="flex flex-col items-start gap-1.5">
                      {l.dokumenNama && (
                        <button
                          onClick={() => handleDownloadDokumen(l)}
                          disabled={downloading === l.id}
                          className="btn btn-secondary btn-sm"
                          title="Unduh dokumen"
                        >
                          {downloading === l.id ? (
                            <span className="spinner" aria-hidden="true" />
                          ) : (
                            <Download className="size-4" strokeWidth={1.5} aria-hidden="true" />
                          )}
                          Unduh Dokumen
                        </button>
                      )}

                      <button
                        onClick={() => onDelete(l.id)}
                        disabled={deleting === l.id}
                        className="btn btn-danger btn-sm"
                        title="Hapus laporan"
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
                        Hapus Laporan
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tampilan mobile dipecah per kartu agar lebih mudah dipindai */}
      <div className="space-y-3 lg:hidden">
        {laporan.map((l) => (
          <article key={l.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm text-slate-500">Tanggal</p>
              <p className="mt-0.5 text-base font-semibold text-slate-900">{fmtDate(l.tanggal)}</p>
            </div>

            <div className="mt-4">
              <p className="text-sm text-slate-500">Kegiatan</p>
              <p className="mt-0.5 text-base leading-relaxed text-slate-700">{l.kegiatan}</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <p className="text-sm text-slate-500">Dokumen</p>
                {l.dokumenNama ? (
                  <div className="mt-1.5 space-y-1.5">
                    <button
                      onClick={() => laporanHarianApi.openDokumen(l.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      <FileText className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      Buka Dokumen
                    </button>
                    <p className="break-words text-sm text-slate-600">{l.dokumenNama}</p>
                    {l.dokumenUkuran && (
                      <p className="text-sm text-slate-500">Ukuran: {fmtSize(l.dokumenUkuran)}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">Tidak ada dokumen</p>
                )}
              </div>

              <div>
                <p className="text-sm text-slate-500">Link GDrive</p>
                {l.linkGdrive ? (
                  <a
                    href={l.linkGdrive}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm mt-1.5"
                  >
                    <ExternalLink className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    Lihat Dokumen
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">Tidak ada tautan</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
              {l.dokumenNama && (
                <button
                  onClick={() => handleDownloadDokumen(l)}
                  disabled={downloading === l.id}
                  className="btn btn-secondary btn-sm"
                >
                  {downloading === l.id ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <Download className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  Unduh Dokumen
                </button>
              )}

              <button
                onClick={() => onDelete(l.id)}
                disabled={deleting === l.id}
                className="btn btn-danger btn-sm"
              >
                <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Hapus Laporan
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => downloadRekap(laporan, judulProposal)}
          className="btn btn-secondary"
        >
          <Download className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Unduh Rekap (.pdf)
        </button>
      </div>
    </section>
  )
}

// ── Kartu Proposal ─────────────────────────────────────────────────────────

function ProposalCard({ proposal, onClick }) {
  return (
    <button
      onClick={() => onClick(proposal)}
      className="group block w-full rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-navy-300 hover:bg-navy-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy-600/15"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              label={STATUS_LABEL[proposal.status] || proposal.status}
              className={STATUS_COLOR[proposal.status] || 'badge-neutral'}
            />
            <Badge
              label={JENIS_LABEL[proposal.jenis] || proposal.jenis}
              className="badge-tag"
            />
            {proposal.peran && (
              <Badge label={`Peran: ${proposal.peran}`} className="badge-tag" />
            )}
          </div>

          <h3 className="mt-3 text-lg font-semibold leading-snug text-navy-950">
            {proposal.judul}
          </h3>
        </div>

        <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-slate-500 transition-colors group-hover:text-navy-800">
          <span className="hidden sm:inline">Lihat Detail</span>
          <ChevronRight className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-slate-100 pt-4 empty:hidden sm:grid-cols-2">
        {proposal.pengusul && (
          <div>
            <dt className="text-sm text-slate-500">Pengusul</dt>
            <dd className="mt-0.5 text-base text-slate-800">
              {proposal.pengusul.fullName || proposal.pengusul.name}
            </dd>
          </div>
        )}
        {proposal.periode && (
          <div>
            <dt className="text-sm text-slate-500">Periode</dt>
            <dd className="mt-0.5 text-base text-slate-800">
              {proposal.periode.nama} {proposal.periode.tahun}
            </dd>
          </div>
        )}
      </dl>
    </button>
  )
}

// ── Panel Detail Laporan Proposal ──────────────────────────────────────────

function ProposalDetail({ proposal, onBack }) {
  const [laporan, setLaporan] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  const fetchLaporan = useCallback(async () => {
    setLoading(true)
    try {
      const res = await laporanHarianApi.getByProposal(proposal.id)
      setLaporan(res.data.data || [])
    } catch {
      setError('Gagal memuat laporan harian.')
    } finally {
      setLoading(false)
    }
  }, [proposal.id])

  useEffect(() => { fetchLaporan() }, [fetchLaporan])

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ tone: 'danger', title: 'Hapus laporan harian?', message: 'Laporan harian yang dihapus tidak dapat dikembalikan.', confirmText: 'Ya, hapus' }))) return
    setDeleting(id)
    try {
      await laporanHarianApi.delete(id)
      setLaporan(prev => prev.filter(l => l.id !== id))
    } catch {
      alertDialog({ title: 'Gagal menghapus laporan', message: 'Silakan coba lagi.' })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="page space-y-6">
      <div>
        <button
          onClick={onBack}
          className="btn btn-ghost btn-sm -ml-3"
        >
          <ChevronLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Kembali ke Daftar Proposal
        </button>
      </div>

      {/* Ringkasan utama proposal untuk memberi konteks sebelum melihat tabel */}
      <section className="card p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-500">Detail Proposal</p>
            <h1 className="mt-1.5 font-serif text-2xl font-medium leading-snug text-navy-950">
              {proposal.judul}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge
                label={STATUS_LABEL[proposal.status] || proposal.status}
                className={STATUS_COLOR[proposal.status] || 'badge-neutral'}
              />
              <Badge
                label={JENIS_LABEL[proposal.jenis] || proposal.jenis}
                className="badge-tag"
              />
              {proposal.peran && (
                <Badge label={`Peran: ${proposal.peran}`} className="badge-tag" />
              )}
            </div>
          </div>

          <div className="shrink-0">
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-primary"
            >
              <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Input Laporan Harian
            </button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
          {proposal.pengusul && (
            <div>
              <dt className="text-sm text-slate-500">Pengusul</dt>
              <dd className="mt-0.5 text-base text-slate-900">
                {proposal.pengusul.fullName || proposal.pengusul.name}
              </dd>
            </div>
          )}
          {proposal.periode && (
            <div>
              <dt className="text-sm text-slate-500">Periode</dt>
              <dd className="mt-0.5 text-base text-slate-900">
                {proposal.periode.nama} {proposal.periode.tahun}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-slate-500">Jumlah Laporan</dt>
            <dd className="mt-0.5 text-base text-slate-900">{laporan.length} entri</dd>
          </div>
        </dl>
      </section>

      <section className="card overflow-hidden">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">Riwayat Laporan Harian</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Daftar laporan yang telah diinput untuk proposal ini.
          </p>
        </header>

        <div className="px-6 py-6">
          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <div className="flex items-center gap-3 text-base text-slate-500">
                <span className="spinner text-navy-600" aria-hidden="true" />
                Memuat riwayat laporan...
              </div>
            </div>
          ) : (
            <TabelLaporan
              laporan={laporan}
              onDelete={handleDelete}
              deleting={deleting}
              judulProposal={proposal.judul}
            />
          )}
        </div>
      </section>

      {showForm && (
        <FormLaporan
          proposal={proposal}
          onClose={() => setShowForm(false)}
          onSuccess={fetchLaporan}
        />
      )}
    </div>
  )
}

// ── Page Utama ─────────────────────────────────────────────────────────────

export default function LaporanHarianPage() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(null) // popup cari: null = tertutup

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await laporanHarianApi.getMyProposals()
      setProposals(res.data.data || [])
    } catch {
      setError('Gagal memuat daftar proposal.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProposals() }, [fetchProposals])

  // Popup cari: rekomendasi disaring dari daftar proposal yang sudah dimuat
  // (GET /mahasiswa/laporan-harian/proposals tidak punya parameter cari).
  const fetchRecs = useCallback((q) => {
    const k = q.toLowerCase()
    return proposals
      .filter(p => p.judul.toLowerCase().includes(k) || (p.pengusul?.name || '').toLowerCase().includes(k))
      .slice(0, 8)
      .map(p => ({ key: p.id, proposal: p, title: p.judul, subtitle: p.pengusul?.name || '', badge: p.jenis ? p.jenis.charAt(0).toUpperCase() + p.jenis.slice(1) : null }))
  }, [proposals])

  if (selected) {
    return <ProposalDetail proposal={selected} onBack={() => setSelected(null)} />
  }

  const filtered = proposals.filter(p =>
    p.judul.toLowerCase().includes(search.toLowerCase()) ||
    (p.pengusul?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page space-y-6">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="page-title">Laporan Harian</h1>
          <p className="page-desc">
            Pilih proposal untuk mengisi, meninjau, dan mengelola laporan harian secara terstruktur.
          </p>
        </div>

        <dl className="flex shrink-0 gap-10">
          <div>
            <dt className="text-sm text-slate-500">Total Proposal</dt>
            <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{proposals.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Hasil Pencarian</dt>
            <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{filtered.length}</dd>
          </div>
        </dl>
      </header>

      <div>
        <SearchTrigger
          id="lh-cari"
          className="max-w-xl"
          label="Cari proposal"
          placeholder="Cari judul proposal atau nama pengusul..."
          value={search}
          onOpen={setSearchOpen}
          onClear={() => setSearch('')}
        />
        <SearchPopup
          open={searchOpen !== null}
          onClose={() => setSearchOpen(null)}
          title="Cari proposal"
          placeholder="Ketik judul proposal atau nama pengusul…"
          initialQuery={searchOpen || search}
          minChars={1}
          fetchRecs={fetchRecs}
          onSelect={(item) => setSelected(item.proposal)}
          onSubmit={(q) => setSearch(q.trim())}
          emptyText="Tidak ada proposal yang cocok."
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card flex min-h-[320px] items-center justify-center">
          <div className="flex items-center gap-3 text-base text-slate-500">
            <span className="spinner text-navy-600" aria-hidden="true" />
            Memuat daftar proposal...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <section className="card flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-navy-50 text-navy-700">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-navy-950">
            {search ? 'Tidak ada proposal ditemukan' : 'Anda belum menjadi anggota proposal'}
          </h2>
          <p className="mt-2 max-w-lg text-base leading-relaxed text-slate-500">
            {search
              ? 'Coba gunakan kata kunci lain yang lebih sesuai dengan judul proposal atau nama pengusul.'
              : 'Daftar proposal akan muncul di halaman ini setelah Anda menerima undangan tim dari dosen.'
            }
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          {filtered.map(p => (
            <ProposalCard key={p.id} proposal={p} onClick={setSelected} />
          ))}
        </section>
      )}
    </div>
  )
}
