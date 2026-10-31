// ---------------------------------------------------------------------------
// Bingkai tabel/daftar bergaya "Riwayat" (M1): kartu berbingkai navy, kepala gelap berisi judul serif,
// deskripsi, dan slot kanan (`badge` — mis. jumlah data — atau `aksi`); `tab` = baris tab di kepala.
// Isi (`children`) di badan putih ber-padding. Dipakai Riwayat Kegiatan, Riwayat Laporan Harian,
// Daftar Luaran, Dokumen Masuk, Pemantauan, Daftar Backup, Riwayat Template, anggota tim.
// ---------------------------------------------------------------------------
export default function KartuNavy({ id, judul, desc, badge = null, aksi = null, tab = null, children, bodyClassName = 'space-y-4 p-4 sm:p-5' }) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-2xl border-2 border-navy-800 bg-white shadow-md">
      <header className={`bg-navy-800 px-5 text-white sm:px-6 ${tab ? 'pb-0 pt-5' : 'py-5'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={id} className="font-serif text-2xl font-medium text-white">
              {judul}
            </h2>
            {desc ? <p className="mt-1 text-sm text-white/75">{desc}</p> : null}
          </div>
          {badge !== null || aksi ? (
            <div className="flex flex-wrap items-center gap-2">
              {badge !== null ? (
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white tabular-nums">{badge}</span>
              ) : null}
              {aksi}
            </div>
          ) : null}
        </div>
        {tab}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

// Tab di kepala gelap KartuNavy (gaya tab Riwayat Kegiatan).
export function TabNavy({ items, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="mt-4 flex gap-6">
      {items.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          onClick={() => onChange(k)}
          className={`border-b-[3px] px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${
            value === k ? 'border-brass-400 text-white' : 'border-transparent text-white/60 hover:border-white/30 hover:text-white'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
