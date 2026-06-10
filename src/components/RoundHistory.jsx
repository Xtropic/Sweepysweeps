import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']
const STAGE_LABELS = {
  round_of_32: 'Round of 32', round_of_16: 'Round of 16',
  quarter_final: 'Quarter-final', semi_final: 'Semi-final',
  third_place: 'Third Place Play-off', final: 'Final',
}

function assignRound(matches) {
  const byGroup = {}
  for (const m of matches) {
    if (m.stage !== 'group') continue
    if (!byGroup[m.group_name]) byGroup[m.group_name] = []
    byGroup[m.group_name].push(m)
  }
  for (const grp of Object.values(byGroup)) {
    grp.sort((a, b) => a.match_number - b.match_number)
    grp.forEach((m, i) => { m._round = `Group Stage – Matchday ${Math.floor(i / 2) + 1}`; m._order = Math.floor(i / 2) })
  }
  for (const m of matches) {
    if (m.stage !== 'group') {
      m._round = STAGE_LABELS[m.stage] || m.stage
      m._order = 3 + STAGE_ORDER.indexOf(m.stage)
    }
  }
  return matches
}

export default function RoundHistory() {
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: matchData }, { data: predData }, { data: profileData }] = await Promise.all([
      supabase.from('matches').select('id, stage, group_name, match_number, status'),
      supabase.from('predictions').select('user_id, match_id, points').not('points', 'is', null),
      supabase.from('profiles').select('id, username'),
    ])

    if (!matchData || !predData || !profileData) { setLoading(false); return }

    const profileMap = Object.fromEntries(profileData.map(p => [p.id, p.username || 'Anonymous']))
    const predByMatch = {}
    for (const p of predData) {
      if (!predByMatch[p.match_id]) predByMatch[p.match_id] = []
      predByMatch[p.match_id].push(p)
    }

    const withRounds = assignRound(matchData)

    // Group into rounds
    const roundMap = {}
    for (const m of withRounds) {
      if (!m._round) continue
      if (!roundMap[m._round]) roundMap[m._round] = { label: m._round, order: m._order, matches: [], complete: false }
      roundMap[m._round].matches.push(m)
    }

    const completed = []
    for (const r of Object.values(roundMap)) {
      if (!r.matches.every(m => m.status === 'completed')) continue

      // Sum points per user for this round
      const userPoints = {}
      for (const m of r.matches) {
        for (const pred of predByMatch[m.id] || []) {
          userPoints[pred.user_id] = (userPoints[pred.user_id] || 0) + (pred.points || 0)
        }
      }
      if (Object.keys(userPoints).length === 0) continue

      const maxPts = Math.max(...Object.values(userPoints))
      const leaders = Object.entries(userPoints)
        .filter(([, pts]) => pts === maxPts)
        .map(([uid]) => profileMap[uid])

      completed.push({ label: r.label, order: r.order, leaders, points: maxPts })
    }

    completed.sort((a, b) => b.order - a.order) // most recent first
    setRounds(completed)
    setLoading(false)
  }

  if (loading) return <div className="text-center py-8" style={{ color: 'rgba(13,27,42,0.4)', fontSize: 13 }}>Loading…</div>
  if (rounds.length === 0) return (
    <div className="card text-center" style={{ padding: '32px 24px' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🏅</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A', marginBottom: 4 }}>No completed rounds yet</div>
      <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>Round winners will appear here as matches are completed.</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rounds.map((r, i) => {
        const names = r.leaders.length === 1
          ? r.leaders[0]
          : r.leaders.slice(0, -1).join(', ') + ' & ' + r.leaders.at(-1)
        const isTie = r.leaders.length > 1
        const isLatest = i === 0

        return (
          <div key={r.label} className="card flex items-center gap-3"
            style={isLatest ? { border: '1.5px solid rgba(212,160,23,0.5)', background: '#FFFDF4' } : {}}>
            <div style={{ fontSize: 20, flexShrink: 0 }}>{isLatest ? '🏅' : '🔖'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,42,0.4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                {r.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A' }} className="truncate">
                {names}
                {isTie && <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.45)', marginLeft: 5 }}>tied</span>}
              </div>
            </div>
            <div style={{
              flexShrink: 0, fontSize: 15, fontWeight: 600,
              background: isLatest ? '#D4A017' : '#E8E0CC',
              color: isLatest ? 'white' : '#5A4F3A',
              borderRadius: 8, padding: '3px 10px',
            }}>
              {r.points} pts
            </div>
          </div>
        )
      })}
    </div>
  )
}
