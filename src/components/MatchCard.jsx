import { useState, useEffect } from 'react'
import { KNOCKOUT_STAGES } from '../lib/teams'
import Flag from './Flag'
import PredictionForm from './PredictionForm'

export default function MatchCard({ match, prediction, onPredictionSaved }) {
  const [expanded, setExpanded]         = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const isKnockout  = KNOCKOUT_STAGES.includes(match.stage)
  const isCompleted = match.status === 'completed'
  const isLive      = match.status === 'in_progress'
  const canPredict  = match.status === 'scheduled'
  const hasPrediction = !!prediction

  // Close edit form if match goes live while open
  useEffect(() => { if (!canPredict) setExpanded(false) }, [canPredict])

  const matchDate = match.match_date
    ? new Date(match.match_date).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Date TBC'

  return (
    <div className="card" style={{ marginBottom: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>

        {/* Dark score card */}
        <div
          className="score-card"
          style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 4, padding: '10px 10px',
            ...(isLive ? { border: '0.5px solid rgba(74,222,128,0.3)' } : {}),
          }}
        >

          {/* Home */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <Flag teamName={match.home_team?.name} size="md" style={{ flexShrink: 0 }} />
            <span style={{
              fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {match.home_team?.name || 'TBD'}
            </span>
          </div>

          {/* Score / vs */}
          <div style={{ flexShrink: 0, textAlign: 'center', padding: '0 6px' }}>
            {isCompleted ? (
              <div>
                <span style={{ fontSize: 20, fontWeight: 500, color: '#F5E6B0' }}>
                  {match.home_score}–{match.away_score}
                </span>
                {match.penalty_winner_id && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    pens
                  </div>
                )}
              </div>
            ) : isLive ? (
              <div>
                <span style={{ fontSize: 20, fontWeight: 500, color: '#4ade80' }}>
                  {match.home_score ?? 0}–{match.away_score ?? 0}
                </span>
                <div style={{ fontSize: 9, color: '#4ade80', marginTop: 2, fontWeight: 600, letterSpacing: '0.05em' }}>
                  <PulsingDot /> LIVE
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.45)' }}>vs</span>
            )}
          </div>

          {/* Away */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
            <span style={{
              fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
            }}>
              {match.away_team?.name || 'TBD'}
            </span>
            <Flag teamName={match.away_team?.name} size="md" style={{ flexShrink: 0 }} />
          </div>
        </div>

        {/* Right column: prediction + action */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 72 }}>
          {hasPrediction && (
            <div style={{
              textAlign: 'center', width: '100%',
              background: isCompleted ? 'transparent' : 'rgba(26,107,58,0.08)',
              border: isCompleted ? 'none' : '1px solid rgba(26,107,58,0.2)',
              borderRadius: 8, padding: isCompleted ? '0' : '6px 4px',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(13,27,42,0.45)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Your pick
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1A6B3A', lineHeight: 1.2 }}>
                {prediction.predicted_home_score}–{prediction.predicted_away_score}
              </div>
              {prediction.points != null ? (
                <button
                  onClick={() => setShowBreakdown(b => !b)}
                  style={{
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                    color:      prediction.points > 0 ? '#0D3D20' : 'rgba(13,27,42,0.45)',
                    background: prediction.points > 0 ? '#C8E6D4' : '#E8E0CC',
                    borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginTop: 2,
                  }}
                  title="Show points breakdown"
                >
                  {prediction.points}pts {showBreakdown ? '▲' : '▼'}
                </button>
              ) : isLive ? (
                <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>pending…</span>
              ) : null}
            </div>
          )}

          {canPredict && (
            <button
              onClick={() => setExpanded(e => !e)}
              className={hasPrediction ? 'btn-secondary' : 'btn-primary'}
              style={{ padding: '5px 8px', fontSize: 12, width: '100%', textAlign: 'center' }}
            >
              {hasPrediction ? 'Edit' : 'Predict'}
            </button>
          )}

          {isLive && !hasPrediction && (
            <span style={{ fontSize: 10, color: 'rgba(13,27,42,0.35)', fontStyle: 'italic' }}>locked</span>
          )}
        </div>
      </div>

      {/* Match meta row */}
      <div className="flex items-center gap-3 mt-2 flex-wrap" style={{ fontSize: 12, color: 'rgba(13,27,42,0.45)' }}>
        <span>{matchDate}</span>
        {match.group_name && <span>Group {match.group_name}</span>}
        <StatusBadge status={match.status} />
        {canPredict && <CountdownTimer matchDate={match.match_date} />}
      </div>

      {/* Points breakdown (expandable) */}
      {showBreakdown && isCompleted && hasPrediction && (
        <PointsBreakdown prediction={prediction} match={match} isKnockout={isKnockout} />
      )}

      {/* Prediction form */}
      {expanded && canPredict && (
        <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid rgba(13,27,42,0.1)' }}>
          <PredictionForm
            match={match}
            existing={prediction}
            isKnockout={isKnockout}
            onSaved={() => { setExpanded(false); onPredictionSaved?.() }}
            onCancel={() => setExpanded(false)}
          />
        </div>
      )}
    </div>
  )
}

// ── Countdown timer ──────────────────────────────────────────────────────────
function CountdownTimer({ matchDate }) {
  const [diff, setDiff] = useState(null)

  useEffect(() => {
    function tick() {
      const ms = new Date(matchDate).getTime() - Date.now()
      setDiff(ms > 0 && ms < 24 * 3600 * 1000 ? ms : null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [matchDate])

  if (!diff) return null

  const h  = Math.floor(diff / 3600000)
  const m  = Math.floor((diff % 3600000) / 60000)
  const s  = Math.floor((diff % 60000) / 1000)
  const display = h > 0 ? `in ${h}h ${m}m` : m > 0 ? `in ${m}m ${s}s` : `in ${s}s`
  const urgent  = diff < 30 * 60 * 1000 // < 30 min → red

  return (
    <span style={{ fontWeight: 500, color: urgent ? '#C0392B' : '#D4A017' }}>
      {display}
    </span>
  )
}

// ── Live pulsing dot ─────────────────────────────────────────────────────────
function PulsingDot() {
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: '#4ade80', marginRight: 3, verticalAlign: 'middle',
      animation: 'pulse 1.4s ease-in-out infinite',
    }} />
  )
}

// ── Points breakdown panel ───────────────────────────────────────────────────
function PointsBreakdown({ prediction, match, isKnockout }) {
  const ph = prediction.predicted_home_score
  const pa = prediction.predicted_away_score
  const ah = match.home_score
  const aa = match.away_score

  const getResult = (h, a) => h > a ? 'home' : h < a ? 'away' : 'draw'
  const isExact       = ph === ah && pa === aa
  const correctResult = getResult(ph, pa) === getResult(ah, aa)
  const within1       = correctResult && Math.abs(ph - ah) <= 1 && Math.abs(pa - aa) <= 1
  const penBonus      = isKnockout
    && !!match.penalty_winner_id
    && !!prediction.predicted_penalty_winner_id
    && prediction.predicted_penalty_winner_id === match.penalty_winner_id

  const tier = isExact ? 'exact' : within1 ? 'within1' : correctResult ? 'correct' : 'wrong'
  const TIERS = {
    exact:   { label: 'Exact score ✓',              bg: '#D6EFE0', color: '#0D3D20' },
    within1: { label: 'Correct result + within 1 ✓', bg: '#D6EFE0', color: '#0D3D20' },
    correct: { label: 'Correct result ✓',            bg: '#F5E6B0', color: '#8B6A0A' },
    wrong:   { label: 'Wrong result ✗',              bg: '#F8DFDC', color: '#7A1C12' },
  }
  const { label, bg, color } = TIERS[tier]

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '0.5px solid rgba(13,27,42,0.08)' }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(13,27,42,0.4)', marginBottom: 6 }}>
        POINTS BREAKDOWN
      </div>
      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12 }}>
        <span style={{ color: 'rgba(13,27,42,0.5)' }}>
          Your pick: <strong style={{ color: '#0D1B2A' }}>{ph}–{pa}</strong>
        </span>
        <span style={{ color: 'rgba(13,27,42,0.25)' }}>·</span>
        <span style={{ color: 'rgba(13,27,42,0.5)' }}>
          Actual: <strong style={{ color: '#0D1B2A' }}>{ah}–{aa}</strong>
        </span>
        <span style={{ color: 'rgba(13,27,42,0.25)' }}>·</span>
        <span style={{ background: bg, color, borderRadius: 6, padding: '1px 8px', fontWeight: 500 }}>
          {label}
        </span>
        {penBonus && (
          <span style={{ background: '#F5E6B0', color: '#8B6A0A', borderRadius: 6, padding: '1px 8px', fontWeight: 500 }}>
            +1 penalty bonus ✓
          </span>
        )}
      </div>
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    scheduled:   { label: 'Upcoming', cls: 'badge-upcoming' },
    in_progress: { label: 'Live',     cls: 'badge-live'     },
    completed:   { label: 'Final',    cls: 'badge-final'    },
  }
  const { label, cls } = map[status] || map.scheduled
  return <span className={`badge ${cls}`}>{label}</span>
}
