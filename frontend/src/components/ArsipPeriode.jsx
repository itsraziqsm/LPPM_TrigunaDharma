import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import Breadcrumb from './Breadcrumb'
import Collapse from './Collapse'
import PanelCari, { PilihanFilter } from './PanelCari'

// ---------------------------------------------------------------------------
// Blok bersama Arsip Kegiatan (dosen) & Arsip Project (mahasiswa):
//   PratinjauArsip — daftar di bawah folder terpilih: hanya 3 terbaru + "Lihat lebih banyak" → detail.
//   DetailArsip    — halaman /arsip-…/detail/:id: kepala periode + panel cari (status) + daftar lengkap.
// `item` = { id, judul, status, keterangan, to }; `STATUS` = { kode: [label, kelasBadge] }.
// ---------------------------------------------------------------------------

const PRATINJAU_MAX = 3
const waktu = (x) => new Date(x.updatedAt || x.submittedAt || x.createdAt || 0).getTime()
const urutTerbaru = (list) => [...list].sort((a, b) => waktu(b) - waktu(a))

function Baris({ item, STATUS }) {
  const [label, cls] = STATUS[item.status] || [item.status, 'badge-neutral']
  return (
    <li>
      <Link to={item.to} className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50">
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900 group-hover:text-navy-800">{item.judul}</span>
          <span className="mt-0.5 block text-sm text-slate-500">{item.keterangan}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`badge ${cls}`}>{label}</span>
          <ChevronRight className="size-4 text-slate-400 group-hover:text-navy-700" aria-hidden="true" />
        </span>
      </Link>
    </li>
  )
}

// periode = folder terpilih (null = tertutup); isi periode terakhir dipertahankan selama animasi tutup.
// itemsOf(periodeId) → item; detailTo(periodeId) → URL halaman detail.
export function PratinjauArsip({ periode: dipilih, itemsOf, satuan, detailTo, STATUS, kosong }) {
  const [periode, setPeriode] = useState(dipilih)
  if (dipilih && dipilih !== periode) setPeriode(dipilih)
  const items = periode ? itemsOf(periode.id) : []
  const terbaru = urutTerbaru(items).slice(0, PRATINJAU_MAX)
  return (
    <Collapse open={Boolean(dipilih)}>
      {periode ? (
        <section aria-label={`${satuan} ${periode.nama}`} className="mt-4 rounded-xl border border-slate-200">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold text-navy-950">{periode.nama}</h3>
            <span className="text-sm text-slate-500">
              {items.length > PRATINJAU_MAX ? `${PRATINJAU_MAX} terbaru dari ${items.length} ${satuan}` : `${items.length} ${satuan}`}
            </span>
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">{kosong}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {terbaru.map((it) => (
                <Baris key={it.id} item={it} STATUS={STATUS} />
              ))}
            </ul>
          )}
          <footer className="border-t border-slate-100 px-4 py-2.5 text-right">
            <Link to={detailTo(periode.id)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900">
              Lihat lebih banyak
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </footer>
        </section>
      ) : null}
    </Collapse>
  )
}

const LIMIT = 10
const JENIS = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

export function DetailArsip({ judulMenu, kembaliTo, periode, items, satuan, STATUS, kosong, memuat, gagal }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const q = query.toLowerCase()
  const cocok = urutTerbaru(items || []).filter(
    (it) => (!status || it.status === status) && (!q || it.judul.toLowerCase().includes(q) || (it.keterangan || '').toLowerCase().includes(q)),
  )
  const pages = Math.max(1, Math.ceil(cocok.length / LIMIT))
  const tampil = cocok.slice((page - 1) * LIMIT, page * LIMIT)
  const kodeStatus = [...new Set((items || []).map((it) => it.status))]

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={kembaliTo} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {judulMenu}
        </Link>
        <Breadcrumb items={[{ label: judulMenu, to: kembaliTo }, { label: periode?.nama || 'Detail' }]} />
      </div>

      {gagal ? (
        <div className="card px-6 py-12 text-center text-base text-red-600">Data arsip gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
      ) : memuat ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
      ) : !periode ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-base text-slate-600">Periode tidak ditemukan di arsip Anda.</p>
          <Link to={kembaliTo} className="btn btn-secondary btn-sm mt-4">
            Kembali ke {judulMenu}
          </Link>
        </div>
      ) : (
        <>
          <section className="card p-6">
            {periode.jenis ? <span className="badge badge-tag">{JENIS[periode.jenis] || periode.jenis}</span> : null}
            <h1 className="page-title mt-3">{periode.nama}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {[periode.tahun ? `Tahun ${periode.tahun}` : null, `${items.length} ${satuan}`].filter(Boolean).join(' · ')}
            </p>
          </section>

          <PanelCari
            id="arsip"
            value={search}
            onChange={setSearch}
            onSubmit={() => {
              setQuery(search.trim())
              setPage(1)
            }}
            placeholder={`Cari judul ${satuan}`}
            aktif={status ? [{ key: 'status', label: `Status: ${STATUS[status]?.[0] || status}`, onRemove: () => setStatus('') }] : []}
            onReset={() => setStatus('')}
          >
            <PilihanFilter
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v)
                setPage(1)
              }}
              items={[['', 'Semua status'], ...kodeStatus.map((k) => [k, STATUS[k]?.[0] || k])]}
            />
          </PanelCari>

          <section className="card overflow-hidden">
            {tampil.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">{items.length ? `Tidak ada ${satuan} yang cocok.` : kosong}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {tampil.map((it) => (
                  <Baris key={it.id} item={it} STATUS={STATUS} />
                ))}
              </ul>
            )}
            {pages > 1 ? (
              <nav aria-label="Halaman" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                <span className="tabular-nums">
                  Halaman {page} dari {pages} · {cocok.length} {satuan}
                </span>
                <span className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Sebelumnya
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    Berikutnya
                  </button>
                </span>
              </nav>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
