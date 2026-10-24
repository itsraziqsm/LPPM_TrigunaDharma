import { useEffect, useRef } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../store/authStore'

export function PrivateRoute() {
    const accessToken = useAuthStore((s) => s.accessToken)
    const user = useAuthStore((s) => s.user)
    const loading = useAuthStore((s) => s.loading)
    const lastTokenRef = useRef(null)

    useEffect(() => {
        // Fetch hanya jika token berubah (login baru) dan belum ada user
        if (accessToken && !user && !loading && lastTokenRef.current !== accessToken) {
            lastTokenRef.current = accessToken
            useAuthStore.getState().fetchMe()
        }
        // Reset ref saat logout
        if (!accessToken) {
            lastTokenRef.current = null
        }
    }, [accessToken, user, loading])

    if (!accessToken) return <Navigate to="/login" replace />

    return <Outlet />
}

export function GuestRoute() {
    const accessToken = useAuthStore((s) => s.accessToken)
    return !accessToken ? <Outlet /> : <Navigate to="/dashboard" replace />
}
