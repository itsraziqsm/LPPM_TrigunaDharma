// Logo resmi LPPM STMIK Triguna Dharma (public/brand/logo-lppm.webp, lencana bundar).
export default function LogoLppm({ className = 'size-10', ...rest }) {
  return <img {...rest} src="/brand/logo-lppm.webp" alt="" width={240} height={240} draggable={false} className={`shrink-0 select-none rounded-full ${className}`} />
}
