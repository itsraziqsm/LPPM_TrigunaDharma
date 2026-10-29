// ---------------------------------------------------------------------------
// Collapse — buka/tutup halus untuk semua dropdown/panel lipat (tinggi + pudar).
// Memakai transisi grid-template-rows 0fr ↔ 1fr sehingga tinggi "auto" bisa dianimasikan.
// Isi tetap terpasang; saat tertutup diberi `inert` (tidak bisa difokus/diklik) dan
// aria-hidden. Hormati prefers-reduced-motion (tanpa transisi).
// ---------------------------------------------------------------------------
export default function Collapse({ open, id, className = '', innerClassName = '', children }) {
  return (
    <div
      id={id}
      inert={!open}
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
    >
      <div className={`min-h-0 overflow-hidden ${innerClassName}`}>{children}</div>
    </div>
  )
}
