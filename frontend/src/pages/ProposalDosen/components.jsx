// ── Komponen UI Bersama ───────────────────────────────────────────────────────

export function Badge({ label, className }) {
    return <span className={`badge ${className}`}>{label}</span>
}

export function Modal({ title, onClose, children, wide, maxWidth }) {
    return (
        <div className="overlay">
            <section
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`dialog flex max-h-full flex-col ${maxWidth || (wide ? 'max-w-5xl' : 'max-w-2xl')}`}
            >
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-3">
                    <h3 className="min-w-0 text-lg font-semibold leading-snug text-navy-950">{title}</h3>

                    <button
                        onClick={onClose}
                        aria-label="Tutup modal"
                        title="Tutup"
                        className="icon-btn"
                    >
                        <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                {/* Penggulir tanpa padding agar footer lengket (bila ada) menempel di dasar dialog */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="px-6 py-6">{children}</div>
                </div>
            </section>
        </div>
    )
}

export function InfoRow({ label, value }) {
    if (value === undefined || value === null || value === '') return null
    return (
        <div className="grid grid-cols-1 gap-1 border-b border-slate-100 py-3.5 last:border-0 md:grid-cols-[200px_minmax(0,1fr)] md:items-baseline md:gap-4">
            <span className="text-sm text-slate-500">{label}</span>
            <span className="break-words text-base leading-relaxed text-slate-900">{value}</span>
        </div>
    )
}

export function SectionBox({ title, children }) {
    return (
        <section className="card overflow-hidden">
            <header className="border-b border-slate-200 px-5 py-3.5">
                <h4 className="text-base font-semibold text-navy-950">{title}</h4>
            </header>
            <div className="px-5 py-4">{children}</div>
        </section>
    )
}

export function FormField({ label, required, htmlFor, children }) {
    return (
        <div>
            <label htmlFor={htmlFor} className="label">
                {label} {required && <span className="text-red-600">*</span>}
            </label>
            {children}
        </div>
    )
}

// Kartu angka ringkas: titik warna status + label, angka serif besar
export function StatCard({ label, value, color }) {
    return (
        <article className="bg-white px-5 py-4">
            <div className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
                <p className="text-sm text-slate-500">{label}</p>
            </div>
            <p className="mt-2 font-serif text-3xl font-medium leading-none tracking-tight text-navy-950 tabular-nums">{value}</p>
        </article>
    )
}
