import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useLenis from '../hooks/useLenis'
import { CircleAlert, Eye, EyeOff, Copyright } from 'lucide-react'
import LogoLppm from '../components/LogoLppm'
import AuthIntro from '../components/AuthIntro'
import { hapusPendaftaran } from '../utils/pendaftaran'

const EyeIcon = ({ open }) => open
  ? (
    <Eye size={16} aria-hidden="true" />
  ) : (
    <EyeOff size={16} aria-hidden="true" />
  )

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loading, error, clearError } = useAuthStore()
  // Pesan dari halaman lain (mis. Daftar: AKUN_SUDAH_AKTIF, W-48) + email terisi.
  const location = useLocation()
  const flash = location.state?.flash
  const [form, setForm] = useState({ email: location.state?.email || '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const scrollRef = useRef(null)
  useLenis(scrollRef)

  const handleChange = (e) => { clearError(); setForm(f => ({ ...f, [e.target.name]: e.target.value })) }
  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(form.email, form.password)
      // Akun sudah aktif → penanda "pendaftaran terkirim" di peramban ini tidak relevan lagi.
      hapusPendaftaran()
      navigate('/dashboard')
    } catch { }
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
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 overflow-y-auto bg-white lg:grid lg:grid-cols-[minmax(24rem,34rem)_minmax(0,1fr)]">
      {/* Intro sekali per sesi: berakhir tepat di header panel kiri / merek ponsel */}
      <AuthIntro />

      {/* Panel kiri: identitas — navy polos, tanpa dekorasi */}
      <aside data-intro="panel" className="hidden bg-rail text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12" aria-label="Informasi platform">
        <header className="flex items-center gap-3">
          <LogoLppm className="size-11" data-intro="logo" />
          <h1 data-intro="title" className="font-serif text-2xl font-medium tracking-wide text-white">LPPM</h1>
        </header>

        <section className="auth-kiri-masuk" aria-labelledby="platform-title">
          <h2 id="platform-title" className="max-w-md font-serif text-[2.75rem] font-medium leading-[1.15] text-white">
            Selamat Datang
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/60">
            Platform Riset &amp; Pengabdian Masyarakat untuk pengelolaan proposal, evaluasi, monitoring, dan pelaporan.
          </p>
        </section>

        <footer className="auth-kiri-masuk-lambat border-t border-white/10 pt-6">
          <p className="flex items-center gap-1.5 text-sm text-white/55">
            <Copyright className="size-4" aria-hidden="true" />
            <span>LPPM DevTeam 2026</span>
          </p>
        </footer>
      </aside>

      {/* Panel kanan: hanya formulir masuk, di tengah vertikal (judul & sapaan ada di panel kiri; ponsel tetap tampil di sini). */}
      <section className="flex min-h-full items-center justify-center px-6 py-12 sm:px-10" aria-label="Formulir masuk">
        <div className="rise w-full max-w-[22.5rem]">
          {/* Merek ringkas untuk layar kecil */}
          <div className="mb-10 flex flex-col items-center gap-2 text-center lg:hidden">
            <LogoLppm className="size-10" data-intro="logo" />
            <span data-intro="title" className="font-serif text-2xl font-medium tracking-wide text-navy-950">LPPM</span>
          </div>

          <h2 id="login-page-title" className="font-serif text-[2rem] font-medium leading-tight text-navy-950 lg:hidden">
            Selamat Datang
          </h2>

          <p className="mt-2 text-base leading-relaxed text-slate-500 lg:hidden">
            Masuk ke akun Anda untuk melihat dokumen, meninjau progres, dan melanjutkan pengelolaan kegiatan penelitian maupun pengabdian masyarakat.
          </p>

          {flash && !error ? (
            <div className="mt-6 rounded-lg border border-navy-200 bg-navy-50 px-3.5 py-3 text-sm leading-relaxed text-navy-800 lg:mb-6 lg:mt-0" role="status">
              {flash}
            </div>
          ) : null}

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border lg:mb-6 lg:mt-0 border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert" aria-live="polite">
              <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5 lg:mt-0">
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
