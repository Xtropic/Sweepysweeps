import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
