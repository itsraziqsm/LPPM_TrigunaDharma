import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useLenis from '../hooks/useLenis'
import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import LogoLppm from '../components/LogoLppm'

const EyeIcon = ({ open }) => open
  ? (
    <Eye size={16} aria-hidden="true" />
  ) : (
    <EyeOff size={16} aria-hidden="true" />
  )

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loading, error, clearError } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const scrollRef = useRef(null)
  useLenis(scrollRef)

  const handleChange = (e) => { clearError(); setForm(f => ({ ...f, [e.target.name]: e.target.value })) }
  const handleSubmit = async (e) => {
    e.preventDefault()
    try { await login(form.email, form.password); navigate('/dashboard') } catch { }
  }

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  return (
    <main ref={scrollRef} className="fixed inset-0 overflow-y-auto bg-white lg:grid lg:grid-cols-[minmax(24rem,34rem)_minmax(0,1fr)]">
      {/* Panel kiri: identitas — navy polos, tanpa dekorasi */}
      <aside className="hidden bg-rail text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12" aria-label="Informasi platform">
        <header className="flex items-center gap-3">
          <LogoLppm className="size-11" />
          <h1 className="font-serif text-2xl font-medium tracking-wide text-white">LPPM</h1>
        </header>

        <section aria-labelledby="platform-title">
          <h2 id="platform-title" className="max-w-md font-serif text-[1.9375rem] font-medium leading-[1.25] text-white">
            Masuk untuk melanjutkan proses penelitian dan pengabdian secara terstruktur.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/60">
            Platform Riset &amp; Pengabdian Masyarakat untuk pengelolaan proposal, evaluasi, monitoring, dan pelaporan.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6">
          <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-white/55" aria-label="Fitur utama">
            {['Proposal', 'Review', 'Laporan', 'Monitoring'].map(t => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-4 font-serif text-[0.9375rem] italic leading-relaxed text-white/45">
            "Mendukung ekosistem penelitian yang inovatif dan berdampak bagi masyarakat."
          </p>
        </footer>
      </aside>

      {/* Panel kanan: formulir */}
      <section className="flex min-h-full items-center justify-center px-6 py-12 sm:px-10" aria-labelledby="login-page-title">
        <div className="rise w-full max-w-[22.5rem]">
          {/* Merek ringkas untuk layar kecil */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <LogoLppm className="size-10" />
            <span className="font-serif text-2xl font-medium tracking-wide text-navy-950">LPPM</span>
          </div>

          <h2 id="login-page-title" className="font-serif text-[2rem] font-medium leading-tight text-navy-950">
            Selamat Datang
          </h2>

          <p className="mt-2 text-base leading-relaxed text-slate-500">
            Masuk ke akun Anda untuk melihat dokumen, meninjau progres, dan melanjutkan pengelolaan kegiatan penelitian maupun pengabdian masyarakat.
          </p>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert" aria-live="polite">
              <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="label">Alamat Email</label>
              <input
                id="email"
                className="input h-11"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="nama@institusi.ac.id"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>

              <div className="relative">
                <input
                  id="password"
                  className="input h-11 pr-32"
                  type={showPwd ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900"
                  onClick={() => setShowPwd(v => !v)}
                  aria-label={showPwd ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPwd}
                  aria-controls="password"
                >
                  <EyeIcon open={showPwd} />
                  <span>{showPwd ? 'Sembunyikan' : 'Tampilkan'}</span>
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary h-11 w-full text-[0.9375rem]" disabled={loading}>
              {loading
                ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="spinner" aria-hidden="true" />
                    Memproses...
                  </span>
                )
                : 'Masuk ke Dashboard'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold text-navy-700 hover:underline">
              Daftar Sekarang
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
