import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Flag from '../components/Flag'
import AdBanner from '../components/AdBanner'

const STAGE_ORDER = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final']
const STAGE_LABELS = {
  round_of_32:   'Round of 32',
  round_of_16:   'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final:    'Semi Finals',
  final:         'Final',
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

export default function BracketPage() {
  const [matches, setMatches]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('groups')

  useEffect(() => {
    supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
      .order('match_number', { ascending: true })
      .then(({ data }) => { setMatches(data || []); setLoading(false) })

    // Realtime updates
    const ch = supabase.channel('bracket-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, payload => {
        setMatches(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, ...payload.new, home_team: m.home_team, away_team: m.away_team } : m
        ))
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const groupMatches   = matches.filter(m => m.stage === 'group')
  const knockoutMatches = matches.filter(m => m.stage !== 'group')
  const thirdPlace      = matches.find(m => m.stage === 'third_place')

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 48, width: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 18, color: '#0D1B2A', marginBottom: 2 }}>Tournament Bracket</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>FIFA World Cup 2026</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {[{ key: 'groups', label: 'Groups' }, { key: 'bracket', label: 'Knock-out' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="rounded-badge transition-colors"
            style={{
              padding: '6px 16px', fontSize: 13, fontWeight: 500,
              background: tab === t.key ? '#0D1B2A' : '#E8E0CC',
              color: tab === t.key ? 'white' : 'rgba(13,27,42,0.65)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <AdBanner slot="2233445566" size="responsive" style={{ marginBottom: 20 }} />

      {loading ? (
        <div className="text-center py-20" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading…</div>
      ) : tab === 'bracket' ? (
        <BracketView matches={knockoutMatches} thirdPlace={thirdPlace} />
      ) : (
        <GroupsView matches={groupMatches} />
      )}
    </div>
  )
}

/* ─── BRACKET VIEW ─────────────────────────────────────── */
function BracketView({ matches, thirdPlace }) {
  const byStage = stage => matches.filter(m => m.stage === stage)

  return (
    <div>
      {/* Horizontal scroll bracket */}
      <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
        <div style={{ display: 'flex', gap: 0, minWidth: 900 }}>
          {STAGE_ORDER.map((stage, si) => {
            const stageMatches = byStage(stage)
            if (stageMatches.length === 0) return null
            const totalSlots = Math.pow(2, STAGE_ORDER.length - 1 - si)
            return (
              <div key={stage} style={{ flex: 1, minWidth: 160 }}>
                {/* Stage header */}
                <div className="text-center mb-3" style={{
                  fontSize: 11, fontWeight: 600, color: 'rgba(13,27,42,0.45)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 6px',
                }}>
                  {STAGE_LABELS[stage]}
                </div>

                {/* Match slots */}
                <div style={{ display: 'flex', flexDirection: 'column', height: totalSlots * 72 }}>
                  {stageMatches.map((match, mi) => {
                    const slotHeight = (totalSlots / stageMatches.length) * 72
                    return (
                      <div key={match.id} style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 6px',
                      }}>
                        <MatchSlot match={match} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Third place match */}
      {thirdPlace && (
        <div className="mt-8">
          <div className="text-center mb-3" style={{
            fontSize: 11, fontWeight: 600, color: 'rgba(13,27,42,0.45)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Third Place Play-off
          </div>
          <div style={{ maxWidth: 200, margin: '0 auto' }}>
            <MatchSlot match={thirdPlace} />
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'rgba(13,27,42,0.35)', textAlign: 'center', marginTop: 24 }}>
        Teams will appear as the group stage concludes · Scores update every 3 minutes
      </p>
    </div>
  )
}

function MatchSlot({ match }) {
  const isLive      = match.status === 'in_progress'
  const isCompleted = match.status === 'completed'
  const hasTeams    = match.home_team || match.away_team

  return (
    <div style={{
      width: '100%',
      background: isLive ? '#0D1B2A' : 'white',
      border: isLive ? '1.5px solid #4ade80' : '1px solid rgba(13,27,42,0.1)',
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: isLive ? '0 0 12px rgba(74,222,128,0.25)' : '0 1px 4px rgba(13,27,42,0.06)',
    }}>
      {/* Live badge */}
      {isLive && (
        <div style={{
          background: '#4ade80', color: '#0D1B2A', fontSize: 9, fontWeight: 700,
          textAlign: 'center', padding: '2px 0', letterSpacing: '0.06em',
        }}>
          ● LIVE
        </div>
      )}

      <TeamRow
        team={match.home_team}
        score={match.home_score}
        isLive={isLive}
        isCompleted={isCompleted}
        isWinner={isCompleted && match.home_score > match.away_score}
      />
      <div style={{ height: 1, background: isLive ? 'rgba(255,255,255,0.1)' : 'rgba(13,27,42,0.07)' }} />
      <TeamRow
        team={match.away_team}
        score={match.away_score}
        isLive={isLive}
        isCompleted={isCompleted}
        isWinner={isCompleted && match.away_score > match.home_score}
      />
    </div>
  )
}

function TeamRow({ team, score, isLive, isCompleted, isWinner }) {
  const textColor = isLive
    ? (isWinner ? 'white' : 'rgba(255,255,255,0.6)')
    : (isWinner ? '#0D1B2A' : 'rgba(13,27,42,0.5)')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 8px',
      background: isWinner && !isLive ? '#F5F3EE' : 'transparent',
    }}>
      {team ? (
        <>
          <Flag code={team.code} style={{ width: 18, height: 13, borderRadius: 2, flexShrink: 0 }} />
          <span style={{
            flex: 1, fontSize: 12, fontWeight: isWinner ? 600 : 400,
            color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {team.name}
          </span>
        </>
      ) : (
        <>
          <div style={{ width: 18, height: 13, borderRadius: 2, background: 'rgba(13,27,42,0.08)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(13,27,42,0.3)', fontStyle: 'italic' }}>TBD</span>
        </>
      )}
      {(isLive || isCompleted) && score != null && (
        <span style={{
          fontSize: 14, fontWeight: 700, color: isLive ? '#4ade80' : (isWinner ? '#D4A017' : textColor),
          minWidth: 16, textAlign: 'right',
        }}>
          {score}
        </span>
      )}
    </div>
  )
}

/* ─── GROUPS VIEW ─────────────────────────────────────── */
function GroupsView({ matches }) {
  // Build standings for each group
  const grouped = {}
  for (const g of GROUPS) {
    const gMatches = matches.filter(m => m.group_name === g)
    if (gMatches.length === 0) continue

    const teams = {}
    for (const m of gMatches) {
      for (const [t, opp, ts, os] of [
        [m.home_team, m.away_team, m.home_score, m.away_score],
        [m.away_team, m.home_team, m.away_score, m.home_score],
      ]) {
        if (!t) continue
        if (!teams[t.id]) teams[t.id] = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
        const played = ts != null && os != null
        if (played) {
          teams[t.id].p++
          teams[t.id].gf += ts
          teams[t.id].ga += os
          if (ts > os)      { teams[t.id].w++; teams[t.id].pts += 3 }
          else if (ts === os){ teams[t.id].d++; teams[t.id].pts += 1 }
          else               { teams[t.id].l++ }
        }
      }
    }

    grouped[g] = Object.values(teams).sort((a, b) =>
      b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
    )
  }

  if (Object.keys(grouped).length === 0) {
    return (
      <div className="text-center py-20" style={{ color: 'rgba(13,27,42,0.4)' }}>
        Group fixtures not loaded yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {GROUPS.filter(g => grouped[g]).map(g => (
        <div key={g} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Group header */}
          <div style={{
            background: '#0D1B2A', color: 'white', padding: '8px 14px',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
          }}>
            Group {g}
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 28px 28px 28px 28px 32px',
            padding: '6px 12px', fontSize: 11, fontWeight: 600,
            color: 'rgba(13,27,42,0.4)', borderBottom: '1px solid rgba(13,27,42,0.08)',
          }}>
            <span>Team</span>
            <span style={{ textAlign: 'center' }}>P</span>
            <span style={{ textAlign: 'center' }}>W</span>
            <span style={{ textAlign: 'center' }}>D</span>
            <span style={{ textAlign: 'center' }}>L</span>
            <span style={{ textAlign: 'center' }}>Pts</span>
          </div>

          {/* Rows */}
          {grouped[g].map((row, i) => (
            <div key={row.team.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 28px 28px 28px 28px 32px',
              padding: '7px 12px', alignItems: 'center',
              background: i < 2 ? 'rgba(26,107,58,0.05)' : 'white',
              borderBottom: i < grouped[g].length - 1 ? '1px solid rgba(13,27,42,0.05)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: i < 2 ? '#1A6B3A' : 'rgba(13,27,42,0.3)',
                  width: 12,
                }}>
                  {i + 1}
                </span>
                <Flag code={row.team.code} style={{ width: 18, height: 13, borderRadius: 2 }} />
                <span style={{ fontSize: 12, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.team.name}
                </span>
              </div>
              {[row.p, row.w, row.d, row.l].map((v, vi) => (
                <span key={vi} style={{ textAlign: 'center', fontSize: 12, color: 'rgba(13,27,42,0.6)' }}>{v}</span>
              ))}
              <span style={{
                textAlign: 'center', fontSize: 13, fontWeight: 700,
                color: i < 2 ? '#1A6B3A' : '#0D1B2A',
              }}>
                {row.pts}
              </span>
            </div>
          ))}

          {/* Qualification note */}
          <div style={{ padding: '5px 12px', fontSize: 10, color: '#1A6B3A', background: 'rgba(26,107,58,0.04)' }}>
            ↑ Top 2 qualify for Round of 32
          </div>
        </div>
      ))}
    </div>
  )
}
