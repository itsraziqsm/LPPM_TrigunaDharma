import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, CircleCheck, CloudUpload } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import { laporanHarianApi } from '../api/laporanHarian'

// ---------------------------------------------------------------------------
// Input Laporan Harian (mahasiswa) — halaman satu formulir, tanpa kolom samping
// (dulu modal di Laporan Harian). Route /project/:jenis/input?id=<proposalId>.
// Project diambil dari GET /mahasiswa/laporan-harian/proposals (memastikan mahasiswa
// anggota); simpan = POST /mahasiswa/laporan-harian/:proposalId (multipart: tanggal,
// kegiatan, linkGdrive?, file?) lalu kembali ke riwayat project dengan pesan.
// ---------------------------------------------------------------------------

const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }
const DOC_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function LaporanHarianInputPage({ jenis }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const proposalId = Number(params.get('id')) || null
  const kembali = proposalId ? `/project/${jenis}?id=${proposalId}` : `/project/${jenis}`
  const [proposal, setProposal] = useState(undefined) // undefined = memuat, null = tidak ditemukan
  const [form, setForm] = useState({ tanggal: '', kegiatan: '', linkGdrive: '' })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    let alive = true
    laporanHarianApi
      .getMyProposals()
      .then((r) => alive && setProposal((r.data.data || []).find((p) => p.id === proposalId) || null))
      .catch(() => alive && setProposal(null))
    return () => {
      alive = false
    }
  }, [proposalId])

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) {
      setFile(null)
      return
    }
    if (!DOC_MIME.includes(f.type)) {
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
      navigate(kembali, { state: { flash: 'Laporan harian berhasil disimpan.' } })
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal menyimpan laporan.')
      setLoading(false)
    }
  }

  const backLink = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to={kembali} className="btn btn-ghost btn-sm -ml-3">
        <ChevronLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
        Kembali ke Riwayat Laporan Harian
      </Link>
      <Breadcrumb
        items={[
          { label: 'Project Saya' },
          { label: JENIS_LABEL[jenis] || jenis, to: `/project/${jenis}` },
          ...(proposalId ? [{ label: 'Laporan Harian', to: kembali }] : []),
          { label: 'Input' },
        ]}
      />
    </div>
  )

  if (proposal === undefined) {
    return (
      <div className="page mx-auto max-w-3xl space-y-4" aria-hidden="true">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200/70" />
        <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="page mx-auto max-w-3xl space-y-6">
        {backLink}
        <section className="card px-6 py-12 text-center">
          <h1 className="text-lg font-semibold text-navy-950">Project tidak ditemukan</h1>
          <p className="mt-1 text-sm text-slate-500">Pilih project dari menu Project Saya untuk mengisi laporan harian.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="page mx-auto max-w-3xl space-y-6">
      {backLink}

      <header>
        <p className="text-sm font-medium text-slate-500">Project {JENIS_LABEL[proposal.jenis] || proposal.jenis}</p>
        <h1 className="page-title">Input Laporan Harian</h1>
        <p className="page-desc line-clamp-2" title={proposal.judul}>
          {proposal.judul}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card overflow-hidden" noValidate>
        <div className="space-y-5 px-5 py-6 sm:px-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700" role="alert">
              {error}
            </div>
          )}

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

        <footer className="flex flex-col-reverse gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Link to={kembali} className="btn btn-secondary">
            Batal
          </Link>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Menyimpan...' : 'Simpan Laporan'}
          </button>
        </footer>
      </form>
    </div>
  )
}
