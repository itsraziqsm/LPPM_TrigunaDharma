import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleCheck, CircleDashed, FileSpreadsheet, FileSignature, Printer, Settings2 } from 'lucide-react'
import { exportApi } from '../../api/export'
import ApiPending from '../../components/ApiPending'
import { exportToPDF } from '../../utils/exportPDF'
import { alertDialog } from '../../utils/dialog'
import { loadCetakConfig } from '../../utils/cetakConfig'
import { suratTugasPDF } from '../../utils/suratTugasPDF'
import { REKAP_KEY, SURAT_TUGAS_KEY, rekapRingkas, suratTugasData } from './dokumen'
import CetakBreadcrumb from './CetakBreadcrumb'

// ---------------------------------------------------------------------------
// Cetak Dokumen (Admin & Ketua LPPM, route /cetak-dokumen; dulu Export/Print
// Laporan di /export). Wadah kartu dokumen: status konfigurasi, tombol Cetak,
// tombol Konfigurasi (ke halaman konfigurasi masing-masing).
//   1. Rekapitulasi Proposal → /cetak-dokumen/rekap-proposal (halaman export lama)
//   2. Surat Tugas           → /cetak-dokumen/surat-tugas
// Konfigurasi disimpan di peramban (utils/cetakConfig; endpoint W-42 belum ada).
// ---------------------------------------------------------------------------

const waktu = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function StatusBadge({ ready, readyText, emptyText }) {
  return ready ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
      <CircleCheck className="size-4" aria-hidden="true" />
      {readyText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
      <CircleDashed className="size-4" aria-hidden="true" />
      {emptyText}
    </span>
  )
}

function DokumenCard({ icon: Icon, title, desc, status, detail, configureTo, onPrint, printing, printDisabled, printHint }) {
  return (
    <li className="card flex flex-col">
      <div className="flex items-start gap-4 px-6 pt-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-800 text-white">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-navy-950">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{desc}</p>
        </div>
      </div>
      <dl className="mx-6 mt-5 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-slate-500">Status konfigurasi</dt>
          <dd>{status}</dd>
        </div>
        {detail ? (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-500">Isi</dt>
            <dd className="min-w-0 text-right text-slate-800">{detail}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-2 px-6 pb-6 pt-5">
        <button type="button" onClick={onPrint} disabled={printing || printDisabled} className="btn btn-primary" title={printHint}>
          {printing ? <span className="spinner" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
          {printing ? 'Menyiapkan…' : 'Cetak'}
        </button>
        <Link to={configureTo} className="btn btn-secondary">
          <Settings2 className="size-4" aria-hidden="true" />
          Konfigurasi
        </Link>
        {printDisabled && printHint ? <p className="w-full text-xs text-slate-500">{printHint}</p> : null}
      </div>
    </li>
  )
}

export default function CetakDokumenPage() {
  const location = useLocation()
  const [flash] = useState(() => location.state?.flash || null)
  const [rekap] = useState(() => loadCetakConfig(REKAP_KEY))
  const [surat] = useState(() => loadCetakConfig(SURAT_TUGAS_KEY))
  const [printing, setPrinting] = useState('')

  const cetakRekap = async () => {
    setPrinting('rekap')
    try {
      const params = {}
      ;['periodeId', 'jenis', 'status', 'tahun'].forEach((k) => {
        if (rekap?.[k]) params[k] = rekap[k]
      })
      const res = await exportApi.getProposals(params)
      const data = res.data.data
      if (!data || data.total === 0) {
        alertDialog({ tone: 'info', title: 'Tidak ada data', message: 'Tidak ada proposal yang cocok dengan konfigurasi rekap. Ubah konfigurasi lalu coba lagi.' })
        return
      }
      exportToPDF(data, { periodeNama: rekap?.periodeNama || '', jenis: rekap?.jenis || '', status: rekap?.status || '', tahun: rekap?.tahun || '' })
    } catch {
      alertDialog({ title: 'Gagal mencetak rekap', message: 'Data rekapitulasi tidak dapat dimuat. Coba lagi.' })
    } finally {
      setPrinting('')
    }
  }

  const cetakSurat = () => {
    if (!surat) return
    setPrinting('surat')
    try {
      suratTugasPDF(suratTugasData(surat))
    } catch {
      alertDialog({ title: 'Gagal membuat surat tugas', message: 'Periksa konfigurasi lalu coba lagi.' })
    } finally {
      setPrinting('')
    }
  }

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Cetak Dokumen</h1>
          <p className="page-desc">Atur konfigurasi tiap dokumen, lalu cetak sebagai PDF.</p>
        </div>
        <CetakBreadcrumb />
      </header>

      {flash ? (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {flash}
        </div>
      ) : null}

      <ul className="grid gap-5 lg:grid-cols-2">
        <DokumenCard
          icon={FileSpreadsheet}
          title="Export Rekapitulasi Proposal"
          desc="Rekap proposal per periode, jenis, dan status — PDF (cetak) atau Excel dari halaman konfigurasi."
          status={<StatusBadge ready={Boolean(rekap)} readyText={`Dikonfigurasi · ${waktu(rekap?.savedAt)}`} emptyText="Bawaan (semua data)" />}
          detail={rekapRingkas(rekap)}
          configureTo="/cetak-dokumen/rekap-proposal"
          onPrint={cetakRekap}
          printing={printing === 'rekap'}
        />
        <DokumenCard
          icon={FileSignature}
          title="Buat Surat Tugas"
          desc="Surat tugas untuk tim pengusul berdasarkan proposal atau laporan kegiatan."
          status={<StatusBadge ready={Boolean(surat)} readyText={`Dikonfigurasi · ${waktu(surat?.savedAt)}`} emptyText="Belum dikonfigurasi" />}
          detail={surat?.kegiatan ? `${surat.kegiatan.judul}${surat.nomor ? ` · No. ${surat.nomor}` : ''}` : null}
          configureTo="/cetak-dokumen/surat-tugas"
          onPrint={cetakSurat}
          printing={printing === 'surat'}
          printDisabled={!surat}
          printHint={!surat ? 'Konfigurasi surat tugas dulu (pilih kegiatan, tugas, tanggal, tempat).' : undefined}
        />
      </ul>

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        Konfigurasi tersimpan di peramban ini saja. Penyimpanan di server & arsip dokumen tercetak: <ApiPending />
      </p>
    </div>
  )
}
