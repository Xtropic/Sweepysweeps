import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AdBanner from '../components/AdBanner'

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
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 48, width: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
        <div className="flex-1">
          <h1 style={{ fontSize: 18, color: '#0D1B2A', marginBottom: 2 }}>My Leagues</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>Compete with your friends</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('join')} className="btn-secondary">Join</button>
          <button onClick={() => setView('create')} className="btn-primary">+ Create</button>
        </div>
      </div>

      <AdBanner slot="3344556677" size="responsive" style={{ marginBottom: 20 }} />

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

function toPrizeType(tournament, perRound) {
  if (tournament && perRound) return 'both'
  if (tournament) return 'tournament'
  if (perRound)   return 'per_round'
  return 'none'
}

const PRIZE_CHECKBOXES = [
  {
    key: 'tournament',
    title: 'Prize money — whole tournament',
    desc: 'One-off entry fee per member. Paid/Unpaid status shown on the Standings tab.',
  },
  {
    key: 'per_round',
    title: 'Prize money — per round',
    desc: 'Separate entry fee for each round. Tracked individually in the Round winners tab.',
  },
]

function CreateLeagueForm({ userId, onCreated, onCancel }) {
  const [name, setName]                       = useState('')
  const [prizeTournament, setPrizeTournament] = useState(false)
  const [prizePerRound, setPrizePerRound]     = useState(false)
  const [predStyle, setPredStyle]             = useState('exact_score')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (name.trim().length < 2) { setError('Name must be at least 2 characters'); return }
    setSaving(true); setError('')
    const prizeType = toPrizeType(prizeTournament, prizePerRound)
    const { data: league, error: err } = await supabase
      .from('leagues').insert({ name: name.trim(), admin_user_id: userId, prize_type: prizeType, prediction_style: predStyle }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    await supabase.from('league_members').insert({ league_id: league.id, user_id: userId })
    setSaving(false); onCreated()
  }

  const anyPrize = prizeTournament || prizePerRound

  return (
    <div className="card mb-6">
      <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Create a new league</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">League name</label>
          <input type="text" required autoFocus className="input"
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Office sweepstake, Sunday league lads…" maxLength={60} />
        </div>

        {/* Prize type — independent checkboxes */}
        <div>
          <label className="label" style={{ marginBottom: 4 }}>Prize money</label>
          <p style={{ fontSize: 12, color: 'rgba(13,27,42,0.45)', marginBottom: 10 }}>
            Select any that apply — both can be enabled at once.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRIZE_CHECKBOXES.map(({ key, title, desc }) => {
              const checked = key === 'tournament' ? prizeTournament : prizePerRound
              const toggle  = key === 'tournament' ? setPrizeTournament : setPrizePerRound
              return (
                <div key={key} onClick={() => toggle(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                    padding: '12px 14px', borderRadius: 10,
                    border: `1.5px solid ${checked ? 'rgba(212,160,23,0.6)' : 'rgba(13,27,42,0.12)'}`,
                    background: checked ? '#FFFDF4' : 'white', transition: 'all 0.15s',
                  }}>
                  <div style={{
                    flexShrink: 0, marginTop: 2,
                    width: 18, height: 18, borderRadius: 4,
                    border: `2px solid ${checked ? '#D4A017' : 'rgba(13,27,42,0.25)'}`,
                    background: checked ? '#D4A017' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {checked && <span style={{ color: 'white', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A', marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)', lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
          {anyPrize && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8B6A0A', background: '#F5E6B0', borderRadius: 6, padding: '6px 12px' }}>
              This app does not handle or hold any money — entry fees are managed between members directly.
            </div>
          )}
        </div>

        {/* Prediction style */}
        <div>
          <label className="label" style={{ marginBottom: 4 }}>Prediction style</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { value: 'exact_score',        title: 'Exact score',           desc: 'Predict the final score (e.g. 2–1). 5 pts exact, 3 pts correct result within 1 goal, 1 pt correct result.' },
              { value: 'result_only',        title: 'Result only (Win / Draw / Lose)', desc: 'Just pick the outcome. 1 pt for the correct result.' },
              { value: 'tournament_bracket', title: 'Tournament bracket',    desc: 'Pick group finishing order + knockout winners for the whole tournament. 2 pts per correct group position, 5 pts per correct knockout winner.' },
            ].map(opt => {
              const sel = predStyle === opt.value
              return (
                <div key={opt.value} onClick={() => setPredStyle(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                    padding: '12px 14px', borderRadius: 10,
                    border: `1.5px solid ${sel ? 'rgba(26,107,58,0.5)' : 'rgba(13,27,42,0.12)'}`,
                    background: sel ? 'rgba(26,107,58,0.05)' : 'white', transition: 'all 0.15s',
                  }}>
                  <div style={{
                    flexShrink: 0, marginTop: 2, width: 18, height: 18, borderRadius: '50%',
                    border: `2px solid ${sel ? '#1A6B3A' : 'rgba(13,27,42,0.25)'}`,
                    background: sel ? '#1A6B3A' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                  }}>
                    {sel && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A', marginBottom: 3 }}>{opt.title}</div>
                    <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)', lineHeight: 1.5 }}>{opt.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
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
