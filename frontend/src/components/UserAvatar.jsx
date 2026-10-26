import { useState } from 'react'
import { API_BASE_URL } from '../api/axios'

// Foto profil user atau inisial nama. Sumber foto:
//   1. user.fotoUrl (dari /auth/me & GET /users/:id; memuat `?v=` agar cache segar), atau
//   2. GET /users/:id/foto (publik) berdasarkan user.id — dipakai untuk user lain di daftar,
//      tim, reviewer, dsb. yang responsnya tidak memuat fotoUrl.
// Bila gambar gagal dimuat (404 = belum ada foto) tampil inisial; id yang gagal diingat
// selama sesi agar tidak diminta berulang.
const gagal = new Set()

export default function UserAvatar({
  user,
  className = 'size-9',
  fallbackClassName = 'bg-white/10 text-white',
  rounded = 'rounded-full',
  alt,
}) {
  const [broken, setBroken] = useState(null)
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

  if (src && broken !== src && !gagal.has(src)) {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        onError={() => {
          gagal.add(src)
          setBroken(src)
        }}
        className={`${className} shrink-0 ${rounded} object-cover`}
      />
    )
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center ${rounded} font-semibold ${fallbackClassName}`} aria-hidden={alt ? undefined : 'true'}>
      {initial}
    </span>
  )
}
