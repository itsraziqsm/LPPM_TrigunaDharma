import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Intro halaman masuk/daftar (sekali per sesi peramban). Urutan mengikuti frame desain:
//   1. lencana muncul di tengah (membesar halus) → 2. naik →
//   3. huruf L P P M naik bergiliran → 4. subjudul diketik →
//   5. panel navy menyempit ke panel kiri, lencana & "LPPM" meluncur ke header
//      halaman yang sebenarnya ([data-intro="logo|title"]), lalu lapisan memudar.
// Halaman asli sudah dirender di bawah lapisan ini, jadi akhir animasi menyatu tanpa
// lompatan. Klik/tombol apa pun = lewati. prefers-reduced-motion = tidak diputar.
// Semua gerak memakai transform/opacity/clip-path (Web Animations API).
// ---------------------------------------------------------------------------

const KUNCI = 'authIntroSelesai'
const SUBJUDUL = 'Lembaga Penelitian dan Pengabdian kepada Masyarakat'
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)' // easeOutQuint
const EASE_INOUT = 'cubic-bezier(0.65, 0, 0.35, 1)'

function perluDiputar() {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
    return !sessionStorage.getItem(KUNCI)
  } catch {
    return false
  }
}

function tandaiSelesai() {
  try {
    sessionStorage.setItem(KUNCI, '1')
  } catch {
    /* abaikan */
  }
}

// Target yang terlihat (panel kiri di desktop, merek ringkas di ponsel).
function targetTerlihat(nama) {
  return [...document.querySelectorAll(`[data-intro="${nama}"]`)].find((el) => el.getBoundingClientRect().width > 0) || null
}

const jeda = (ms, batal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    batal.push(() => clearTimeout(t))
  })

export default function AuthIntro() {
  const [aktif, setAktif] = useState(perluDiputar)
  const panelRef = useRef(null)
  const logoWrapRef = useRef(null)
  const logoRef = useRef(null)
  const titleWrapRef = useRef(null)
  const titleRef = useRef(null)
  const subRef = useRef(null)
  const rootRef = useRef(null)
  const lewatiRef = useRef(null)

  useEffect(() => {
    if (!aktif) return undefined
    const batal = []
    const anims = []
    let selesai = false
    // true saat efek dibersihkan (React StrictMode memasang efek dua kali di mode dev, atau
    // halaman dilepas): animasi dibatalkan → promise .finished ditolak; itu BUKAN akhir intro.
    let dibatalkan = false
    // Target asli disembunyikan selama salinannya terbang (mencegah judul ganda saat panel memudar di ponsel).
    const tersembunyi = []
    const tampilkanTarget = () => tersembunyi.splice(0).forEach((el) => (el.style.visibility = ''))
    const main = (el, keyframes, opts) => {
      const a = el.animate(keyframes, { fill: 'forwards', easing: EASE, ...opts })
      anims.push(a)
      return a
    }
    const tutup = () => {
      if (selesai || dibatalkan) return
      selesai = true
      tampilkanTarget()
      tandaiSelesai()
      setAktif(false)
    }
    // Lewati: hentikan semua lalu pudarkan lapisan dengan cepat.
    lewatiRef.current = () => {
      if (selesai) return
      batal.forEach((f) => f())
      anims.forEach((a) => a.pause())
      const fade = rootRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' })
      if (fade) fade.onfinish = tutup
      else tutup()
    }

    const jalankan = async () => {
      const panel = panelRef.current
      const logoWrap = logoWrapRef.current
      const logo = logoRef.current
      const titleWrap = titleWrapRef.current
      const title = titleRef.current
      const sub = subRef.current
      const huruf = [...title.querySelectorAll('[data-huruf]')]
      // Mulai dari keadaan bersih (efek bisa dijalankan ulang).
      sub.style.opacity = '0'
      sub.firstChild.textContent = '\u200b'
      titleWrap.style.width = ''
      const vh = window.innerHeight
      const naik = Math.min(130, vh * 0.13)

      // 1. Lencana muncul di tengah.
      await main(logoWrap, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.72)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }], { duration: 650 }).finished
      await jeda(150, batal)

      // 2. Lencana naik memberi ruang untuk teks.
      await main(logoWrap, [{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: `translate(-50%, calc(-50% - ${naik}px)) scale(1)` }], { duration: 600, easing: EASE_INOUT }).finished

      // 3. Huruf L P P M naik bergiliran.
      main(titleWrap, [{ opacity: 0 }, { opacity: 1 }], { duration: 1 })
      await Promise.all(
        huruf.map(
          (h, i) =>
            main(h, [{ opacity: 0, transform: 'translateY(0.9em)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 620, delay: i * 110 }).finished,
        ),
      )
      await jeda(120, batal)

      // 4. Subjudul diketik.
      sub.style.opacity = '1'
      for (let i = 1; i <= SUBJUDUL.length; i += 1) {
        sub.firstChild.textContent = SUBJUDUL.slice(0, i)
        await jeda(22, batal)
      }
      await jeda(650, batal)

      // 5. Menyatu ke halaman: panel menyempit, lencana & judul meluncur ke header.
      const tLogo = targetTerlihat('logo')
      const tTitle = targetTerlihat('title')
      ;[tLogo, tTitle].filter(Boolean).forEach((el) => {
        el.style.visibility = 'hidden'
        tersembunyi.push(el)
      })
      const aside = document.querySelector('[data-intro="panel"]')
      const asideW = aside && aside.getBoundingClientRect().width > 0 ? aside.getBoundingClientRect().width : 0
      const durasi = 900

      main(sub, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 300 })
      if (asideW) {
        main(panel, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: `inset(0 ${window.innerWidth - asideW}px 0 0)` }], { duration: durasi, easing: EASE_INOUT })
      } else {
        main(panel, [{ opacity: 1 }, { opacity: 0 }], { duration: durasi, easing: EASE_INOUT })
      }
      const gerak = []
      if (tLogo) {
        const a = logo.getBoundingClientRect()
        const b = tLogo.getBoundingClientRect()
        gerak.push(
          main(logo, [{ transform: 'translate(0, 0) scale(1)' }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})` }], {
            duration: durasi,
            easing: EASE_INOUT,
          }).finished,
        )
      }
      if (tTitle) {
        // Bekukan lebar pembungkus (dipusatkan -50%) agar perubahan letter-spacing tidak menggeser judul.
        titleWrap.style.width = `${titleWrap.getBoundingClientRect().width}px`
        const a = title.getBoundingClientRect()
        const b = tTitle.getBoundingClientRect()
        const cs = getComputedStyle(tTitle)
        const besarAsal = parseFloat(getComputedStyle(title).fontSize)
        const besarTujuan = parseFloat(cs.fontSize)
        const skala = besarTujuan / besarAsal
        // Judul asli punya line-height; geser ke tengah kotak barisnya.
        const dy = b.top + (b.height - besarTujuan) / 2 - a.top
        const jarakTujuan = (parseFloat(cs.letterSpacing) || 0) / skala
        gerak.push(
          main(
            title,
            [
              { transform: 'translate(0, 0) scale(1)', letterSpacing: getComputedStyle(title).letterSpacing, color: '#ffffff' },
              { transform: `translate(${b.left - a.left}px, ${dy}px) scale(${skala})`, letterSpacing: `${jarakTujuan}px`, color: cs.color },
            ],
            { duration: durasi, easing: EASE_INOUT },
          ).finished,
        )
      }
      await Promise.all(gerak)
      tampilkanTarget() // salinan tepat menutupi target → tukar tanpa terlihat
      await jeda(80, batal)
      const fade = main(rootRef.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'linear' })
      await fade.finished
      tutup()
    }

    jalankan().catch((err) => {
      if (!dibatalkan) {
        console.warn('AuthIntro dihentikan:', err)
        tutup()
      }
    })
    const lewati = () => lewatiRef.current?.()
    window.addEventListener('keydown', lewati)
    return () => {
      dibatalkan = true
      window.removeEventListener('keydown', lewati)
      tampilkanTarget()
      batal.forEach((f) => f())
      anims.forEach((a) => a.cancel())
    }
  }, [aktif])

  if (!aktif) return null

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[60] cursor-pointer select-none" onClick={() => lewatiRef.current?.()} aria-hidden="true">
      <div ref={panelRef} className="absolute inset-0 bg-rail" />
      <div ref={logoWrapRef} className="absolute left-1/2 top-1/2 opacity-0" style={{ width: 'min(15rem, 42vw)' }}>
        <img
          ref={logoRef}
          src="/brand/logo-lppm.webp"
          alt=""
          width={240}
          height={240}
          draggable={false}
          className="block w-full origin-top-left rounded-full shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)]"
        />
      </div>
      <div ref={titleWrapRef} className="absolute left-1/2 top-1/2 -translate-x-1/2 opacity-0" style={{ marginTop: 'min(5.5rem, 9vh)' }}>
        <span
          ref={titleRef}
          className="inline-block origin-top-left whitespace-nowrap font-serif font-medium leading-none text-white"
          style={{ fontSize: 'clamp(3.25rem, 9vw, 6rem)', letterSpacing: '0.18em' }}
        >
          {'LPPM'.split('').map((c, i) => (
            <span key={i} data-huruf className="inline-block opacity-0">
              {c}
            </span>
          ))}
        </span>
      </div>
      <p
        ref={subRef}
        className="absolute inset-x-6 top-1/2 text-center text-lg text-white/85 opacity-0 sm:text-2xl"
        style={{ marginTop: 'calc(min(5.5rem, 9vh) + clamp(4.75rem, 12vw, 8rem))' }}
      >
        {/* teks diisi bertahap; tinggi baris dijaga agar tidak melompat */}
        <span>{'​'}</span>
      </p>
    </div>,
    document.body,
  )
}
