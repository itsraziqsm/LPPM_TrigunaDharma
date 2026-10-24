// Pengganti window.confirm / window.alert berbasis Promise. Dialog dirender oleh
// <DialogHost /> (dipasang sekali di main.jsx) memakai ConfirmDialog.
//   if (!(await confirmDialog({ title: 'Hapus proposal?', tone: 'danger' }))) return
//   await alertDialog({ title: 'Gagal membuka dokumen', tone: 'error' })
let listener = null
const queue = []
let seq = 0

function push(opts) {
  return new Promise((resolve) => {
    queue.push({ ...opts, key: (seq += 1), resolve })
    listener?.([...queue])
  })
}

export function confirmDialog(opts) {
  return push({ confirmText: 'Ya, lanjutkan', cancelText: 'Batal', ...opts })
}

export function alertDialog(opts) {
  const o = typeof opts === 'string' ? { title: opts } : opts
  return push({ tone: 'error', confirmText: 'Tutup', ...o, cancelText: null })
}

// Untuk DialogHost: daftar antrean dan penutupan dialog teratas.
export function subscribeDialogs(fn) {
  listener = fn
  fn([...queue])
  return () => {
    if (listener === fn) listener = null
  }
}

export function settleDialog(key, value) {
  const i = queue.findIndex((d) => d.key === key)
  if (i === -1) return
  const [d] = queue.splice(i, 1)
  d.resolve(value)
  listener?.([...queue])
}
