import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck } from 'lucide-react'
import LogoLppm from '../components/LogoLppm'
import { authApi } from '../api/auth'
import useAuthStore from '../store/authStore'
import useLenis from '../hooks/useLenis'

// Halaman publik /verify-email?token=... (link dari email verifikasi).
// Memanggil POST /auth/verify-email; bila user sedang login, store ikut
// diperbarui tanpa fetchMe() (fetchMe memicu layar muat global).
export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const signedIn = useAuthStore((s) => Boolean(s.accessToken || s.user))
  const [state, setState] = useState(token ? 'loading' : 'error') // loading | success | error
  const [message, setMessage] = useState(token ? '' : 'Link verifikasi tidak lengkap. Buka kembali link dari email Anda.')
  const scrollRef = useRef(null)
  const sent = useRef(false)
  useLenis(scrollRef)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true // StrictMode memanggil efek dua kali; token hanya sekali pakai
    authApi
      .verifyEmail(token)
      .then((r) => {
        setMessage(r.data?.message || 'Email berhasil diverifikasi')
        setState('success')
        useAuthStore.setState((st) => (st.user ? { user: { ...st.user, emailVerifiedAt: new Date().toISOString() } } : {}))
      })
      .catch((e) => {
        setMessage(e.response?.data?.message || 'Token verifikasi tidak valid atau kedaluwarsa')
        setState('error')
      })
  }, [token])

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 overflow-y-auto bg-canvas">
      <div className="flex min-h-full flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center gap-3">
          <LogoLppm className="size-10" />
          <span>
            <span className="block font-serif text-xl font-medium leading-none text-navy-950">LPPM</span>
            <span className="mt-1 block text-xs text-slate-500">Universitas Triguna Dharma</span>
          </span>
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <section className="card w-full max-w-md px-6 py-8 text-center" aria-live="polite">
            {state === 'loading' ? (
              <>
                <span className="spinner mx-auto block text-navy-600" aria-hidden="true" />
                <h1 className="mt-4 text-lg font-semibold text-navy-950">Memverifikasi email…</h1>
              </>
            ) : (
              <>
                <span
                  className={`mx-auto grid size-12 place-items-center rounded-full ${
                    state === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}
                >
                  {state === 'success' ? (
                    <CircleCheck className="size-6" strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <CircleAlert className="size-6" strokeWidth={1.8} aria-hidden="true" />
                  )}
                </span>
                <h1 className="mt-4 text-lg font-semibold text-navy-950">
                  {state === 'success' ? 'Email terverifikasi' : 'Verifikasi gagal'}
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">
                  {message}
                  {state === 'error' && signedIn ? '. Minta link baru dari halaman Pengaturan.' : ''}
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  {signedIn ? (
                    <>
                      <Link to="/dashboard" className="btn btn-primary">
                        Ke dashboard
                      </Link>
                      {state === 'error' ? (
                        <Link to="/profil" className="btn btn-secondary">
                          Pengaturan
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <Link to="/login" className="btn btn-primary">
                      Masuk
                    </Link>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
