import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']
const STAGE_LABELS = {
  group: 'Group Stage',
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter-final',
  semi_final: 'Semi-final',
  third_place: 'Third Place Play-off',
  final: 'Final',
}

function assignRound(matches) {
  // Group stage: determine matchday (1/2/3) per match based on rank within its group
  const byGroup = {}
  for (const m of matches) {
    if (m.stage !== 'group') continue
    if (!byGroup[m.group_name]) byGroup[m.group_name] = []
    byGroup[m.group_name].push(m)
  }
  for (const grp of Object.values(byGroup)) {
    grp.sort((a, b) => a.match_number - b.match_number)
    grp.forEach((m, i) => { m._round = `Group Stage – Matchday ${Math.floor(i / 2) + 1}` })
  }

  // Knockout stages: round = stage label
  for (const m of matches) {
    if (m.stage !== 'group') {
      m._round = STAGE_LABELS[m.stage] || m.stage
    }
  }

  return matches
}

function getRoundOrder(roundLabel) {
  if (roundLabel.startsWith('Group Stage – Matchday ')) {
    const day = parseInt(roundLabel.slice(-1))
    return day - 1
  }
  for (let i = 1; i < STAGE_ORDER.length; i++) {
    if (STAGE_LABELS[STAGE_ORDER[i]] === roundLabel) return 2 + i
  }
  return 99
}

export default function RoundLeaderBanner() {
  const [banner, setBanner] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: matchData }, { data: predData }, { data: profileData }] = await Promise.all([
      supabase.from('matches').select('id, stage, group_name, match_number, status'),
      supabase.from('predictions').select('user_id, match_id, points').not('points', 'is', null),
      supabase.from('profiles').select('id, username'),
    ])

    if (!matchData || !predData || !profileData) { setLoading(false); return }

    const profileMap = Object.fromEntries(profileData.map(p => [p.id, p.username]))
    const predByMatch = Object.fromEntries(predData.map(p => [p.match_id, p]))

    // Assign rounds to all matches
    const withRounds = assignRound(matchData)

    // Group matches by round
    const rounds = {}
    for (const m of withRounds) {
      if (!m._round) continue
      if (!rounds[m._round]) rounds[m._round] = { matches: [], order: getRoundOrder(m._round) }
      rounds[m._round].matches.push(m)
    }

    // Find the most recently fully-completed round
    let completedRounds = Object.entries(rounds)
      .filter(([, v]) => v.matches.every(m => m.status === 'completed'))
      .sort((a, b) => b[1].order - a[1].order) // most recent first

    if (completedRounds.length === 0) { setLoading(false); return }

    const [roundLabel, roundData] = completedRounds[0]

    // Sum points per user for this round
    const userPoints = {}
    for (const m of roundData.matches) {
      const pred = predByMatch[m.id]
      if (!pred) continue
      userPoints[pred.user_id] = (userPoints[pred.user_id] || 0) + (pred.points || 0)
    }

    if (Object.keys(userPoints).length === 0) { setLoading(false); return }

    const maxPts = Math.max(...Object.values(userPoints))
    const leaders = Object.entries(userPoints)
      .filter(([, pts]) => pts === maxPts)
      .map(([uid]) => profileMap[uid] || 'Anonymous')

    setBanner({ round: roundLabel, leaders, points: maxPts })
    setLoading(false)
  }

  if (loading || !banner) return null

  const names = banner.leaders.length === 1
    ? banner.leaders[0]
    : banner.leaders.slice(0, -1).join(', ') + ' & ' + banner.leaders.at(-1)

  const isTie = banner.leaders.length > 1

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: 'linear-gradient(135deg, #F5E6B0 0%, #FDF3D0 100%)',
      border: '1px solid rgba(212,160,23,0.3)',
      borderRadius: 12, padding: '12px 16px', marginBottom: 16,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>🏅</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#8B6A0A', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>
          {banner.round} — Round leader{isTie ? 's' : ''}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#0D1B2A' }}>
          {names}
          <span style={{
            display: 'inline-block', marginLeft: 8,
            background: '#D4A017', color: 'white',
            fontSize: 12, fontWeight: 600,
            borderRadius: 6, padding: '1px 8px', verticalAlign: 'middle',
          }}>
            {banner.points} pts
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(13,27,42,0.5)', marginTop: 2 }}>
          {isTie ? 'Tied for most points this round' : 'Most points this round'}
        </div>
      </div>
    </div>
  )
}
