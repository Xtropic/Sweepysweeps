import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_LABELS } from '../lib/teams'
import MatchCard from '../components/MatchCard'
import AdBanner from '../components/AdBanner'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']

export default function MatchesPage() {
  const { user } = useAuth()
  const [matches, setMatches]         = useState([])
  const [predictions, setPredictions] = useState({})
  const [loading, setLoading]         = useState(true)
  const [activeStage, setActiveStage] = useState('group')
  const [activeGroup, setActiveGroup] = useState('A')

  useEffect(() => { loadData() }, [])

  // ── Supabase Realtime — live score + points updates ──────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('live-updates')
      // Match score / status changes
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          setMatches(prev =>
            prev.map(m =>
              m.id === payload.new.id
                // Merge new fields but keep the joined home_team / away_team objects
                ? { ...m, ...payload.new, home_team: m.home_team, away_team: m.away_team }
                : m
            )
          )
        }
      )
      // Prediction points update (after admin / sync scores)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', schema: 'public', table: 'predictions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setPredictions(prev => ({
            ...prev,
            [payload.new.match_id]: { ...(prev[payload.new.match_id] ?? {}), ...payload.new },
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user.id])

  async function loadData() {
    setLoading(true)
    const [{ data: matchData }, { data: predData }] = await Promise.all([
      supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
        .order('match_number', { ascending: true }),
      supabase.from('predictions').select('*').eq('user_id', user.id),
    ])
    setMatches(matchData || [])
    const predMap = {}
    for (const p of predData || []) predMap[p.match_id] = p
    setPredictions(predMap)
    setLoading(false)
  }

  const stages = [...new Set((matches || []).map(m => m.stage))]
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))

  const stageMatches  = matches.filter(m => m.stage === activeStage)
  const groups        = activeStage === 'group'
    ? [...new Set(stageMatches.map(m => m.group_name).filter(Boolean))].sort()
    : []
  const displayMatches = activeStage === 'group'
    ? stageMatches.filter(m => m.group_name === activeGroup)
    : stageMatches

  const totalPredicted = Object.keys(predictions).length
  const totalPoints    = Object.values(predictions).reduce((sum, p) => sum + (p.points || 0), 0)

  // Auto-select first group that has a live match, else default A
  const liveGroup = stageMatches.find(m => m.status === 'in_progress')?.group_name

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 64, width: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 22, color: '#0D1B2A', marginBottom: 2 }}>Sweepy Sweep Sweep Stakes</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>World Cup 2026 Predictions</p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="card mb-6 flex items-center justify-between">
        <div>
          <div style={{ fontSize: 14, color: 'rgba(13,27,42,0.55)' }}>{totalPredicted} / {matches.length} predictions made</div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 28, fontWeight: 500, color: '#D4A017' }}>{totalPoints}</div>
          <div style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 500 }}>total points</div>
        </div>
      </div>

      {/* Ad banner */}
      <AdBanner slot="1234567890" size="responsive" style={{ marginBottom: 20 }} />

      {/* Stage tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        {stages.map(stage => {
          const hasLive = matches.some(m => m.stage === stage && m.status === 'in_progress')
          return (
            <button
              key={stage}
              onClick={() => {
                setActiveStage(stage)
                setActiveGroup(liveGroup && stage === 'group' ? liveGroup : 'A')
              }}
              className="rounded-badge flex-shrink-0 whitespace-nowrap transition-colors"
              style={{
                padding: '5px 12px', fontSize: 13, fontWeight: 500,
                background: activeStage === stage ? '#0D1B2A' : '#E8E0CC',
                color: activeStage === stage ? 'white' : 'rgba(13,27,42,0.65)',
              }}
            >
              {STAGE_LABELS[stage] || stage}
              {hasLive && (
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: '#4ade80', marginLeft: 5, verticalAlign: 'middle',
                  animation: 'pulse 1.4s ease-in-out infinite',
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Group tabs */}
      {activeStage === 'group' && groups.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
          {groups.map(g => {
            const hasLive = stageMatches.some(m => m.group_name === g && m.status === 'in_progress')
            return (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className="rounded-badge flex-shrink-0 transition-colors relative"
                style={{
                  width: 36, height: 36, fontSize: 13, fontWeight: 500,
                  background: activeGroup === g ? '#1A6B3A' : '#E8E0CC',
                  color:      activeGroup === g ? 'white' : 'rgba(13,27,42,0.65)',
                }}
              >
                {g}
                {hasLive && (
                  <span style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#4ade80',
                    animation: 'pulse 1.4s ease-in-out infinite',
                  }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading matches…</div>
      ) : displayMatches.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>
          No matches available yet.
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {displayMatches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              prediction={predictions[match.id]}
              onPredictionSaved={loadData}
            />
          ))}
        </div>
      )}
    </div>
  )
}
