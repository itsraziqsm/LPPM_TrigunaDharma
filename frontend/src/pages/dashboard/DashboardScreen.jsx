import { useState } from 'react'
import { ADAPTERS } from './adapters'
import { DashboardBody, DashboardSkeleton, LoadError, Notice } from './components'
import { HaloHeader, KpiToneCards, PintasanSection } from './HaloLayout'
import { ROLE_LABEL } from './format'

// Dashboard Admin, Ketua LPPM, Mahasiswa, dan Reviewer memakai layout yang sama
// dengan dashboard dosen (HaloLayout: kepala "Halo …!" + pintasan, kartu angka
// berwarna), tetapi ISI tetap milik peran masing-masing dari adapter-nya:
// Pintasan + model.kpis → kartu angka, lalu bagian Informasi (DashboardBody: perlu
// perhatian, daftar, aktivitas, status, periode diminimalkan). Murni presentasi — data dari
// useDashboardData lewat DashboardHome.
export default function DashboardScreen({
  role,
  adapterKey,
  user,
  loading,
  refreshing,
  model,
  failed,
  updatedAt,
  onReload,
}) {
  const [openedAt] = useState(() => new Date())
  const now = updatedAt || openedAt

  const name = user?.name || user?.fullName || ROLE_LABEL[role] || ''
  const actions = ADAPTERS[adapterKey]?.actions ?? []

  // Urutan bagian: Halo → Pintasan (pintasan + kartu angka) → Informasi.
  let body
  if (loading) body = <DashboardSkeleton />
  else if (!model) body = <LoadError busy={refreshing} onRetry={onReload} />
  else
    body = (
      <>
        <PintasanSection shortcuts={model.shortcuts}>
          <KpiToneCards items={model.kpis} />
        </PintasanSection>
        <DashboardBody model={model} />
      </>
    )

  return (
    <div className="page rise space-y-8">
      <HaloHeader
        now={now}
        name={name}
        roleLabel={ROLE_LABEL[role]}
        summary={model?.summary}
        actions={actions}
        loading={loading}
        refreshing={refreshing}
        updatedAt={updatedAt}
        onReload={onReload}
      />

      {model && failed.length > 0 ? <Notice failed={failed} busy={refreshing} onRetry={onReload} /> : null}

      {body}
    </div>
  )
}
