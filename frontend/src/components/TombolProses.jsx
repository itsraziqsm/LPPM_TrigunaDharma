import { Check } from 'lucide-react'

// Tombol kirim beranimasi (Login & Daftar):
//   proses   → latar & teks memudar, tiga lingkaran kecil di tengah meloncat bergantian (.titik-loncat)
//   berhasil → dua titik kiri mengecil hilang, titik kanan membesar jadi pil hijau "Berhasil" + centang
//              yang tergambar (.pil-isi, .centang-gambar); tunggu tungguOutro() (utils/tungguOutro.js) sebelum pindah halaman.
// Gaya keyframe di index.css. Hormati prefers-reduced-motion.
export default function TombolProses({ proses, berhasil, className = '', srProses = 'Memproses…', srBerhasil = 'Berhasil', children }) {
  return (
    <button
      type="submit"
      disabled={proses}
      aria-busy={proses}
      className={`btn relative overflow-hidden transition-[background-color,box-shadow,color] duration-300 ease-out motion-reduce:transition-none ${
        proses ? 'pointer-events-none bg-transparent text-transparent shadow-none disabled:opacity-100' : 'btn-primary'
      } ${className}`}
    >
      <span className={`inline-flex items-center gap-2 transition-opacity duration-200 ${proses ? 'opacity-0' : 'opacity-100'}`}>{children}</span>
      {proses ? (
        <span className="absolute inset-0 flex items-center justify-center" role="status">
          <span className="sr-only">{berhasil ? srBerhasil : srProses}</span>
          {[0, 1, 2].map((i) => {
            const pil = berhasil && i === 2
            const hilang = berhasil && i < 2
            return (
              <span
                key={i}
                aria-hidden="true"
                className={`flex items-center justify-center overflow-hidden rounded-full transition-[width,height,margin,opacity,background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  berhasil ? '' : 'titik-loncat'
                } ${pil ? 'mx-0 h-10 w-36 bg-emerald-600' : hilang ? 'mx-0 size-0 bg-navy-800 opacity-0' : 'mx-1 size-3 bg-navy-800'}`}
                style={berhasil ? undefined : { animationDelay: `${i * 0.06}s, ${0.3 + i * 0.15}s` }}
              >
                {pil ? (
                  <span className="pil-isi flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-white">
                    Berhasil
                    <Check className="centang-gambar size-[18px]" strokeWidth={2.75} aria-hidden="true" />
                  </span>
                ) : null}
              </span>
            )
          })}
        </span>
      ) : null}
    </button>
  )
}
