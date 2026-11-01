import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, Clock } from 'lucide-react'
import useLenis from '../hooks/useLenis'
import MerekLppm from '../components/MerekLppm'
import ApiPending from '../components/ApiPending'
import { bacaPendaftaran, hapusPendaftaran } from '../utils/pendaftaran'

// ---------------------------------------------------------------------------
// /register/terkirim (tamu): "Pendaftaran sudah terkirim — menunggu persetujuan admin" (W-48).
// Dibuka setelah daftar berhasil (state.baru), saat server menjawab PENDAFTARAN_MENUNGGU
// (state.menunggu), atau saat /register dibuka lagi di peramban yang menyimpan penanda
// (utils/pendaftaran.js; kenyamanan saja). "Daftar dengan data lain" menghapus penanda.
// "Cek status" menunggu endpoint opsional POST /auth/register/status (W-48) → ApiPending.
// ---------------------------------------------------------------------------

const PERAN = { dosen: 'Dosen', mahasiswa: 'Mahasiswa' }
const tanggal = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

export default function PendaftaranTerkirimPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  useLenis(scrollRef)
  const [data] = useState(() => bacaPendaftaran())
  const menunggu = Boolean(location.state?.menunggu)

  if (!data) return <Navigate to="/register" replace />

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 grid place-items-center overflow-y-auto bg-canvas px-6 py-12">
      <section className="rise w-full max-w-md text-center" aria-labelledby="terkirim-judul">
        <MerekLppm />
        <div className="mx-auto mt-8 grid size-14 place-items-center rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
          {menunggu ? <Clock size={26} strokeWidth={2} aria-hidden="true" /> : <Check size={26} strokeWidth={2.2} aria-hidden="true" />}
        </div>
        <h1 id="terkirim-judul" className="mt-6 font-serif text-3xl font-medium text-navy-950">
          {menunggu ? 'Pendaftaran Sudah Terkirim' : 'Pendaftaran Terkirim'}
        </h1>
        <p className="mt-3 text-base text-slate-600">
          {menunggu
            ? 'Identitas ini sudah pernah didaftarkan dan masih menunggu persetujuan admin. Pendaftaran tidak perlu diulang.'
            : 'Akun Anda sedang menunggu persetujuan admin.'}
        </p>
        <p className="mt-1 text-sm text-slate-500">Anda dapat masuk setelah akun disetujui.</p>

        <dl className="mx-auto mt-6 grid max-w-xs gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900">{data.email}</dd>
          </div>
          {data.role ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Mendaftar sebagai</dt>
              <dd className="font-medium text-slate-900">{PERAN[data.role] || data.role}</dd>
            </div>
          ) : null}
          {tanggal(data.createdAt) ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Dikirim</dt>
              <dd className="font-medium text-slate-900">{tanggal(data.createdAt)}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Status</dt>
            <dd className="flex items-center gap-2">
              <span className="badge badge-warning">Menunggu</span>
              <ApiPending />
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link to="/login" className="btn btn-primary">
            <ChevronLeft size={14} strokeWidth={2.5} aria-hidden="true" />
            Kembali ke Login
          </Link>
          <button
            type="button"
            className="text-sm font-semibold text-navy-700 hover:underline"
            onClick={() => {
              hapusPendaftaran()
              navigate('/register', { replace: true })
            }}
          >
            Daftar dengan data lain
          </button>
        </div>
        <p className="mx-auto mt-6 max-w-sm text-xs leading-relaxed text-slate-400">
          Bila pendaftaran ditolak, Anda dapat mendaftar ulang dengan identitas yang sama.
        </p>
      </section>
    </main>
  )
}
