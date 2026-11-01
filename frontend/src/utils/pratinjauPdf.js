// ---------------------------------------------------------------------------
// Cetak PDF = buka PRATINJAU di tab baru (penampil PDF peramban; dari sana bisa diunduh/dicetak),
// bukan langsung mengunduh. Dipakai semua generator PDF jspdf di Cetak Dokumen & Cetak Laporan.
//   siapkanTab()          — panggil SINKRON di awal klik sebelum ambil data (await), agar tab tidak
//                           diblokir pemblokir popup; tab menampilkan "Menyiapkan PDF…".
//   tampilkanPdf(doc, nm) — isi tab yang disiapkan (atau buka tab baru) dengan blob PDF; bila
//                           popup diblokir → jatuh ke unduhan biasa (doc.save).
//   batalTab()            — tutup tab yang disiapkan (gagal muat / data kosong).
// ---------------------------------------------------------------------------

let tabSiap = null

export function siapkanTab() {
  try {
    tabSiap = window.open('', '_blank')
    if (tabSiap) {
      tabSiap.document.title = 'Menyiapkan PDF…'
      tabSiap.document.body.style.cssText = 'font-family:system-ui,sans-serif;color:#475569;display:grid;place-items:center;height:100vh;margin:0'
      tabSiap.document.body.textContent = 'Menyiapkan PDF…'
    }
  } catch {
    tabSiap = null
  }
  return tabSiap
}

export function batalTab() {
  try {
    if (tabSiap && !tabSiap.closed) tabSiap.close()
  } catch {
    /* abaikan */
  }
  tabSiap = null
}

export function tampilkanPdf(doc, namaFile) {
  const nama = String(namaFile || 'dokumen').replace(/\.pdf$/i, '')
  doc.setProperties({ title: nama })
  const url = doc.output('bloburl')
  const tab = tabSiap && !tabSiap.closed ? tabSiap : null
  tabSiap = null
  if (tab) {
    tab.location.href = url
    return
  }
  const baru = window.open(url, '_blank')
  if (!baru) doc.save(`${nama}.pdf`)
}
