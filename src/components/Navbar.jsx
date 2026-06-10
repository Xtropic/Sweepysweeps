import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Swords, Trophy, BarChart2, Settings, Globe2, LogOut, Bell } from 'lucide-react'

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const location  = useLocation()
  const navigate  = useNavigate()
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  // Notifications state
  const [notifications, setNotifications]   = useState([])
  const [notifOpen, setNotifOpen]           = useState(false)
  const notifRef                            = useRef(null)

  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    if (!user) return
    loadNotifications()

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 30))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }

  async function openNotifications() {
    setNotifOpen(v => !v)
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }

  async function clearNotifications() {
    await supabase.from('notifications').delete().eq('user_id', user.id)
    setNotifications([])
  }

  const links = [
    { to: '/bracket',     label: 'WC 2026',     icon: <Globe2    size={16} /> },
    { to: '/matches',     label: 'Matches',     icon: <Swords    size={16} /> },
    { to: '/leagues',     label: 'Leagues',     icon: <Trophy    size={16} /> },
    { to: '/leaderboard', label: 'Leaderboard', icon: <BarChart2 size={16} /> },
    { to: '/admin',       label: 'Manage',      icon: <Settings  size={16} /> },
  ]

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function timeAgo(ts) {
    const secs = Math.floor((Date.now() - new Date(ts)) / 1000)
    if (secs < 60)   return 'just now'
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`
    return `${Math.floor(secs / 86400)}d ago`
  }

  return (
    <nav className="bg-white sticky top-0 z-50" style={{ borderBottom: '0.5px solid rgba(13,27,42,0.12)' }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/matches" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
          <img
            src="/logo.png?v=2"
            alt="Sweepy Sweep Sweep Stakes"
            style={{ height: 40, width: 40, display: 'block', flexShrink: 0, borderRadius: 10, objectFit: 'cover' }}
          />
        </Link>

        {/* Nav links + user area */}
        <div className="flex items-center gap-1 sm:gap-3" style={{ marginLeft: 12 }}>
          {links.map(link => {
            const active = location.pathname.startsWith(link.to)
            return (
              <Link
                key={link.to}
                to={link.to}
                className="transition-colors rounded-badge flex items-center gap-1.5"
                style={{
                  padding: '5px 12px', fontSize: 13, fontWeight: 500,
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

          {/* Notification bell */}
          {user && (
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={openNotifications}
                style={{
                  position: 'relative', padding: '6px', borderRadius: 8,
                  border: 'none', background: notifOpen ? '#F5F3EE' : 'transparent',
                  color: 'rgba(13,27,42,0.55)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#E63946', color: 'white',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications dropdown */}
              {notifOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: 320, maxWidth: 'calc(100vw - 24px)',
                  background: 'white', borderRadius: 12,
                  border: '1px solid rgba(13,27,42,0.1)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                  zIndex: 200, overflow: 'hidden',
                }}>
                  {/* Header */}
                  <div style={{
                    padding: '12px 14px', borderBottom: '0.5px solid rgba(13,27,42,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>Notifications</span>
                    {notifications.length > 0 && (
                      <button
                        onClick={clearNotifications}
                        style={{ fontSize: 11, color: 'rgba(13,27,42,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'rgba(13,27,42,0.4)' }}>
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '0.5px solid rgba(13,27,42,0.06)',
                            background: n.read ? 'white' : '#F0F8F4',
                            cursor: n.league_id ? 'pointer' : 'default',
                          }}
                          onClick={() => {
                            if (n.league_id) { navigate(`/leagues/${n.league_id}`); setNotifOpen(false) }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {!n.read && (
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1A6B3A', flexShrink: 0, marginTop: 5 }} />
                            )}
                            {n.read && <div style={{ width: 6, flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: '#0D1B2A', lineHeight: 1.5, wordBreak: 'break-word' }}>
                                {n.message}
                              </div>
                              <div style={{ fontSize: 10, color: 'rgba(13,27,42,0.35)', marginTop: 3 }}>
                                {timeAgo(n.created_at)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sign out */}
          {user && (
            <div className="flex items-center gap-1 ml-1 pl-2" style={{ borderLeft: '0.5px solid rgba(13,27,42,0.15)' }}>
              <span className="hidden sm:block" style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)', marginRight: 4 }}>
                {profile?.username || user.email}
              </span>
              {confirmingSignOut ? (
                <div className="flex items-center gap-1">
                  <span className="hidden sm:block" style={{ fontSize: 12, color: 'rgba(13,27,42,0.5)' }}>Sure?</span>
                  <button onClick={handleSignOut} className="btn-danger" style={{ padding: '4px 8px', fontSize: 12 }}>Yes</button>
                  <button onClick={() => setConfirmingSignOut(false)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }}>No</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setConfirmingSignOut(true)} className="btn-secondary hidden sm:inline-flex" style={{ padding: '5px 12px', fontSize: 13 }}>
                    Sign out
                  </button>
                  <button
                    onClick={() => setConfirmingSignOut(true)}
                    className="sm:hidden"
                    style={{ padding: '6px', borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(13,27,42,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
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
