import { useState } from 'react'
import { API_BASE_URL } from '../api/axios'

// Foto profil user (GET /users/:id/foto lewat user.fotoUrl, relatif ke base URL
// API) atau inisial nama bila belum ada foto / gambar gagal dimuat.
export default function UserAvatar({ user, className = 'size-9', fallbackClassName = 'bg-white/10 text-white', alt }) {
  const [broken, setBroken] = useState(null)
  const initial = (user?.name || user?.fullName || '?').charAt(0).toUpperCase()
  const src = user?.fotoUrl ? `${API_BASE_URL}${user.fotoUrl}` : null

  if (src && broken !== src) {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        onError={() => setBroken(src)}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-full font-semibold ${fallbackClassName}`} aria-hidden={alt ? undefined : 'true'}>
      {initial}
    </span>
  )
}
