import { useState } from 'react'
import { ADAPTERS } from './adapters'
import { DashboardBody, DashboardSkeleton, LoadError, Masthead, Notice } from './components'
import { ROLE_LABEL, formatClock, formatLongDate, greeting } from './format'

// Halaman dashboard yang sama untuk semua peran: kepala halaman, ledger angka,
// lalu dua kolom (kerja di kiri, konteks di kanan). Komponen ini murni
// presentasi — data datang dari useDashboardData lewat DashboardHome.
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

  const name = user?.fullName || user?.name || ROLE_LABEL[role] || ''
  const actions = ADAPTERS[adapterKey]?.actions ?? []

  let body
  if (loading) body = <DashboardSkeleton />
  else if (!model) body = <LoadError busy={refreshing} onRetry={onReload} />
  else body = <DashboardBody model={model} />

  return (
    <div className="page rise space-y-6">
      <Masthead
        dateLabel={formatLongDate(now)}
        roleLabel={ROLE_LABEL[role]}
        greeting={greeting(now)}
        name={name}
        summary={model?.summary}
        actions={actions}
        loading={loading}
        refreshing={refreshing}
        updatedLabel={updatedAt ? formatClock(updatedAt) : null}
        onReload={onReload}
      />

      {model && failed.length > 0 ? <Notice failed={failed} busy={refreshing} onRetry={onReload} /> : null}

      {body}
    </div>
  )
}
