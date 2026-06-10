import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Flag from './Flag'

// Derive 'home'|'draw'|'away' from stored scores
function scoresToPick(h, a) {
  if (h == null || a == null) return null
  if (h > a) return 'home'
  if (h < a) return 'away'
  return 'draw'
}

export default function PredictionForm({ match, existing, isKnockout, onSaved, onCancel, resultOnly = false }) {
  const { user } = useAuth()

  // Exact score state
  const [homeScore, setHomeScore] = useState(existing?.predicted_home_score ?? '')
  const [awayScore, setAwayScore] = useState(existing?.predicted_away_score ?? '')
  const [penWinner, setPenWinner] = useState(existing?.predicted_penalty_winner_id ?? '')

  // Result-only state
  const [resultPick, setResultPick] = useState(() =>
    scoresToPick(existing?.predicted_home_score, existing?.predicted_away_score)
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const showPenPicker = !resultOnly && isKnockout
    && homeScore !== '' && awayScore !== ''
    && parseInt(homeScore) === parseInt(awayScore)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    let hs, as_
    if (resultOnly) {
      if (!resultPick) { setError('Please pick a result'); return }
      hs  = resultPick === 'home' ? 1 : 0
      as_ = resultPick === 'away' ? 1 : 0
    } else {
      if (homeScore === '' || awayScore === '') { setError('Please enter both scores'); return }
      hs  = parseInt(homeScore)
      as_ = parseInt(awayScore)
      if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) { setError('Scores must be 0 or above'); return }
      if (isKnockout && hs === as_ && !penWinner) { setError('Please pick a penalty winner'); return }
    }

    setSaving(true)
    const payload = {
      user_id:  user.id,
      match_id: match.id,
      predicted_home_score: hs,
      predicted_away_score: as_,
      predicted_penalty_winner_id: showPenPicker ? penWinner || null : null,
    }

    let err
    if (existing) {
      ;({ error: err } = await supabase
        .from('predictions')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existing.id))
    } else {
      ;({ error: err } = await supabase.from('predictions').insert(payload))
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  // ── Result-only mode ──────────────────────────────────────────────────────
  if (resultOnly) {
    const options = [
      { key: 'home', label: match.home_team?.name || 'Home', short: 'Home win' },
      { key: 'draw', label: 'Draw',                          short: 'Draw'     },
      { key: 'away', label: match.away_team?.name || 'Away', short: 'Away win' },
    ]
    return (
      <form onSubmit={handleSubmit} className="space-y-3">
        <div style={{ display: 'flex', gap: 8 }}>
          {options.map(opt => {
            const sel = resultPick === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setResultPick(opt.key)}
                style={{
                  flex: 1, padding: '10px 4px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${sel ? '#1A6B3A' : 'rgba(13,27,42,0.15)'}`,
                  background: sel ? '#D6EFE0' : 'white',
                  color: sel ? '#0D3D20' : 'rgba(13,27,42,0.6)',
                  fontSize: 12, fontWeight: sel ? 600 : 400,
                  transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}
              >
                {opt.key !== 'draw' && (
                  <Flag teamName={opt.key === 'home' ? match.home_team?.name : match.away_team?.name} size="sm" />
                )}
                <span style={{ textAlign: 'center', lineHeight: 1.3 }}>{opt.short}</span>
              </button>
            )
          })}
        </div>
        {error && <p style={{ fontSize: 13, color: '#C0392B' }}>{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving || !resultPick} className="btn-primary flex-1">
            {saving ? 'Saving…' : (existing ? 'Update pick' : 'Save pick')}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </form>
    )
  }

  // ── Exact score mode ──────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-4">
        {/* Home */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Flag teamName={match.home_team?.name} size="sm" />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(13,27,42,0.65)' }}>
              {match.home_team?.name}
            </span>
          </div>
          <input
            type="number" min="0" max="99"
            className="input text-center mx-auto"
            style={{ width: 80, fontSize: 24, fontWeight: 500 }}
            value={homeScore}
            onChange={e => setHomeScore(e.target.value)}
            placeholder="0"
          />
        </div>

        <span style={{ fontSize: 18, fontWeight: 500, color: 'rgba(13,27,42,0.3)', paddingTop: 28 }}>–</span>

        {/* Away */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Flag teamName={match.away_team?.name} size="sm" />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(13,27,42,0.65)' }}>
              {match.away_team?.name}
            </span>
          </div>
          <input
            type="number" min="0" max="99"
            className="input text-center mx-auto"
            style={{ width: 80, fontSize: 24, fontWeight: 500 }}
            value={awayScore}
            onChange={e => setAwayScore(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Penalty winner picker */}
      {showPenPicker && (
        <div className="rounded-card p-3" style={{ background: '#F5E6B0' }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#8B6A0A', marginBottom: 8 }}>
            Draw after 90 mins — who wins on penalties?
          </p>
          <div className="flex gap-3">
            {[match.home_team, match.away_team].map(team => (
              <button
                key={team.id}
                type="button"
                onClick={() => setPenWinner(team.id)}
                className="flex-1 py-2 rounded-badge flex items-center justify-center gap-2 transition-all"
                style={{
                  fontSize: 13, fontWeight: 500,
                  border: penWinner === team.id ? '2px solid #D4A017' : '1.5px solid rgba(139,106,10,0.3)',
                  background: penWinner === team.id ? 'white' : 'transparent',
                  color: '#8B6A0A',
                }}
              >
                <Flag teamName={team.name} size="sm" />
                {team.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 13, color: '#C0392B' }}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? 'Saving…' : (existing ? 'Update prediction' : 'Save prediction')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </form>
  )
}
