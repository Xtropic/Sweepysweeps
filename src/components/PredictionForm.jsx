import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Flag from './Flag'

export default function PredictionForm({ match, existing, isKnockout, onSaved, onCancel }) {
  const { user } = useAuth()
  const [homeScore, setHomeScore] = useState(existing?.predicted_home_score ?? '')
  const [awayScore, setAwayScore] = useState(existing?.predicted_away_score ?? '')
  const [penWinner, setPenWinner] = useState(existing?.predicted_penalty_winner_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const showPenPicker = isKnockout && homeScore !== '' && awayScore !== ''
    && parseInt(homeScore) === parseInt(awayScore)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (homeScore === '' || awayScore === '') { setError('Please enter both scores'); return }
    const hs = parseInt(homeScore)
    const as_ = parseInt(awayScore)
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) { setError('Scores must be 0 or above'); return }
    if (isKnockout && hs === as_ && !penWinner) { setError('Please pick a penalty winner'); return }

    setSaving(true)
    const payload = {
      user_id: user.id,
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
            ⚡ Draw after 90 mins — who wins on penalties?
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
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
