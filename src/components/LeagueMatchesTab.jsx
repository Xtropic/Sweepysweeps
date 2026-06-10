import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MatchCard from './MatchCard'
import { STAGE_LABELS } from '../lib/teams'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']

export default function LeagueMatchesTab({ userId, isResultOnly }) {
  const [matches, setMatches]           = useState([])
  const [predictions, setPredictions]   = useState({})
  const [loading, setLoading]           = useState(true)
  const [activeStage, setActiveStage]   = useState('group')
  const [activeGroup, setActiveGroup]   = useState('schedule')

  useEffect(() => {
    loadData()

    const channel = supabase
      .channel(`league-matches-tab-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, payload => {
        setMatches(prev => prev.map(m =>
          m.id === payload.new.id
            ? { ...m, ...payload.new, home_team: m.home_team, away_team: m.away_team }
            : m
        ))
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'predictions',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        setPredictions(prev => ({
          ...prev,
          [payload.new.match_id]: { ...(prev[payload.new.match_id] ?? {}), ...payload.new },
        }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function loadData() {
    setLoading(true)
    const [{ data: matchData }, { data: predData }] = await Promise.all([
      supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
        .order('match_date', { ascending: true }),
      supabase.from('predictions').select('*').eq('user_id', userId),
    ])
    setMatches(matchData || [])
    const predMap = {}
    for (const p of predData || []) predMap[p.match_id] = p
    setPredictions(predMap)
    setLoading(false)
  }

  const stages = [...new Set(matches.map(m => m.stage))]
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))

  const stageMatches = matches.filter(m => m.stage === activeStage)
  const groups = activeStage === 'group'
    ? [...new Set(stageMatches.map(m => m.group_name).filter(Boolean))].sort()
    : []

  const scheduleMatches = activeStage === 'group'
    ? [...stageMatches].sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
    : []

  const displayMatches = activeStage !== 'group'
    ? stageMatches
    : activeGroup === 'schedule'
      ? scheduleMatches
      : stageMatches.filter(m => m.group_name === activeGroup)

  const liveGroup = stageMatches.find(m => m.status === 'in_progress')?.group_name

  function groupByDate(matchList) {
    const sections = []
    let currentDate = null
    for (const m of matchList) {
      const dateKey = m.match_date
        ? new Date(m.match_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        : 'Date TBC'
      if (dateKey !== currentDate) {
        sections.push({ date: dateKey, matches: [m] })
        currentDate = dateKey
      } else {
        sections[sections.length - 1].matches.push(m)
      }
    }
    return sections
  }

  if (loading) {
    return <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading matches…</div>
  }

  return (
    <div>
      {/* Scoring rule reminder */}
      {isResultOnly && (
        <div style={{
          fontSize: 12, color: '#1A6B3A', background: '#D6EFE0',
          borderRadius: 8, padding: '8px 14px', marginBottom: 16,
          border: '1px solid rgba(26,107,58,0.25)',
        }}>
          This league uses <strong>result only</strong> scoring — pick Home win, Draw, or Away win. +1 pt for each correct result.
        </div>
      )}

      {/* Stage tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        {stages.map(stage => {
          const hasLive = matches.some(m => m.stage === stage && m.status === 'in_progress')
          return (
            <button
              key={stage}
              onClick={() => {
                setActiveStage(stage)
                setActiveGroup(liveGroup && stage === 'group' ? liveGroup : 'schedule')
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
          <button
            onClick={() => setActiveGroup('schedule')}
            className="rounded-badge flex-shrink-0 whitespace-nowrap transition-colors"
            style={{
              padding: '5px 12px', fontSize: 13, fontWeight: 500,
              background: activeGroup === 'schedule' ? '#1A6B3A' : '#E8E0CC',
              color: activeGroup === 'schedule' ? 'white' : 'rgba(13,27,42,0.65)',
            }}
          >
            Schedule
          </button>
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
                    background: '#4ade80', animation: 'pulse 1.4s ease-in-out infinite',
                  }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Match list */}
      {displayMatches.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(13,27,42,0.4)' }}>
          No matches available yet.
        </div>
      ) : activeGroup === 'schedule' && activeStage === 'group' ? (
        <div className="flex flex-col" style={{ gap: 24 }}>
          {groupByDate(displayMatches).map(({ date, matches: dayMatches }) => (
            <div key={date}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'rgba(13,27,42,0.45)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                marginBottom: 10, paddingBottom: 6,
                borderBottom: '1px solid rgba(13,27,42,0.08)',
              }}>
                {date}
              </div>
              <div className="flex flex-col" style={{ gap: 10 }}>
                {dayMatches.map(match => (
                  <div key={match.id}>
                    <div style={{ fontSize: 11, color: 'rgba(13,27,42,0.4)', fontWeight: 500, marginBottom: 4 }}>
                      Group {match.group_name}
                    </div>
                    <MatchCard
                      match={match}
                      prediction={predictions[match.id]}
                      onPredictionSaved={loadData}
                      resultOnly={isResultOnly}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {displayMatches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              prediction={predictions[match.id]}
              onPredictionSaved={loadData}
              resultOnly={isResultOnly}
            />
          ))}
        </div>
      )}
    </div>
  )
}
