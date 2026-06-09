import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/matches')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Redirect is handled by Supabase OAuth flow
    } catch (err) {
      setError(err.message)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png?v=2" alt="Sweepy Sweep Sweep Stakes"
            style={{ height: 72, width: 72, borderRadius: 16, objectFit: 'cover', margin: '0 auto 12px' }} />
          <h1 style={{ fontSize: 28, color: '#0D1B2A' }}>Sweepy Sweep Sweep Stakes</h1>
          <p style={{ fontSize: 14, color: 'rgba(13,27,42,0.55)', marginTop: 6 }}>Sign in to make your predictions</p>
        </div>

        <div className="card">
          {/* Google sign-in */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(13,27,42,0.15)',
              background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              color: '#0D1B2A', marginBottom: 16,
              opacity: googleLoading ? 0.6 : 1,
            }}
          >
            <GoogleIcon />
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(13,27,42,0.1)' }} />
            <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.4)' }}>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(13,27,42,0.1)' }} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" required autoFocus className="input"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" required className="input"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <p style={{ fontSize: 13, color: '#C0392B' }}>{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center mt-4" style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#1A6B3A', fontWeight: 500 }}>Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
