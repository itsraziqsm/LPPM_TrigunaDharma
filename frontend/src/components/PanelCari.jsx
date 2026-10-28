import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Panel cari standar (semua halaman): kolom cari · tombol Filter · tombol Cari.
//   - Panel filter (children) hanya tampil setelah tombol Filter dibuka; tanpa children = tanpa Filter.
//   - Baris "Filter aktif" (chip × per filter + "Hapus semua") hanya tampil bila `aktif` tidak kosong.
//   - `bare` = tanpa bingkai kartu (dipakai di dalam kartu/panel lain).
// Props: id, value, onChange(teks), onSubmit(), placeholder, aktif=[{ key, label, onRemove }], onReset.
// PilihanFilter = grup tombol pilihan tunggal untuk isi panel filter.
// ---------------------------------------------------------------------------

export function PilihanFilter({ label, items, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map(([v, l]) => (
          <button
            key={v || 'semua'}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
              value === v ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export default function PanelCari({ id, value, onChange, onSubmit, placeholder = 'Cari', aktif = [], onReset, bare = false, children = null }) {
  const [buka, setBuka] = useState(false)
  return (
    <section className={bare ? '@container' : '@container card p-4 sm:p-5'} aria-label="Pencarian dan filter">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit?.()
        }}
        className="flex flex-col gap-2 @lg:flex-row"
      >
        <label htmlFor={`${id}-cari`} className="sr-only">
          {placeholder}
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id={`${id}-cari`} type="search" className="input pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {children ? (
            <button
              type="button"
              aria-expanded={buka}
              aria-controls={`${id}-filter`}
              onClick={() => setBuka((v) => !v)}
              className={`btn flex-1 @lg:flex-none ${buka ? 'btn-primary' : 'btn-secondary'}`}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filter
              {aktif.length ? (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${buka ? 'bg-white text-navy-800' : 'bg-navy-800 text-white'}`}>{aktif.length}</span>
              ) : null}
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary flex-1 @lg:flex-none">
            Cari
          </button>
        </div>
      </form>

      {children && buka ? (
        <div id={`${id}-filter`} className="mt-4 border-t border-slate-100 pt-4">
          {children}
        </div>
      ) : null}

      {aktif.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          Filter aktif:
          {aktif.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onRemove}
              aria-label={`Hapus filter ${a.label}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:border-navy-300"
            >
              {a.label}
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
          {onReset ? (
            <button type="button" onClick={onReset} className="font-medium text-navy-600 hover:text-navy-800">
              Hapus semua
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
