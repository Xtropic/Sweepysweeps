import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Swords, Trophy, BarChart2, Settings, Globe2, LogOut } from 'lucide-react'

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  const links = [
    { to: '/bracket',     label: 'WC 2026',     icon: <Globe2 size={16} /> },
    { to: '/matches',     label: 'Matches',     icon: <Swords   size={16} /> },
    { to: '/leagues',     label: 'Leagues',     icon: <Trophy   size={16} /> },
    { to: '/leaderboard', label: 'Leaderboard', icon: <BarChart2 size={16} /> },
    { to: '/admin', label: 'Manage', icon: <Settings size={16} /> },
  ]

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="bg-white sticky top-0 z-50" style={{ borderBottom: '0.5px solid rgba(13,27,42,0.12)' }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo + brand */}
        <Link to="/matches" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
          <img
            src="/logo.png?v=2"
            alt="Sweepy Sweep Sweep Stakes"
            style={{ height: 40, width: 40, display: 'block', flexShrink: 0, borderRadius: 10, objectFit: 'cover' }}
          />
        </Link>

        {/* Nav links + user */}
        <div className="flex items-center gap-1 sm:gap-3" style={{ marginLeft: 12 }}>
          {links.map(link => {
            const active = location.pathname.startsWith(link.to)
            return (
              <Link
                key={link.to}
                to={link.to}
                className="transition-colors rounded-badge flex items-center gap-1.5"
                style={{
                  padding: '5px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  color:      active ? '#1A6B3A' : 'rgba(13,27,42,0.55)',
                  background: active ? '#D6EFE0' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {link.icon}
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            )
          })}

          {user && (
            <div className="flex items-center gap-1 ml-1 pl-2" style={{ borderLeft: '0.5px solid rgba(13,27,42,0.15)' }}>
              <span className="hidden sm:block" style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)', marginRight: 4 }}>
                {profile?.username || user.email}
              </span>
              {confirmingSignOut ? (
                <div className="flex items-center gap-1">
                  <span className="hidden sm:block" style={{ fontSize: 12, color: 'rgba(13,27,42,0.5)' }}>Sure?</span>
                  <button onClick={handleSignOut} className="btn-danger" style={{ padding: '4px 8px', fontSize: 12 }}>
                    Yes
                  </button>
                  <button onClick={() => setConfirmingSignOut(false)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }}>
                    No
                  </button>
                </div>
              ) : (
                <>
                  {/* Desktop: text button */}
                  <button onClick={() => setConfirmingSignOut(true)} className="btn-secondary hidden sm:inline-flex" style={{ padding: '5px 12px', fontSize: 13 }}>
                    Sign out
                  </button>
                  {/* Mobile: icon only */}
                  <button
                    onClick={() => setConfirmingSignOut(true)}
                    className="sm:hidden"
                    style={{
                      padding: '6px', borderRadius: 8, border: 'none',
                      background: 'transparent', color: 'rgba(13,27,42,0.5)',
                      cursor: 'pointer', alignItems: 'center',
                    }}
                    aria-label="Sign out"
                  >
                    <LogOut size={18} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
