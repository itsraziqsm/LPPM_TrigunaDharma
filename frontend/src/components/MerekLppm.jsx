import LogoLppm from './LogoLppm'

// Merek ringkas halaman mandiri (tamu): lencana LPPM + teks "LPPM" di sampingnya, rata tengah.
export default function MerekLppm({ className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <LogoLppm className="size-12" />
      <span className="font-serif text-3xl font-medium tracking-wide text-navy-950">LPPM</span>
    </div>
  )
}
