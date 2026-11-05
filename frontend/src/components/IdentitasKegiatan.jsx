// ---------------------------------------------------------------------------
// "Identitas kegiatan" = kolom kanan halaman detail dua sisi (tim, dokumen utama, reviewer, riwayat waktu, ringkasan…).
// Di layar lebar kolom ini **bertahan di atas** (sticky) selama kolom utama digulir, seperti kartu ringkasan di
// Pengaturan. Bila isinya lebih tinggi dari layar, kolom ini bergulir sendiri (Lenis: allowNestedScroll).
// `dari` = breakpoint dua kolom halaman ('lg' | 'xl'); grid induk wajib `items-start` agar sticky berlaku.
// Dipakai: Detail Kegiatan, Detail Undangan, Detail Proposal (Ketua/Admin), Review Proposal, index Laporan pengusul.
// ---------------------------------------------------------------------------

const KELAS = {
  lg: 'lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:-m-1 lg:p-1',
  xl: 'xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:overscroll-contain xl:-m-1 xl:p-1',
}

export default function IdentitasKegiatan({ dari = 'xl', className = 'space-y-6', children }) {
  return (
    <aside aria-label="Identitas kegiatan" className={`identitas-kegiatan min-w-0 ${KELAS[dari]} ${className}`}>
      {children}
    </aside>
  )
}
