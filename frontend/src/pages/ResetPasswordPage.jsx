import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleAlert, Eye, EyeOff, LinkIcon } from 'lucide-react'
import useLenis from '../hooks/useLenis'
import MerekLppm from '../components/MerekLppm'
import TombolProses from '../components/TombolProses'
import { authApi } from '../api/auth'
import { pesanDariGalat } from '../utils/pesanGalat'
import { tungguOutro } from '../utils/tungguOutro'
import useAuthStore from '../store/authStore'

// ---------------------------------------------------------------------------
// /reset-password?token=… (publik, tanpa guard — tautan dari email lupa password):
// POST /auth/reset-password { token, newPassword } (min. 8 karakter). Berhasil → semua sesi dicabut
// server; sesi di peramban ini ikut dikosongkan lalu ke /login dengan pesan.
// ---------------------------------------------------------------------------

export default function ResetPasswordPage() {
  const scrollRef = useRef(null)
  useLenis(scrollRef)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [pwd, setPwd] = useState('')
  const [ulang, setUlang] = useState('')
  const [lihat, setLihat] = useState(false)
  const [galat, setGalat] = useState('')
  const [proses, setProses] = useState(false)
  const [berhasil, setBerhasil] = useState(false)

  const simpan = async (e) => {
    e.preventDefault()
    if (pwd.length < 8) return setGalat('Password baru minimal 8 karakter.')
    if (pwd !== ulang) return setGalat('Konfirmasi password tidak sama.')
    setGalat('')
    setProses(true)
    try {
      await authApi.resetPassword(token, pwd)
      setBerhasil(true)
      await tungguOutro()
      // Server mencabut semua refresh token → kosongkan sesi lokal juga.
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
      navigate('/login', { replace: true, state: { flash: 'Password berhasil diubah. Silakan masuk dengan password baru.' } })
    } catch (err) {
      setGalat(pesanDariGalat(err, 'Password gagal diubah. Coba lagi.'))
      setBerhasil(false)
      setProses(false)
    }
  }

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 grid place-items-center overflow-y-auto bg-canvas px-6 py-12">
      <section className="rise w-full max-w-md" aria-labelledby="reset-judul">
        <MerekLppm />
        {!token ? (
          <div className="mt-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">
              <LinkIcon size={24} aria-hidden="true" />
            </div>
            <h1 id="reset-judul" className="mt-6 font-serif text-3xl font-medium text-navy-950">
              Tautan Tidak Lengkap
            </h1>
            <p className="mt-3 text-base text-slate-600">Buka kembali tautan dari email, atau minta tautan baru.</p>
            <Link to="/lupa-password" className="btn btn-primary mt-8">
              Minta Tautan Baru
            </Link>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h1 id="reset-judul" className="font-serif text-2xl font-medium text-navy-950">
              Buat Password Baru
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">Setelah disimpan, Anda keluar dari semua perangkat dan masuk lagi dengan password baru.</p>
            {galat ? (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert">
                <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <span>
                  {galat}
                  {/kedaluwarsa|tidak valid/i.test(galat) ? (
                    <>
                      {' '}
                      <Link to="/lupa-password" className="font-semibold underline">
                        Minta tautan baru
                      </Link>
                    </>
                  ) : null}
                </span>
              </div>
            ) : null}
            <form onSubmit={simpan} className="mt-5 space-y-5" noValidate>
              <div>
                <label htmlFor="reset-pwd" className="label">
                  Password Baru
                </label>
                <div className="relative">
                  <input
                    id="reset-pwd"
                    className="input h-11 pr-12"
                    type={lihat ? 'text' : 'password'}
                    value={pwd}
                    onChange={(e) => {
                      setPwd(e.target.value)
                      setGalat('')
                    }}
                    placeholder="Minimal 8 karakter"
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setLihat((v) => !v)}
                    aria-label={lihat ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={lihat}
                    className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-navy-900"
                  >
                    {lihat ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="reset-ulang" className="label">
                  Ulangi Password Baru
                </label>
                <input
                  id="reset-ulang"
                  className="input h-11"
                  type={lihat ? 'text' : 'password'}
                  value={ulang}
                  onChange={(e) => {
                    setUlang(e.target.value)
                    setGalat('')
                  }}
                  autoComplete="new-password"
                />
              </div>
              <TombolProses proses={proses} berhasil={berhasil} className="h-11 w-full text-[0.9375rem]" srProses="Menyimpan password…" srBerhasil="Password tersimpan">
                Simpan Password Baru
              </TombolProses>
            </form>
          </div>
        )}
      </section>
    </main>
  )
}
