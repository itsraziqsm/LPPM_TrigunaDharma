// Simpan respons blob (axios responseType: 'blob') sebagai file unduhan.
// Nama file dari header Content-Disposition bila ada, selain itu `cadangan`.
export function namaFileDari(res, cadangan) {
  const cd = res?.headers?.['content-disposition'] || ''
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* abaikan */
    }
  }
  const plain = cd.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1].trim() : cadangan
}

export function simpanBlob(res, cadangan) {
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = namaFileDari(res, cadangan)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
