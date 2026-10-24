import { X } from 'lucide-react'
// ─── Shared UI Components ─────────────────────────────────────────────────────

export function Badge({ label, className }) {
    return <span className={`badge ${className}`}>{label}</span>
}

// Tombol tutup berbentuk ikon (X) untuk dialog dan panel
export function CloseButton({ onClick, label = 'Tutup' }) {
    return (
        <button onClick={onClick} className="icon-btn" aria-label={label} title={label}>
            <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </button>
    )
}

export function Modal({ title, onClose, children, wide }) {
    return (
        <div className="overlay">
            <div className={`dialog ${wide ? 'max-w-2xl' : 'max-w-xl'}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
                    <h3 className="text-lg font-semibold text-navy-950">{title}</h3>
                    <CloseButton onClick={onClose} />
                </header>

                <div className="max-h-[80vh] overflow-y-auto px-6 py-5">
                    {children}
                </div>
            </div>
        </div>
    )
}

// Overlay modal for large panels (proposal list & detail) — centered, full-height-ish
export function OverlayPanel({ onClose, children, size = 'md' }) {
    const sizeClass = {
        sm: 'max-w-2xl',
        md: 'max-w-3xl',
        lg: 'max-w-5xl',
        xl: 'max-w-6xl',
    }[size] || 'max-w-3xl'

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose()
    }

    return (
        <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-navy-950/50 px-4 py-6"
            onClick={handleBackdrop}
        >
            <div
                className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${sizeClass}`}
                role="dialog"
                aria-modal="true"
            >
                {children}
            </div>
        </div>
    )
}

export function SectionLabel({ children }) {
    return (
        <p className="mb-3 text-sm font-semibold text-navy-950">
            {children}
        </p>
    )
}
