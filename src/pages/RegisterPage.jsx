import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (username.trim().length < 2) { setError('Username must be at least 2 characters'); return }
    setLoading(true)
    try {
      await signUp(email, password, username.trim())
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
          <p style={{ fontSize: 14, color: 'rgba(13,27,42,0.55)', marginTop: 6 }}>Create your account and join the fun</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input type="text" required autoFocus className="input"
                value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Your display name" maxLength={30} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" required className="input"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" required className="input"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
            </div>
            {error && <p style={{ fontSize: 13, color: '#C0392B' }}>{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="text-center mt-4" style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#1A6B3A', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
