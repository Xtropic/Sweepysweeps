import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_LABELS, KNOCKOUT_STAGES } from '../lib/teams'
import { calculatePoints } from '../lib/scoring'
import Flag from '../components/Flag'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']

export default function AdminPage() {
  const { profile } = useAuth()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState('group')
  const [saving, setSaving] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadMatches() }, [])

  async function loadMatches() {
    const { data } = await supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
      .order('match_number', { ascending: true })
    setMatches(data || [])
    setLoading(false)
  }

  if (!profile?.is_admin) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center" style={{ color: 'rgba(13,27,42,0.45)' }}>Access denied. Admin only.</div>
  }

  const stages = [...new Set((matches || []).map(m => m.stage))]
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
  const stageMatches = matches.filter(m => m.stage === activeStage)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 64, width: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 22, color: '#0D1B2A', marginBottom: 2 }}>Admin Panel</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>Enter match results to calculate player points.</p>
        </div>
      </div>

      {msg && (
        <div className="rounded-card mb-4 px-4 py-3" style={{ background: '#D6EFE0', color: '#0D3D20', fontSize: 13 }}>{msg}</div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6">
        {stages.map(stage => (
          <button key={stage} onClick={() => setActiveStage(stage)}
            className="rounded-badge flex-shrink-0 whitespace-nowrap transition-colors"
            style={{
              padding: '5px 12px', fontSize: 13, fontWeight: 500,
              background: activeStage === stage ? '#0D1B2A' : '#E8E0CC',
              color: activeStage === stage ? 'white' : 'rgba(13,27,42,0.65)',
            }}>
            {STAGE_LABELS[stage] || stage}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stageMatches.map(match => (
            <ResultForm key={match.id} match={match} saving={saving === match.id}
              onSave={async (result) => {
                setSaving(match.id); setMsg('')
                await saveResult(match, result)
                setSaving(null)
                setMsg(`Result saved for ${match.home_team?.name} vs ${match.away_team?.name}`)
                loadMatches()
              }} />
          ))}
          {stageMatches.length === 0 && (
            <p className="text-center py-8" style={{ color: 'rgba(13,27,42,0.4)', fontSize: 16 }}>No matches for this stage yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

async function saveResult(match, { homeScore, awayScore, penWinnerId }) {
  const { error: matchErr } = await supabase
    .from('matches').update({ home_score: homeScore, away_score: awayScore, penalty_winner_id: penWinnerId || null, status: 'completed' })
    .eq('id', match.id)
  if (matchErr) { console.error(matchErr); return }

  const { data: preds } = await supabase.from('predictions').select('*').eq('match_id', match.id)
  if (!preds || preds.length === 0) return

  const updatedMatch = { ...match, home_score: homeScore, away_score: awayScore, penalty_winner_id: penWinnerId || null, status: 'completed' }
  await Promise.all(preds.map(p =>
    supabase.from('predictions').update({ points: calculatePoints(p, updatedMatch) }).eq('id', p.id)
  ))

  const userIds = [...new Set(preds.map(p => p.user_id))]
  await Promise.all(userIds.map(async (uid) => {
    const { data: allPreds } = await supabase.from('predictions').select('points').eq('user_id', uid).not('points', 'is', null)
    const total = (allPreds || []).reduce((sum, p) => sum + (p.points || 0), 0)
    await supabase.from('profiles').update({ total_points: total }).eq('id', uid)
  }))
}

function ResultForm({ match, saving, onSave }) {
  const isKnockout = KNOCKOUT_STAGES.includes(match.stage)
  const [homeScore, setHomeScore] = useState(match.home_score ?? '')
  const [awayScore, setAwayScore] = useState(match.away_score ?? '')
  const [penWinner, setPenWinner] = useState(match.penalty_winner_id ?? '')
  const [error, setError] = useState('')

  const showPenPicker = isKnockout && homeScore !== '' && awayScore !== '' && parseInt(homeScore) === parseInt(awayScore)

  function handleSubmit(e) {
    e.preventDefault(); setError('')
    const hs = parseInt(homeScore), as_ = parseInt(awayScore)
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) { setError('Invalid scores'); return }
    if (showPenPicker && !penWinner) { setError('Please select penalty winner'); return }
    onSave({ homeScore: hs, awayScore: as_, penWinnerId: showPenPicker ? penWinner : null })
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Flag teamName={match.home_team?.name} size="sm" />
        <span style={{ fontSize: 14, fontWeight: 500 }}>{match.home_team?.name || 'TBD'}</span>
        <span style={{ color: 'rgba(13,27,42,0.35)', fontSize: 13 }}>vs</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{match.away_team?.name || 'TBD'}</span>
        <Flag teamName={match.away_team?.name} size="sm" />
        {match.group_name && (
          <span className="badge badge-group ml-auto">Group {match.group_name}</span>
        )}
        {match.status === 'completed' && (
          <span className="badge badge-qualified" style={{ marginLeft: match.group_name ? 4 : 'auto' }}>Result saved</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">{match.home_team?.name || 'Home'} score</label>
          <input type="number" min="0" max="99" className="input text-center" style={{ width: 80 }}
            value={homeScore} onChange={e => setHomeScore(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="label">{match.away_team?.name || 'Away'} score</label>
          <input type="number" min="0" max="99" className="input text-center" style={{ width: 80 }}
            value={awayScore} onChange={e => setAwayScore(e.target.value)} placeholder="0" />
        </div>
        {showPenPicker && (
          <div>
            <label className="label">Penalty winner</label>
            <select className="input" value={penWinner} onChange={e => setPenWinner(e.target.value)}>
              <option value="">Select…</option>
              <option value={match.home_team_id}>{match.home_team?.name}</option>
              <option value={match.away_team_id}>{match.away_team?.name}</option>
            </select>
          </div>
        )}
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save result & calculate points'}
        </button>
      </form>
      {error && <p style={{ fontSize: 13, color: '#C0392B', marginTop: 8 }}>{error}</p>}
    </div>
  )
}
