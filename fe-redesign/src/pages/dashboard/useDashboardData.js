import { useCallback, useEffect, useState } from 'react'
import { ADAPTERS } from './adapters'

// Memuat data dashboard lewat adapter peran. Pemuatan awal menampilkan kerangka;
// "Muat ulang" mempertahankan isi lama dan hanya menandai `refreshing`.
export default function useDashboardData({ adapterKey, withReviewerDigest }) {
  const [state, setState] = useState({
    loading: true,
    refreshing: false,
    model: null,
    failed: [],
    updatedAt: null,
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const adapter = ADAPTERS[adapterKey]
    if (!adapter) return undefined

    let alive = true
    ;(async () => {
      try {
        const { model, failed, ok } = await adapter.load({ withReviewerDigest })
        if (!alive) return
        setState({
          loading: false,
          refreshing: false,
          model: ok ? model : null,
          failed,
          updatedAt: new Date(),
        })
      } catch (error) {
        console.error('[dashboard] gagal menyusun dashboard', error)
        if (!alive) return
        setState({ loading: false, refreshing: false, model: null, failed: [], updatedAt: new Date() })
      }
    })()

    return () => {
      alive = false
    }
  }, [adapterKey, withReviewerDigest, tick])

  const reload = useCallback(() => {
    setState((current) => ({ ...current, refreshing: true }))
    setTick((value) => value + 1)
  }, [])

  return { ...state, reload }
}
