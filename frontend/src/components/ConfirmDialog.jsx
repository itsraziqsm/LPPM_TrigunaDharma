import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Info, Trash2, TriangleAlert } from 'lucide-react'

// Modal konfirmasi/pemberitahuan bergaya dialog "Keluar dari sistem" (pengganti
// window.confirm/alert). Dirender lewat portal ke <body>; Escape / klik latar =
// batal. `cancelText = null` → hanya satu tombol (mode pemberitahuan).
const TONES = {
  danger: { ring: 'bg-red-50 text-red-600 ring-red-50/60', btn: 'bg-red-600 text-white hover:bg-red-700', icon: Trash2 },
  warning: { ring: 'bg-amber-50 text-amber-600 ring-amber-50/60', btn: 'bg-amber-600 text-white hover:bg-amber-700', icon: TriangleAlert },
  primary: { ring: 'bg-navy-50 text-navy-700 ring-navy-50/60', btn: 'btn-primary', icon: CircleCheck },
  info: { ring: 'bg-navy-50 text-navy-700 ring-navy-50/60', btn: 'btn-primary', icon: Info },
  error: { ring: 'bg-red-50 text-red-600 ring-red-50/60', btn: 'btn-primary', icon: CircleAlert },
}

export default function ConfirmDialog({
  tone = 'primary',
  icon,
  title,
  message,
  confirmText = 'Ya, lanjutkan',
  cancelText = 'Batal',
  busy = false,
  busyText,
  onConfirm,
  onCancel,
}) {
  const id = useId()
  const firstRef = useRef(null)
  const t = TONES[tone] || TONES.primary
  const Icon = icon || t.icon

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return createPortal(
    <div className="overlay z-[70]" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={message ? `${id}-desc` : undefined}
        className="dialog max-w-sm px-6 py-6 text-center"
      >
        <span className={`mx-auto grid size-12 place-items-center rounded-full ring-8 ${t.ring}`}>
          <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h2 id={`${id}-title`} className="mt-4 text-lg font-semibold text-navy-950">
          {title}
        </h2>
        {message ? (
          <p id={`${id}-desc`} className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-500">
            {message}
          </p>
        ) : null}
        <div className={`mt-6 grid gap-2.5 ${cancelText ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {cancelText ? (
            <button ref={firstRef} type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary">
              {cancelText}
            </button>
          ) : null}
          <button ref={cancelText ? undefined : firstRef} type="button" onClick={onConfirm} disabled={busy} className={`btn ${t.btn}`}>
            {busy ? busyText || 'Memproses…' : confirmText}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
