import { useRef } from 'react'
import { useParams, useRouteError, isRouteErrorResponse } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import ErrorState from '../components/ErrorState'
import useLenis from '../hooks/useLenis'
import { ERROR_CODES } from '../utils/errorCodes'

// Halaman galat mandiri (di luar DashboardLayout):
//   /error/:code       — mis. /error/403, /error/408, /error/503
//   path tak dikenal   — 404 (route "*")
//   galat render/route — dipasang sebagai errorElement router (500 / status respons)
export default function ErrorPage({ code: codeProp, routeError = false }) {
  const params = useParams()
  const scrollRef = useRef(null)
  useLenis(scrollRef)

  // useRouteError hanya bermakna saat dirender sebagai errorElement.
  const error = useRouteError()
  let code = Number(codeProp || params.code) || 404
  let detail
  if (routeError && error) {
    if (isRouteErrorResponse(error)) code = error.status
    else {
      code = 500
      detail = import.meta.env.DEV ? String(error?.stack || error?.message || error) : undefined
    }
  }
  if (!ERROR_CODES[code]) code = 404

  let signedIn = false
  try {
    signedIn = Boolean(localStorage.getItem('accessToken'))
  } catch {
    signedIn = false
  }

  return (
    <main ref={scrollRef} className="fixed inset-0 overflow-y-auto bg-canvas">
      <div className="flex min-h-full flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[11px] bg-rail">
            <BookOpen className="text-brass-400" size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-serif text-xl font-medium leading-none text-navy-950">LPPM</span>
            <span className="mt-1 block text-xs text-slate-500">Universitas Triguna Dharma</span>
          </span>
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <ErrorState code={code} signedIn={signedIn} detail={detail} />
        </div>
        <footer className="text-center text-xs text-slate-400">© {new Date().getFullYear()} LPPM Triguna Dharma</footer>
      </div>
    </main>
  )
}
