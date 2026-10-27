import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// Periode sebagai "folder" (tema terang; Admin, Ketua LPPM, Dosen):
//   FolderPeriode — kartu folder: bidang atas berwarna (navy = penelitian, brass = pengabdian),
//                   lembar putih bertab berisi judul periode + jumlah kegiatan. `aksi` (opsional)
//                   = tombol kecil di bidang atas (mis. Ubah/Hapus untuk pengelola).
//   GrupTahun     — dropdown per TAHUN (bukan per semester) berisi folder-folder periode;
//                   buka/tutup diingat di localStorage (`kunci`), bawaan: tahun terbaru terbuka.
// Tanpa gradien (aturan desain Navy Akademik).
// ---------------------------------------------------------------------------

const TONE = {
  penelitian: 'bg-navy-200',
  pengabdian: 'bg-brass-300',
}

export function FolderPeriode({ periode, jumlah, terpilih = false, onClick, aksi = null }) {
  const tone = TONE[periode.jenis] || 'bg-slate-200'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={terpilih}
        className={`group relative block w-full overflow-hidden rounded-[1.4rem] border-2 text-left transition-all ${
          terpilih ? 'border-navy-800 shadow-md' : 'border-slate-200 hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md'
        } ${tone}`}
      >
        {/* Bidang atas (punggung folder) */}
        <span className="block h-[4.5rem]" aria-hidden="true" />
        {/* Tab folder + sudut cekung penghubung ke lembar */}
        <span className="absolute left-0 top-12 h-7 w-[48%] rounded-tr-[1.1rem] bg-white" aria-hidden="true" />
        <span
          className="absolute top-[4.25rem] size-5 rounded-bl-[1.1rem] shadow-[-0.6rem_0.6rem_0_0_#fff]"
          style={{ left: 'calc(48% - 0.05rem)' }}
          aria-hidden="true"
        />
        {/* Lembar putih: judul + jumlah kegiatan */}
        <span className="relative -mt-px flex min-h-[8.5rem] flex-col justify-between rounded-tr-[1.1rem] bg-white px-5 pb-4 pt-1">
          <span className="line-clamp-2 text-base font-semibold leading-snug text-navy-950" title={periode.nama}>
            {periode.nama}
          </span>
          <span className="mt-4 flex items-baseline gap-1.5">
            <span className="font-serif text-3xl font-medium leading-none text-navy-950 tabular-nums">
              {jumlah === undefined ? '…' : jumlah === null ? '—' : String(jumlah).padStart(2, '0')}
            </span>
            <span className="text-sm text-slate-500">kegiatan</span>
          </span>
        </span>
      </button>
      {aksi ? <div className="absolute right-3 top-3 flex gap-1">{aksi}</div> : null}
    </div>
  )
}

function bacaBuka(kunci) {
  try {
    return JSON.parse(localStorage.getItem(kunci) || '{}')
  } catch {
    return {}
  }
}

// periodes dikelompokkan per `tahun` (terbaru dulu); children(periodesTahunItu) merender isi grup.
export function GrupTahun({ periodes, kunci, children }) {
  const tahunList = [...new Set(periodes.map((p) => p.tahun))].sort((a, b) => b - a)
  const [buka, setBuka] = useState(() => bacaBuka(kunci))
  const terbuka = (t) => buka[t] ?? t === tahunList[0]
  const toggle = (t) =>
    setBuka((prev) => {
      const next = { ...prev, [t]: !(prev[t] ?? t === tahunList[0]) }
      try {
        localStorage.setItem(kunci, JSON.stringify(next))
      } catch {
        /* abaikan */
      }
      return next
    })

  return (
    <div className="space-y-4">
      {tahunList.map((t) => {
        const isi = periodes.filter((p) => p.tahun === t)
        const open = terbuka(t)
        return (
          <section key={t} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(t)}
              aria-expanded={open}
              aria-controls={`tahun-${t}`}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50"
            >
              <ChevronRight className={`size-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
              <span className="font-serif text-xl font-medium text-navy-950 tabular-nums">{t}</span>
              <span className="text-sm text-slate-500">{isi.length} periode</span>
            </button>
            {open ? (
              <div id={`tahun-${t}`} className="border-t border-slate-100 px-5 pb-5 pt-4">
                {children(isi)}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
