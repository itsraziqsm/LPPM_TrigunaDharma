import { useEffect, useState, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../api/axios'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { laporanHarianApi } from '../api/laporanHarian'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ChevronLeft, ChevronRight, CircleCheck, Download, ExternalLink, FileText, Plus, Search, Trash2, X } from 'lucide-react'
import { alertDialog, confirmDialog } from '../utils/dialog'

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
          <table className="table table-tight">
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">Kegiatan</th>
                <th scope="col">Dokumen</th>
                <th scope="col">Link GDrive</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {laporan.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-navy-50/60">
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
  const [deleting, setDeleting] = useState(null)
  // Pesan dari halaman Input Laporan Harian (location.state.flash), bisa ditutup.
  const location = useLocation()
  const [flash, setFlash] = useState(location.state?.flash || '')
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
          Kembali ke Daftar Project
        </button>
      </div>

      {flash ? (
        <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <span className="flex items-center gap-2">
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
            {flash}
          </span>
          <button type="button" onClick={() => setFlash('')} className="icon-btn -my-1 size-7 text-green-800" aria-label="Tutup pesan">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Ringkasan utama proposal untuk memberi konteks sebelum melihat tabel */}
      <section className="card p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-500">Detail Proposal</p>
            <h1 className="mt-1.5 font-serif text-2xl font-medium leading-snug text-navy-950">
              {proposal.judul}
            </h1>
            <Link
              to={`/kegiatan/${proposal.jenis}/detail/${proposal.id}`}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:text-navy-900"
            >
              Lihat detail kegiatan
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>

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
            <Link to={`/project/${proposal.jenis}/input?id=${proposal.id}`} className="btn btn-primary">
              <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Input Laporan Harian
            </Link>
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

      {/* Desain disamakan dengan tabel Riwayat dosen (KegiatanPage): bingkai navy, kepala gelap */}
      <section aria-labelledby="riwayat-laporan-harian" className="overflow-hidden rounded-2xl border-2 border-navy-800 bg-white shadow-md">
        <header className="bg-navy-800 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="riwayat-laporan-harian" className="font-serif text-2xl font-medium text-white">
                Riwayat Laporan Harian
              </h2>
              <p className="mt-1 text-sm text-white/75">
                Daftar laporan yang telah diinput untuk proposal ini.
              </p>
            </div>
            {!loading ? (
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white tabular-nums">
                {laporan.length} entri
              </span>
            ) : null}
          </div>
        </header>

        <div className="p-4 sm:p-5">
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

    </div>
  )
}

// ── Page Utama ─────────────────────────────────────────────────────────────

// Mahasiswa › Project Saya (/project/:jenis): daftar project (proposal tempat mahasiswa
// menjadi anggota `diterima`, GET /mahasiswa/laporan-harian/proposals) per jenis → pilih
// project (?id=) → Laporan Harian. Tanpa `jenis` (/laporan-harian lama) = semua project.
export default function LaporanHarianPage({ jenis }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const jenisLabel = JENIS_LABEL[jenis]

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

  const milikJenis = jenis ? proposals.filter(p => p.jenis === jenis) : proposals
  const selectedId = Number(params.get('id')) || null
  const selected = selectedId ? proposals.find(p => p.id === selectedId) : null
  const setSelected = (p) => setParams(p ? { id: String(p.id) } : {})

  if (selected) {
    return <ProposalDetail key={selected.id} proposal={selected} onBack={() => setSelected(null)} />
  }

  const filtered = milikJenis.filter(p =>
    p.judul.toLowerCase().includes(search.toLowerCase()) ||
    (p.pengusul?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page space-y-6">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-slate-500">Project Saya</p>
          <h1 className="page-title">{jenisLabel ? `Project ${jenisLabel}` : 'Laporan Harian'}</h1>
          <p className="page-desc">
            Pilih project {jenisLabel ? jenisLabel.toLowerCase() + ' ' : ''}tempat Anda menjadi anggota tim, lalu isi dan kelola laporan harian.
          </p>
        </div>

        <dl className="flex shrink-0 gap-10">
          <div>
            <dt className="text-sm text-slate-500">Total Project</dt>
            <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{milikJenis.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Hasil Pencarian</dt>
            <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{filtered.length}</dd>
          </div>
        </dl>
      </header>

      <div>
        <label htmlFor="lh-cari" className="sr-only">
          Cari Proposal
        </label>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} aria-hidden="true" />
          <input
            id="lh-cari"
            type="text"
            placeholder="Cari judul project atau nama dosen pengusul..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
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
            Memuat daftar project...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <section className="card flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-navy-50 text-navy-700">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-navy-950">
            {search ? 'Tidak ada project ditemukan' : `Anda belum menjadi anggota project${jenisLabel ? ` ${jenisLabel.toLowerCase()}` : ''}`}
          </h2>
          <p className="mt-2 max-w-lg text-base leading-relaxed text-slate-500">
            {search
              ? 'Coba gunakan kata kunci lain yang lebih sesuai dengan judul proposal atau nama pengusul.'
              : 'Project akan muncul di halaman ini setelah Anda menerima undangan ikut serta dari dosen (menu Undangan Ikut Serta).'
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
