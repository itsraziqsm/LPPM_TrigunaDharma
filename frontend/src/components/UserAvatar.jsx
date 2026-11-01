import { useState } from 'react'
import { API_BASE_URL } from '../api/axios'

// Foto profil user atau inisial nama. Sumber foto:
//   1. user.fotoUrl (dari /auth/me & GET /users/:id; memuat `?v=` agar cache segar), atau
//   2. GET /users/:id/foto (publik) berdasarkan user.id — dipakai untuk user lain di daftar,
//      tim, reviewer, dsb. yang responsnya tidak memuat fotoUrl.
// Bila gambar gagal dimuat (404 = belum ada foto) tampil inisial; id yang gagal diingat
// selama sesi agar tidak diminta berulang.
// Tanpa kedip: inisial SELALU tampil lebih dulu; foto ditumpuk di atasnya dan baru terlihat
// (memudar masuk) setelah benar-benar termuat. Foto yang pernah termuat langsung tampil.
const gagal = new Set()
const termuat = new Set()

export default function UserAvatar({
  user,
  className = 'size-9',
  fallbackClassName = 'bg-white/10 text-white',
  rounded = 'rounded-full',
  alt,
}) {
  const [, setVersi] = useState(0)
  const initial = (user?.fullName || user?.name || '?').trim().charAt(0).toUpperCase() || '?'
  const id = user?.id ?? user?.userId
  // Bila respons memuat field fotoUrl (walau null = sudah dihapus), percayai itu saja; tebakan
  // lewat id hanya untuk objek user tanpa field tsb. (hindari menampilkan foto lama dari cache).
  const punyaField = user && Object.prototype.hasOwnProperty.call(user, 'fotoUrl')
  const src = punyaField
    ? user.fotoUrl
      ? `${API_BASE_URL}${user.fotoUrl}`
      : null
    : id != null
      ? `${API_BASE_URL}/users/${id}/foto`
      : null
  const pakaiFoto = Boolean(src) && !gagal.has(src)
  const tampilFoto = pakaiFoto && termuat.has(src)

  return (
    <span
      className={`${className} relative grid shrink-0 place-items-center overflow-hidden ${rounded} font-semibold ${fallbackClassName}`}
      aria-hidden={alt ? undefined : 'true'}
    >
      <span aria-hidden={tampilFoto || undefined}>{initial}</span>
      {pakaiFoto ? (
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          onLoad={() => {
            if (!termuat.has(src)) {
              termuat.add(src)
              setVersi((v) => v + 1)
            }
          }}
          onError={() => {
            gagal.add(src)
            setVersi((v) => v + 1)
          }}
          className={`absolute inset-0 size-full ${rounded} object-cover transition-opacity duration-150 motion-reduce:transition-none ${tampilFoto ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
    </span>
  )
}
