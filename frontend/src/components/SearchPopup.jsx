import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownLeft, Search, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Popup pencarian (dipakai GlobalSearch: tombol melayang kanan bawah / Ctrl+F).
// Modal di tengah atas: kolom cari, lalu rekomendasi di bawah kolom yang
// diperbarui mengikuti ketikan (debounce). Latar di-blur dan tidak bisa
// digulir (kelas `search-open` di <html>, lihat index.css). Panah atas/bawah
// memilih, Enter membuka, Esc / klik latar menutup.
// Rekomendasi: fetchRecs(q) -> Promise<[{ key, title, subtitle?, group?, badge?,
// badgeClass?, disabled?, note? }]>; `group` berurutan dirender sebagai judul
// kelompok. onSelect(item, q) saat rekomendasi dipilih; onSubmit(q) (opsional)
// menambah baris pertama "Tampilkan semua hasil ...". decorate(item) (opsional)
// dipanggil saat render. fetchRecs wajib stabil (useCallback). recent (opsional) = item yang
// tampil saat kolom kosong (riwayat, kelompok "Terakhir dibuka"); onClearRecent menghapusnya.
// ---------------------------------------------------------------------------

function PopupPanel({
  title,
  placeholder,
  initialQuery = '',
  minChars = 2,
  fetchRecs,
  onSelect,
  onSubmit,
  onClose,
  keepOpenOnSelect = false,
  decorate,
  hint,
  emptyText = 'Tidak ada hasil. Coba kata kunci lain.',
  recent = [],
  onClearRecent,
  children,
}) {
  const [q, setQ] = useState(initialQuery)
  const [recs, setRecs] = useState({ query: null, src: null, items: [], error: false })
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()
  const titleId = useId()

  const term = q.trim()
  const enough = term.length >= minChars
  const loading = enough && (recs.query !== term || recs.src !== fetchRecs)
  const fetched = enough && !loading ? recs.items : []
  const riwayat = !term && recent.length ? recent.map((r) => ({ ...r, group: 'Terakhir dibuka' })) : []
  const items = riwayat.length ? riwayat : decorate ? fetched.map(decorate) : fetched
  const submitRow = onSubmit && term ? { key: '__submit', submit: true } : null
  const rows = submitRow ? [submitRow, ...items] : items

  // Rekomendasi mengikuti ketikan (debounce 250 ms).
  useEffect(() => {
    if (!enough) return undefined
    let alive = true
    const timer = setTimeout(() => {
      Promise.resolve(fetchRecs(term))
        .then((list) => alive && setRecs({ query: term, src: fetchRecs, items: list || [], error: false }))
        .catch(() => alive && setRecs({ query: term, src: fetchRecs, items: [], error: true }))
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [term, enough, fetchRecs])

  // Kunci gulir latar + kembalikan fokus saat ditutup.
  useEffect(() => {
    const prev = document.activeElement
    const root = document.documentElement
    root.classList.add('search-open')
    inputRef.current?.focus()
    const len = inputRef.current?.value.length || 0
    inputRef.current?.setSelectionRange(len, len)
    return () => {
      root.classList.remove('search-open')
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [])

  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const choose = (row) => {
    if (!row || row.disabled) return
    if (row.submit) {
      onSubmit(term)
      onClose()
      return
    }
    onSelect(row, term)
    if (keepOpenOnSelect) inputRef.current?.focus()
    else onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (rows.length) setActive((activeIndex + 1) % rows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length) setActive((activeIndex - 1 + rows.length) % rows.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows.length) choose(rows[activeIndex])
      else if (onSubmit && !term) {
        onSubmit('')
        onClose()
      }
    } else if (e.key === 'Tab') {
      // Fokus tetap di kolom cari (pilihan lewat panah).
      e.preventDefault()
    }
  }

  let body
  if (riwayat.length) {
    body = onClearRecent ? (
      <p className="px-5 pb-3 text-right">
        <button type="button" onClick={onClearRecent} className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-navy-800 hover:underline">
          Hapus riwayat
        </button>
      </p>
    ) : null
  } else if (!enough) {
    body = (
      <p className="px-5 py-8 text-center text-sm text-slate-500">
        {term ? `Ketik minimal ${minChars} karakter untuk melihat rekomendasi.` : hint || 'Mulai mengetik untuk melihat rekomendasi.'}
      </p>
    )
  } else if (loading) {
    body = (
      <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-slate-500">
        <span className="spinner" aria-hidden="true" />
        Mencari…
      </p>
    )
  } else if (recs.error) {
    body = <p className="px-5 py-8 text-center text-sm text-red-700">Rekomendasi gagal dimuat. Coba lagi.</p>
  } else if (items.length === 0) {
    body = <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyText}</p>
  }

  return (
    <div className="search-popup fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
      <div className="absolute inset-0 bg-navy-950/40 backdrop-blur-md" aria-hidden="true" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }
        }}
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search className="size-5 shrink-0 text-navy-600" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows.length ? `${listId}-${activeIndex}` : undefined}
            aria-label={title}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-base text-slate-900 outline-none placeholder:text-slate-400"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ('')
                inputRef.current?.focus()
              }}
              className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <span className="sr-only">Bersihkan</span>
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">
            Esc
          </button>
        </div>

        {children ? <div className="border-b border-slate-100 px-4 py-2.5">{children}</div> : null}

        <div ref={listRef} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Rekomendasi" className="py-1.5">
              {rows.map((row, i) => [
                row.group && row.group !== rows[i - 1]?.group ? (
                  <li key={`g-${row.group}`} role="presentation" className="px-4.5 pb-1 pt-3 text-xs font-semibold text-slate-500 first:pt-1.5">
                    {row.group}
                  </li>
                ) : null,
                <li
                  key={row.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  aria-disabled={row.disabled || undefined}
                  data-index={i}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(row)
                  }}
                  className={`mx-1.5 flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                    row.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  } ${i === activeIndex && !row.disabled ? 'bg-navy-50' : ''}`}
                >
                  {row.submit ? (
                    <>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-navy-800 text-white">
                        <Search className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        Tampilkan semua hasil untuk <span className="font-semibold text-navy-900">“{term}”</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900">{row.title}</span>
                        {row.subtitle ? <span className="mt-0.5 block truncate text-sm text-slate-500">{row.subtitle}</span> : null}
                      </span>
                      {row.note || row.badge ? (
                        <span className={`badge shrink-0 ${row.badgeClass || 'badge-tag'}`}>{row.note || row.badge}</span>
                      ) : null}
                    </>
                  )}
                  {i === activeIndex && !row.disabled ? <CornerDownLeft className="size-4 shrink-0 text-slate-400" aria-hidden="true" /> : null}
                </li>,
              ])}
            </ul>
          ) : null}
          {body}
        </div>

        <p className="hidden items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:flex">
          <span>
            <kbd className="font-sans font-semibold">↑</kbd> <kbd className="font-sans font-semibold">↓</kbd> pilih
          </span>
          <span>
            <kbd className="font-sans font-semibold">Enter</kbd> buka
          </span>
          <span>
            <kbd className="font-sans font-semibold">Esc</kbd> tutup
          </span>
        </p>
      </div>
    </div>
  )
}

export default function SearchPopup({ open, ...props }) {
  if (!open) return null
  return createPortal(<PopupPanel {...props} />, document.body)
}
