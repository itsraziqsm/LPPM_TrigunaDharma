import { useState } from 'react'
import { WARNA, fmtPersen as fmt, persen } from './warna'

// ---------------------------------------------------------------------------
// Grafik ringan untuk halaman Statistik (tanpa pustaka chart). Warna data dicek dengan
// validator palet (skill dataviz): status = navy-500/brass-500/hijau/merah, jenis =
// navy-500 vs brass-500; pasangan hijau↔merah di batas CVD → selalu ada label + persen
// (identitas tidak hanya dari warna). Teks memakai warna teks, bukan warna seri.
// ---------------------------------------------------------------------------

// Donat: segmen { key, label, value, color }; tengah = segmen yang di-hover atau `tengah` bawaan.
// Celah 2px antarsegmen; hover/fokus per segmen dari legenda maupun busur.
export function Donat({ segmen, tengah, label, onPilih, aktif }) {
  const [hover, setHover] = useState(null)
  const total = segmen.reduce((n, s) => n + s.value, 0)
  const R = 42
  const C = 2 * Math.PI * R
  const celah = segmen.filter((s) => s.value > 0).length > 1 ? 2 : 0
  // Posisi awal tiap busur = jumlah panjang busur sebelumnya.
  const panjang = segmen.map((s) => (total ? (s.value / total) * C : 0))
  const busur = segmen.map((s, i) => ({
    ...s,
    dash: Math.max(0, panjang[i] - celah),
    offset: panjang.slice(0, i).reduce((n, v) => n + v, 0),
  }))
  const sorot = segmen.find((s) => s.key === hover)
  return (
    <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={label}>
          <circle cx="50" cy="50" r={R} fill="none" stroke={WARNA.track} strokeWidth="12" />
          {busur.map((s) =>
            s.dash > 0 ? (
              <circle
                key={s.key}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.key ? 15 : 12}
                strokeDasharray={`${s.dash} ${C - s.dash}`}
                strokeDashoffset={-s.offset}
                className="cursor-pointer transition-[stroke-width] duration-150 motion-reduce:transition-none"
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onClick={onPilih ? () => onPilih(s.key) : undefined}
              >
                <title>{`${s.label}: ${s.value} (${fmt(persen(s.value, total))})`}</title>
              </circle>
            ) : null,
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-live="polite">
          <div>
            <p className="font-serif text-2xl font-medium tabular-nums text-navy-950">{sorot ? fmt(persen(sorot.value, total)) : tengah.nilai}</p>
            <p className="mx-auto max-w-[6.5rem] text-xs leading-tight text-slate-500">{sorot ? sorot.label : tengah.label}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {segmen.map((s) => {
          const isi = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span className="truncate text-slate-700">{s.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-900">
                <strong className="font-semibold">{s.value}</strong>
                <span className="ml-1.5 text-slate-500">{fmt(persen(s.value, total))}</span>
              </span>
            </>
          )
          const kelas = `flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left ${hover === s.key ? 'bg-slate-50' : ''}`
          return (
            <li key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
              {onPilih ? (
                <button
                  type="button"
                  onClick={() => onPilih(s.key)}
                  onFocus={() => setHover(s.key)}
                  onBlur={() => setHover(null)}
                  aria-pressed={aktif === s.key}
                  className={`${kelas} hover:bg-slate-50 ${aktif === s.key ? 'ring-1 ring-navy-200' : ''}`}
                >
                  {isi}
                </button>
              ) : (
                <div className={kelas}>{isi}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Batang 100% dua bagian (penelitian vs pengabdian) per baris ukuran; nilai & persen di bawah batang.
export function Banding({ baris, kiri, kanan }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700" aria-hidden="true">
        {[kiri, kanan].map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ul className="space-y-4">
        {baris.map((b) => {
          const total = b.kiri + b.kanan
          const pk = persen(b.kiri, total)
          const pn = total ? Math.round((100 - pk) * 10) / 10 : 0
          return (
            <li key={b.label}>
              <p className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">{b.label}</span>
                <span className="tabular-nums text-slate-500">{b.format(total)}</span>
              </p>
              <div
                className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${b.label}: ${kiri.label} ${b.format(b.kiri)} (${fmt(pk)}), ${kanan.label} ${b.format(b.kanan)} (${fmt(pn)})`}
              >
                {b.kiri > 0 ? <span className="h-full rounded-l-full" style={{ width: `${pk}%`, backgroundColor: kiri.color }} title={`${kiri.label}: ${b.format(b.kiri)} (${fmt(pk)})`} /> : null}
                {b.kanan > 0 ? <span className="h-full flex-1 rounded-r-full" style={{ backgroundColor: kanan.color }} title={`${kanan.label}: ${b.format(b.kanan)} (${fmt(pn)})`} /> : null}
              </div>
              <p className="mt-1 flex justify-between gap-2 text-xs tabular-nums text-slate-600">
                <span>
                  {kiri.label} {b.format(b.kiri)} · {fmt(pk)}
                </span>
                <span>
                  {kanan.label} {b.format(b.kanan)} · {fmt(pn)}
                </span>
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Batang horizontal satu seri (topik terpopuler): panjang relatif terhadap nilai terbesar.
export function BatangTopik({ items, satuan = 'proposal' }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-slate-500">Belum ada data topik.</p>
  const maks = Math.max(...items.map((i) => i.jumlah))
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={it.nama} className="group grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 text-sm" title={`${it.nama}: ${it.jumlah} ${satuan}`}>
          <span className="text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
          <div className="min-w-0">
            <p className="flex items-baseline justify-between gap-2">
              <span className="truncate text-slate-800">{it.nama}</span>
              <span className="shrink-0 tabular-nums font-semibold text-slate-900">{it.jumlah}</span>
            </p>
            <div className="mt-1 h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-colors group-hover:opacity-80" style={{ width: `${(it.jumlah / maks) * 100}%`, backgroundColor: WARNA.navy }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
