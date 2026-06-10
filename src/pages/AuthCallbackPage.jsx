import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Exchange the OAuth code for a session, then redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/matches', { replace: true })
      }
    })

    // Also listen in case getSession hasn't resolved yet
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/matches', { replace: true })
      } else if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true })
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 64, width: 64, borderRadius: 14, objectFit: 'cover', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 15, color: 'rgba(13,27,42,0.55)' }}>Signing you in…</p>
      </div>
    </div>
  )
}
