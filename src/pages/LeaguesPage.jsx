import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function LeaguesPage() {
  const { user } = useAuth()
  const [myLeagues, setMyLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')

  useEffect(() => { loadMyLeagues() }, [])

  async function loadMyLeagues() {
    setLoading(true)
    const { data } = await supabase
      .from('league_members')
      .select('league_id, leagues(id, name, invite_code, admin_user_id, created_at)')
      .eq('user_id', user.id)

    const leagueIds = (data || []).map(r => r.leagues?.id).filter(Boolean)
    let enriched = []
    if (leagueIds.length > 0) {
      const { data: members } = await supabase
        .from('league_members').select('league_id, profiles(total_points)').in('league_id', leagueIds)
      enriched = (data || []).map(row => {
        const lg = row.leagues
        const lgMembers = (members || []).filter(m => m.league_id === lg.id)
        return {
          ...lg,
          totalPoints: lgMembers.reduce((s, m) => s + (m.profiles?.total_points || 0), 0),
          memberCount: lgMembers.length,
        }
      })
    }
    setMyLeagues(enriched)
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 64, width: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
        <div className="flex-1">
          <h1 style={{ fontSize: 22, color: '#0D1B2A', marginBottom: 2 }}>My Leagues</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>Compete with your friends</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('join')} className="btn-secondary">Join</button>
          <button onClick={() => setView('create')} className="btn-primary">+ Create</button>
        </div>
      </div>

      {view === 'create' && (
        <CreateLeagueForm userId={user.id} onCreated={() => { setView('list'); loadMyLeagues() }} onCancel={() => setView('list')} />
      )}
      {view === 'join' && (
        <JoinLeagueForm userId={user.id} onJoined={() => { setView('list'); loadMyLeagues() }} onCancel={() => setView('list')} />
      )}

      {loading ? (
        <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading…</div>
      ) : myLeagues.length === 0 ? (
        <div className="card text-center py-12" style={{ color: 'rgba(13,27,42,0.45)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
          <p style={{ fontSize: 16, fontWeight: 500 }}>You haven't joined any leagues yet.</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Create one or ask a friend for their invite code.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {myLeagues.map(league => (
            <Link key={league.id} to={`/leagues/${league.id}`}
              className="card flex items-center justify-between hover:opacity-80 transition-opacity">
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#0D1B2A' }} className="flex items-center gap-2">
                  {league.name}
                  {league.admin_user_id === user.id && (
                    <span className="badge badge-qualified">Admin</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)', marginTop: 2 }}>
                  {league.memberCount} member{league.memberCount !== 1 ? 's' : ''}
                  {league.admin_user_id === user.id && (
                    <span style={{ marginLeft: 12 }}>
                      Code: <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#0D1B2A' }}>{league.invite_code}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div style={{ fontSize: 22, fontWeight: 500, color: '#D4A017' }}>{league.totalPoints}</div>
                <div style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 500 }}>league pts</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateLeagueForm({ userId, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (name.trim().length < 2) { setError('Name must be at least 2 characters'); return }
    setSaving(true); setError('')
    const { data: league, error: err } = await supabase
      .from('leagues').insert({ name: name.trim(), admin_user_id: userId }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    await supabase.from('league_members').insert({ league_id: league.id, user_id: userId })
    setSaving(false); onCreated()
  }

  return (
    <div className="card mb-6">
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Create a new league</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">League name</label>
          <input type="text" required autoFocus className="input"
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Office sweepstake, Sunday league lads…" maxLength={60} />
        </div>
        {error && <p style={{ fontSize: 13, color: '#C0392B' }}>{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create league'}</button>
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}

function JoinLeagueForm({ userId, onJoined, onCancel }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const { data: league, error: lookupErr } = await supabase
      .from('leagues').select('id, name').eq('invite_code', code.trim().toUpperCase()).single()
    if (lookupErr || !league) { setError('Invalid invite code. Check and try again.'); setSaving(false); return }
    const { data: existing } = await supabase
      .from('league_members').select('id').eq('league_id', league.id).eq('user_id', userId).single()
    if (existing) { setError(`You're already in "${league.name}".`); setSaving(false); return }
    const { error: joinErr } = await supabase.from('league_members').insert({ league_id: league.id, user_id: userId })
    if (joinErr) { setError(joinErr.message); setSaving(false); return }
    setSaving(false); onJoined()
  }

  return (
    <div className="card mb-6">
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Join a league</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Invite code</label>
          <input type="text" required autoFocus className="input uppercase tracking-widest font-mono"
            value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. A1B2C3D4" maxLength={8} />
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.45)', marginTop: 4 }}>Ask your league admin for the 8-character code.</p>
        </div>
        {error && <p style={{ fontSize: 13, color: '#C0392B' }}>{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Joining…' : 'Join league'}</button>
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}
