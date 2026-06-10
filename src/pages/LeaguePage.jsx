import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_LABELS, KNOCKOUT_STAGES } from '../lib/teams'
import Flag from '../components/Flag'
import LeagueChat from '../components/LeagueChat'
import AdBanner from '../components/AdBanner'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']

const ROUND_STAGE_LABELS = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter-final',
  semi_final: 'Semi-final',
  third_place: 'Third Place Play-off',
  final: 'Final',
}

function assignRounds(matches) {
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
  for (const m of matches) {
    if (m.stage !== 'group') m._round = ROUND_STAGE_LABELS[m.stage] || m.stage
  }
  return matches
}

const hasTournamentPrize = (pt) => pt === 'tournament' || pt === 'both'
const hasRoundPrize      = (pt) => pt === 'per_round'  || pt === 'both'
function toPrizeType(tournament, perRound) {
  if (tournament && perRound) return 'both'
  if (tournament) return 'tournament'
  if (perRound)   return 'per_round'
  return 'none'
}

function getRoundOrder(label) {
  if (label.startsWith('Group Stage – Matchday ')) return parseInt(label.slice(-1)) - 1
  for (let i = 1; i < STAGE_ORDER.length; i++) {
    if (ROUND_STAGE_LABELS[STAGE_ORDER[i]] === label) return 2 + i
  }
  return 99
}

export default function LeaguePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [league, setLeague]       = useState(null)
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [copied, setCopied]       = useState(false)
  const [confirmLeave, setConfirmLeave]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [togglingPaid, setTogglingPaid]   = useState(null)

  // Settings editor state
  const [editingSettings, setEditingSettings]     = useState(false)
  const [settingsName, setSettingsName]           = useState('')
  const [settingsTournament, setSettingsTournament] = useState(false)
  const [settingsPerRound, setSettingsPerRound]   = useState(false)
  const [savingSettings, setSavingSettings]       = useState(false)
  const [settingsError, setSettingsError]         = useState('')

  // Rounds tab state
  const [roundsData, setRoundsData]       = useState([])
  const [roundPayments, setRoundPayments] = useState({})
  const [roundsLoading, setRoundsLoading] = useState(false)
  const [togglingRoundPaid, setTogglingRoundPaid] = useState(null)

  // Predictions tab state
  const [activeTab, setActiveTab]         = useState('standings')
  const [lockedMatches, setLockedMatches] = useState([])
  const [allPreds, setAllPreds]           = useState({})
  const [predsLoading, setPredsLoading]   = useState(false)
  const [activeStage, setActiveStage]     = useState('group')
  const [activeGroup, setActiveGroup]     = useState('A')
  const [expandedMatch, setExpandedMatch] = useState(null)

  useEffect(() => { loadLeague() }, [id])

  async function loadLeague() {
    const [{ data: lg }, { data: memberData }] = await Promise.all([
      supabase.from('leagues').select('*, prize_type').eq('id', id).single(),
      supabase.from('league_members')
        .select('user_id, joined_at, paid, profiles(id, username, total_points)')
        .eq('league_id', id).order('joined_at', { ascending: true }),
    ])
    setLeague(lg)
    const sorted = (memberData || [])
      .map(m => ({ ...m.profiles, joined_at: m.joined_at, paid: m.paid }))
      .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
    setMembers(sorted)
    setLoading(false)
  }

  async function loadPredictions(memberList) {
    setPredsLoading(true)
    const now = new Date().toISOString()
    const memberIds = memberList.map(m => m.id)

    const [{ data: matchData }, { data: predData }] = await Promise.all([
      supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)')
        .lte('match_date', now)
        .order('match_number', { ascending: true }),
      supabase
        .from('predictions')
        .select('*')
        .in('user_id', memberIds),
    ])

    setLockedMatches(matchData || [])

    const map = {}
    for (const p of predData || []) {
      if (!map[p.match_id]) map[p.match_id] = {}
      map[p.match_id][p.user_id] = p
    }
    setAllPreds(map)
    setPredsLoading(false)
  }

  async function loadRoundsData(memberList) {
    setRoundsLoading(true)
    const memberIds = memberList.map(m => m.id)

    const queries = [
      supabase.from('matches').select('id, stage, group_name, match_number, status'),
      supabase.from('predictions').select('user_id, match_id, points').not('points', 'is', null).in('user_id', memberIds),
    ]
    if (hasRoundPrize(league.prize_type)) {
      queries.push(supabase.from('league_round_payments').select('*').eq('league_id', id))
    }

    const results = await Promise.all(queries)
    const matchData  = results[0].data || []
    const predData   = results[1].data || []
    const paymentsData = results[2]?.data || []

    // Build payment map { `${userId}_${roundLabel}`: paid }
    const paymentsMap = {}
    for (const p of paymentsData) {
      paymentsMap[`${p.user_id}_${p.round_label}`] = p.paid
    }
    setRoundPayments(paymentsMap)

    // Assign rounds
    const withRounds = assignRounds(matchData)

    // Group by round
    const roundsMap = {}
    for (const m of withRounds) {
      if (!m._round) continue
      if (!roundsMap[m._round]) roundsMap[m._round] = { matches: [], order: getRoundOrder(m._round) }
      roundsMap[m._round].matches.push(m)
    }

    // Only completed rounds, sorted most-recent first
    const completedRounds = Object.entries(roundsMap)
      .filter(([, v]) => v.matches.every(m => m.status === 'completed'))
      .sort((a, b) => b[1].order - a[1].order)

    // Per-member points per round
    const predByMatchUser = {}
    for (const p of predData) {
      if (!predByMatchUser[p.match_id]) predByMatchUser[p.match_id] = {}
      predByMatchUser[p.match_id][p.user_id] = p
    }

    const data = completedRounds.map(([round, roundData]) => {
      const memberPoints = memberList.map(m => {
        let pts = 0
        for (const match of roundData.matches) {
          const pred = predByMatchUser[match.id]?.[m.id]
          if (pred) pts += pred.points || 0
        }
        return { id: m.id, username: m.username || 'Anonymous', pts }
      }).sort((a, b) => b.pts - a.pts)

      return { round, order: roundData.order, memberPoints }
    })

    setRoundsData(data)
    setRoundsLoading(false)
  }

  async function copyCode() {
    await navigator.clipboard.writeText(league.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function removeMember(memberId) {
    await supabase.from('league_members').delete().eq('league_id', id).eq('user_id', memberId)
    loadLeague()
  }

  async function togglePaid(memberId, currentPaid) {
    setTogglingPaid(memberId)
    await supabase.from('league_members')
      .update({ paid: !currentPaid })
      .eq('league_id', id).eq('user_id', memberId)
    await loadLeague()
    setTogglingPaid(null)
  }

  async function toggleRoundPaid(memberId, roundLabel, currentPaid) {
    const key = `${memberId}_${roundLabel}`
    setTogglingRoundPaid(key)
    await supabase.from('league_round_payments')
      .upsert(
        { league_id: id, user_id: memberId, round_label: roundLabel, paid: !currentPaid },
        { onConflict: 'league_id,user_id,round_label' }
      )
    setRoundPayments(prev => ({ ...prev, [key]: !currentPaid }))
    setTogglingRoundPaid(null)
  }

  async function leaveLeague() {
    await supabase.from('league_members').delete().eq('league_id', id).eq('user_id', user.id)
    navigate('/leagues')
  }

  async function deleteLeague() {
    await supabase.from('leagues').delete().eq('id', id)
    navigate('/leagues')
  }

  function openSettings() {
    const pt = league.prize_type || 'none'
    setSettingsName(league.name)
    setSettingsTournament(hasTournamentPrize(pt))
    setSettingsPerRound(hasRoundPrize(pt))
    setSettingsError('')
    setEditingSettings(true)
  }

  async function saveSettings() {
    if (settingsName.trim().length < 2) { setSettingsError('Name must be at least 2 characters'); return }
    setSavingSettings(true); setSettingsError('')
    const { error } = await supabase.from('leagues')
      .update({ name: settingsName.trim(), prize_type: toPrizeType(settingsTournament, settingsPerRound) })
      .eq('id', id)
    if (error) { setSettingsError(error.message); setSavingSettings(false); return }
    await loadLeague()
    setSavingSettings(false)
    setEditingSettings(false)
  }

  function handleTabChange(tab) {
    setActiveTab(tab)
    if (tab === 'predictions' && lockedMatches.length === 0 && members.length > 0) {
      loadPredictions(members)
    }
    if (tab === 'rounds' && roundsData.length === 0 && members.length > 0) {
      loadRoundsData(members)
    }
  }

  if (loading) return <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading…</div>
  if (!league) return <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>League not found.</div>

  const isAdmin = league.admin_user_id === user.id
  const totalPoints = members.reduce((sum, m) => sum + (m.total_points || 0), 0)
  const hasPrize = league.prize_type && league.prize_type !== 'none'

  const rankStyle = (i) => {
    if (i === 0) return { bg: '#F5E6B0', color: '#8B6A0A' }
    if (i === 1) return { bg: '#E8E0CC', color: '#5A4F3A' }
    if (i === 2) return { bg: '#F8DFDC', color: '#7A1C12' }
    return { bg: '#E8E0CC', color: 'rgba(13,27,42,0.5)' }
  }

  // Predictions tab data
  const stages = [...new Set(lockedMatches.map(m => m.stage))]
    .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
  const stageMatches = lockedMatches.filter(m => m.stage === activeStage)
  const groups = activeStage === 'group'
    ? [...new Set(stageMatches.map(m => m.group_name).filter(Boolean))].sort()
    : []
  const displayMatches = activeStage === 'group'
    ? stageMatches.filter(m => m.group_name === activeGroup)
    : stageMatches

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate('/leagues')}
        style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to leagues
      </button>

      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 48, width: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 18, color: '#0D1B2A', marginBottom: 2 }}>{league.name}</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>
            {members.length} member{members.length !== 1 ? 's' : ''}
            {hasTournamentPrize(league.prize_type) && (
              <span style={{ marginLeft: 10, fontSize: 11, background: '#F5E6B0', color: '#8B6A0A', borderRadius: 6, padding: '1px 8px', fontWeight: 500 }}>
                Prize — Tournament
              </span>
            )}
            {hasRoundPrize(league.prize_type) && (
              <span style={{ marginLeft: 10, fontSize: 11, background: '#F5E6B0', color: '#8B6A0A', borderRadius: 6, padding: '1px 8px', fontWeight: 500 }}>
                Prize — Per Round
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Header card */}
      <div className="card mb-5">
        <div className="flex items-start justify-between gap-4">
          <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>League total points</div>
          <div className="text-right">
            <div style={{ fontSize: 28, fontWeight: 500, color: '#D4A017' }}>{totalPoints}</div>
            <div style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 500 }}>total league pts</div>
          </div>
        </div>

        {/* Invite code */}
        <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid rgba(13,27,42,0.1)' }}>
          <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)', fontWeight: 500, marginBottom: 8 }}>
            Invite code — share with friends
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 500, letterSpacing: '0.15em',
              background: '#E8E0CC', color: '#0D1B2A', padding: '8px 16px', borderRadius: 8 }}>
              {league.invite_code}
            </span>
            <button onClick={copyCode} className="btn-secondary" style={{ padding: '7px 14px', fontSize: 13 }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Settings panel — admin only */}
      {isAdmin && (
        <div className="mb-5">
          {editingSettings ? (
            <div className="card" style={{ border: '1.5px solid rgba(13,27,42,0.15)' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#0D1B2A', marginBottom: 16 }}>League settings</div>

              {/* Name */}
              <div style={{ marginBottom: 16 }}>
                <label className="label">League name</label>
                <input
                  type="text" className="input" maxLength={60}
                  value={settingsName} onChange={e => setSettingsName(e.target.value)}
                />
              </div>

              {/* Prize type */}
              <div style={{ marginBottom: 16 }}>
                <label className="label" style={{ marginBottom: 8 }}>Prize money</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { key: 'tournament', checked: settingsTournament, onChange: setSettingsTournament,
                      title: 'Prize money — whole tournament', desc: 'One-off entry fee; Paid/Unpaid per member shown on Standings.' },
                    { key: 'per_round', checked: settingsPerRound, onChange: setSettingsPerRound,
                      title: 'Prize money — per round', desc: 'Separate fee per round; Paid/Unpaid tracked in the Round winners tab.' },
                  ].map(opt => (
                    <div key={opt.key} onClick={() => opt.onChange(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                        padding: '10px 12px', borderRadius: 8,
                        border: `1.5px solid ${opt.checked ? 'rgba(212,160,23,0.6)' : 'rgba(13,27,42,0.1)'}`,
                        background: opt.checked ? '#FFFDF4' : 'white', transition: 'all 0.15s',
                      }}>
                      <div style={{
                        flexShrink: 0, marginTop: 2,
                        width: 16, height: 16, borderRadius: 4,
                        border: `2px solid ${opt.checked ? '#D4A017' : 'rgba(13,27,42,0.25)'}`,
                        background: opt.checked ? '#D4A017' : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {opt.checked && <span style={{ color: 'white', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A' }}>{opt.title}</div>
                        <div style={{ fontSize: 12, color: 'rgba(13,27,42,0.5)', marginTop: 1 }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {(settingsTournament || settingsPerRound) && (
                  <div style={{ fontSize: 12, color: '#8B6A0A', background: '#F5E6B0', borderRadius: 6, padding: '5px 10px', marginTop: 8 }}>
                    This app does not handle or hold any money — fees are managed between members directly.
                  </div>
                )}
              </div>

              {settingsError && <p style={{ fontSize: 13, color: '#C0392B', marginBottom: 12 }}>{settingsError}</p>}

              <div className="flex gap-2">
                <button onClick={saveSettings} disabled={savingSettings} className="btn-primary" style={{ fontSize: 13 }}>
                  {savingSettings ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={() => setEditingSettings(false)} className="btn-secondary" style={{ fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openSettings} className="btn-secondary" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>⚙</span> Edit league settings
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { key: 'standings',   label: 'Standings' },
          { key: 'rounds',      label: 'Round winners' },
          { key: 'predictions', label: 'Predictions' },
          { key: 'chat',        label: '💬 Chat' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => handleTabChange(key)}
            style={{
              padding: '6px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, flexShrink: 0,
              background: activeTab === key ? '#0D1B2A' : '#E8E0CC',
              color: activeTab === key ? 'white' : 'rgba(13,27,42,0.65)',
              transition: 'all 0.15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Ad banner */}
      <AdBanner slot="1122334455" size="responsive" style={{ marginBottom: 20 }} />

      {/* ── STANDINGS TAB ── */}
      {activeTab === 'standings' && (
        <>
          {/* When both prize types active, remind admin round payments are in Rounds tab */}
          {league.prize_type === 'both' && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              background: '#FFFDF4', border: '1px solid rgba(212,160,23,0.3)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              fontSize: 13, color: '#8B6A0A',
            }}>
              <span>Round-by-round payments are tracked separately.</span>
              <button
                onClick={() => handleTabChange('rounds')}
                style={{
                  fontSize: 12, fontWeight: 600, flexShrink: 0,
                  background: '#D4A017', color: 'white',
                  border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                }}
              >
                View round payments
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {members.map((member, i) => {
              const isMe = member.id === user.id
              const rs = rankStyle(i)
              return (
                <div key={member.id} className="card flex items-center gap-3"
                  style={isMe ? { border: '1.5px solid #1A6B3A' } : {}}>
                  <div className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 32, height: 32, background: rs.bg, color: rs.color,
                      fontSize: 13, fontWeight: 500, borderRadius: 8 }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span style={{ fontSize: 14, fontWeight: 500, color: isMe ? '#1A6B3A' : '#0D1B2A' }}>
                      {member.username || 'Anonymous'}
                      {isMe && <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.4)', marginLeft: 6 }}>(you)</span>}
                      {member.id === league.admin_user_id && (
                        <span className="badge badge-group" style={{ marginLeft: 6 }}>admin</span>
                      )}
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: '#0D1B2A' }}>
                    {member.total_points ?? 0}
                    <span style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 400, marginLeft: 3 }}>pts</span>
                  </div>
                  {/* Paid status — tournament prize only (per_round tracked in Round winners tab) */}
                  {hasTournamentPrize(league.prize_type) && isAdmin ? (
                    <button
                      onClick={() => togglePaid(member.id, member.paid)}
                      disabled={togglingPaid === member.id}
                      style={{
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                        border: 'none', borderRadius: 6, padding: '3px 8px',
                        background: member.paid ? '#D6EFE0' : '#F8DFDC',
                        color: member.paid ? '#0D3D20' : '#7A1C12',
                        opacity: togglingPaid === member.id ? 0.5 : 1,
                      }}
                      title="Toggle paid status"
                    >
                      {member.paid ? 'Paid' : 'Unpaid'}
                    </button>
                  ) : hasTournamentPrize(league.prize_type) ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                      borderRadius: 6, padding: '3px 8px',
                      background: member.paid ? '#D6EFE0' : '#F8DFDC',
                      color: member.paid ? '#0D3D20' : '#7A1C12',
                    }}>
                      {member.paid ? 'Paid' : 'Unpaid'}
                    </span>
                  ) : null}
                  {isAdmin && !isMe && (
                    <button onClick={() => removeMember(member.id)}
                      style={{ fontSize: 12, color: 'rgba(13,27,42,0.3)', marginLeft: 4, cursor: 'pointer' }}
                      title="Remove member">✕</button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Danger zone */}
          <div style={{ borderTop: '0.5px solid rgba(13,27,42,0.1)', paddingTop: 16 }} className="flex gap-3">
            {!isAdmin && (
              confirmLeave ? (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)' }}>Sure?</span>
                  <button onClick={leaveLeague} className="btn-danger">Leave</button>
                  <button onClick={() => setConfirmLeave(false)} className="btn-secondary">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmLeave(true)} className="btn-secondary">Leave league</button>
              )
            )}
            {isAdmin && (
              confirmDelete ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)' }}>Delete "{league.name}"? Can't be undone.</span>
                  <button onClick={deleteLeague} className="btn-danger">Delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="btn-secondary">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="btn-danger">Delete league</button>
              )
            )}
          </div>
        </>
      )}

      {/* ── ROUND WINNERS TAB ── */}
      {activeTab === 'rounds' && (
        roundsLoading ? (
          <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading round data…</div>
        ) : roundsData.length === 0 ? (
          <div className="card text-center py-10">
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏅</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#0D1B2A', marginBottom: 4 }}>
              No completed rounds yet
            </div>
            <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>
              Round winners will appear here as matches are completed.
            </div>
          </div>
        ) : (
          <>
            {hasRoundPrize(league.prize_type) && (
              <div style={{
                fontSize: 12, color: '#8B6A0A', background: '#F5E6B0',
                borderRadius: 8, padding: '8px 14px', marginBottom: 16,
                border: '1px solid rgba(212,160,23,0.3)',
              }}>
                Prize money is tracked per round. {isAdmin ? 'Click Paid/Unpaid to update each member\'s status.' : 'Your admin will mark you as paid for each round.'}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {roundsData.map(({ round, memberPoints }, ri) => {
                const maxPts = Math.max(...memberPoints.map(m => m.pts), 0)
                const winners = memberPoints.filter(m => m.pts === maxPts && maxPts > 0)
                const isFirstRound = ri === 0

                return (
                  <div key={round} className="card" style={{
                    padding: 0, overflow: 'hidden',
                    border: isFirstRound ? '2px solid rgba(212,160,23,0.5)' : '1px solid rgba(13,27,42,0.08)',
                  }}>
                    {/* Round header */}
                    <div style={{
                      background: isFirstRound ? 'linear-gradient(135deg, #8B6A0A 0%, #D4A017 100%)' : '#0D1B2A',
                      color: 'white', padding: '10px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{round}</div>
                        {isFirstRound && (
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>Most recent round</div>
                        )}
                      </div>
                      {winners.length > 0 && (
                        <div style={{ fontSize: 12, color: isFirstRound ? '#FDF3D0' : 'rgba(255,255,255,0.75)', textAlign: 'right' }}>
                          <span style={{ fontSize: 14 }}>🏆</span>{' '}
                          {winners.map(w => w.username).join(' & ')}
                          <span style={{
                            display: 'inline-block', marginLeft: 6,
                            background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '0px 6px', fontSize: 11,
                          }}>
                            {maxPts} pts
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Member rows */}
                    {memberPoints.map((mp, i) => {
                      const isWinner = mp.pts === maxPts && maxPts > 0
                      const isMe = mp.id === user.id
                      const payKey = `${mp.id}_${round}`
                      const isPaid = roundPayments[payKey] ?? false
                      const isToggling = togglingRoundPaid === payKey

                      return (
                        <div key={mp.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 16px',
                          borderBottom: i < memberPoints.length - 1 ? '0.5px solid rgba(13,27,42,0.06)' : 'none',
                          background: isWinner ? 'rgba(212,160,23,0.06)' : isMe ? 'rgba(26,107,58,0.03)' : 'white',
                        }}>
                          <span style={{ fontSize: 12, minWidth: 20, color: 'rgba(13,27,42,0.35)', fontWeight: 500 }}>
                            #{i + 1}
                          </span>
                          {isWinner && <span style={{ fontSize: 14, lineHeight: 1 }}>🏆</span>}
                          <span style={{
                            flex: 1, fontSize: 14, fontWeight: isMe ? 500 : 400,
                            color: isMe ? '#1A6B3A' : isWinner ? '#8B6A0A' : '#0D1B2A',
                            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {mp.username}
                            {isMe && <span style={{ fontSize: 11, color: 'rgba(13,27,42,0.4)', marginLeft: 5 }}>(you)</span>}
                          </span>
                          <span style={{
                            fontSize: 14, fontWeight: isWinner ? 600 : 400,
                            color: isWinner ? '#D4A017' : 'rgba(13,27,42,0.5)',
                            flexShrink: 0,
                          }}>
                            {mp.pts}
                            <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>pts</span>
                          </span>
                          {/* Per-round payment tracking */}
                          {hasRoundPrize(league.prize_type) && (
                            isAdmin ? (
                              <button
                                onClick={() => toggleRoundPaid(mp.id, round, isPaid)}
                                disabled={isToggling}
                                style={{
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                                  border: 'none', borderRadius: 6, padding: '3px 8px',
                                  background: isPaid ? '#D6EFE0' : '#F8DFDC',
                                  color: isPaid ? '#0D3D20' : '#7A1C12',
                                  opacity: isToggling ? 0.5 : 1,
                                }}
                              >
                                {isPaid ? 'Paid' : 'Unpaid'}
                              </button>
                            ) : (
                              <span style={{
                                fontSize: 11, fontWeight: 600, flexShrink: 0,
                                borderRadius: 6, padding: '3px 8px',
                                background: isPaid ? '#D6EFE0' : '#F8DFDC',
                                color: isPaid ? '#0D3D20' : '#7A1C12',
                              }}>
                                {isPaid ? 'Paid' : 'Unpaid'}
                              </span>
                            )
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </>
        )
      )}

      {/* ── CHAT TAB ── */}
      {activeTab === 'chat' && (
        <div className="card" style={{ padding: 16 }}>
          <LeagueChat leagueId={id} members={members} />
        </div>
      )}

      {/* ── PREDICTIONS TAB ── */}
      {activeTab === 'predictions' && (
        <>
          {predsLoading ? (
            <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading predictions…</div>
          ) : lockedMatches.length === 0 ? (
            <div className="card text-center py-10">
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#0D1B2A', marginBottom: 4 }}>
                No predictions visible yet
              </div>
              <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>
                League members' picks will appear here once a match kicks off.
              </div>
            </div>
          ) : (
            <>
              {/* Stage tabs */}
              {stages.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
                  {stages.map(stage => (
                    <button key={stage} onClick={() => { setActiveStage(stage); setActiveGroup('A') }}
                      className="flex-shrink-0 whitespace-nowrap"
                      style={{
                        padding: '5px 12px', fontSize: 13, fontWeight: 500, borderRadius: 20,
                        background: activeStage === stage ? '#0D1B2A' : '#E8E0CC',
                        color: activeStage === stage ? 'white' : 'rgba(13,27,42,0.65)',
                      }}>
                      {STAGE_LABELS[stage] || stage}
                    </button>
                  ))}
                </div>
              )}

              {/* Group tabs */}
              {activeStage === 'group' && groups.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
                  {groups.map(g => (
                    <button key={g} onClick={() => setActiveGroup(g)}
                      style={{
                        width: 36, height: 36, fontSize: 13, fontWeight: 500, borderRadius: 20,
                        background: activeGroup === g ? '#1A6B3A' : '#E8E0CC',
                        color: activeGroup === g ? 'white' : 'rgba(13,27,42,0.65)',
                        flexShrink: 0,
                      }}>
                      {g}
                    </button>
                  ))}
                </div>
              )}

              {displayMatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(13,27,42,0.4)', fontSize: 13 }}>
                  No kicked-off matches in this group yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {displayMatches.map(match => (
                    <PredictionMatchCard
                      key={match.id}
                      match={match}
                      members={members}
                      predsForMatch={allPreds[match.id] || {}}
                      currentUserId={user.id}
                      expanded={expandedMatch === match.id}
                      onToggle={() => setExpandedMatch(expandedMatch === match.id ? null : match.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function PredictionMatchCard({ match, members, predsForMatch, currentUserId, expanded, onToggle }) {
  const isCompleted = match.status === 'completed'
  const isKnockout  = KNOCKOUT_STAGES.includes(match.stage)
  const matchDate   = match.match_date
    ? new Date(match.match_date).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'Date TBC'

  const predCount = Object.keys(predsForMatch).length

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button onClick={onToggle} className="w-full text-left" style={{ padding: 0 }}>
        <div className="score-card" style={{ borderRadius: 0, padding: '10px 14px' }}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Flag teamName={match.home_team?.name} size="sm" />
              <span className="truncate" style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                {match.home_team?.name || 'TBD'}
              </span>
            </div>
            <div className="flex-shrink-0 text-center px-2">
              {isCompleted ? (
                <span style={{ fontSize: 16, fontWeight: 500, color: '#F5E6B0' }}>
                  {match.home_score} – {match.away_score}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>vs</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="truncate text-right" style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                {match.away_team?.name || 'TBD'}
              </span>
              <Flag teamName={match.away_team?.name} size="sm" />
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 6, flexShrink: 0 }}>
              {expanded ? '▲' : '▼'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2" style={{ fontSize: 12, color: 'rgba(13,27,42,0.45)' }}>
          <span>{matchDate}</span>
          {match.group_name && <span>Group {match.group_name}</span>}
          <span style={{
            background: isCompleted ? '#E8E0CC' : '#D6EFE0',
            color: isCompleted ? '#5A4F3A' : '#0D3D20',
            borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 500,
          }}>
            {isCompleted ? 'Final' : 'Live'}
          </span>
          <span style={{ marginLeft: 'auto', color: 'rgba(13,27,42,0.35)' }}>
            {predCount}/{members.length} predicted
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: '0.5px solid rgba(13,27,42,0.08)' }}>
          {members.map((member, i) => {
            const pred = predsForMatch[member.id]
            const isMe = member.id === currentUserId
            return (
              <div key={member.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 16px',
                  borderBottom: i < members.length - 1 ? '0.5px solid rgba(13,27,42,0.06)' : 'none',
                  background: isMe ? 'rgba(26,107,58,0.04)' : 'white',
                }}>
                <span style={{
                  fontSize: 11, fontWeight: 500, minWidth: 24,
                  color: i === 0 ? '#8B6A0A' : i === 1 ? '#5A4F3A' : i === 2 ? '#7A1C12' : 'rgba(13,27,42,0.35)',
                }}>
                  #{i+1}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: isMe ? 500 : 400,
                  color: isMe ? '#1A6B3A' : '#0D1B2A', minWidth: 0 }} className="truncate">
                  {member.username || 'Anonymous'}
                  {isMe && <span style={{ fontSize: 11, color: 'rgba(13,27,42,0.4)', marginLeft: 5 }}>(you)</span>}
                </span>
                {pred ? (
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A', letterSpacing: '0.02em' }}>
                      {pred.predicted_home_score} – {pred.predicted_away_score}
                    </span>
                    {isKnockout && pred.penalty_winner_id && (
                      <span style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)' }}>
                        ({pred.penalty_winner_id === match.home_team_id
                          ? match.home_team?.name
                          : match.away_team?.name} pens)
                      </span>
                    )}
                    {pred.points != null && (
                      <span style={{
                        fontSize: 11, fontWeight: 500,
                        color: pred.points > 0 ? '#0D3D20' : 'rgba(13,27,42,0.4)',
                        background: pred.points > 0 ? '#D6EFE0' : '#E8E0CC',
                        borderRadius: 6, padding: '1px 7px',
                      }}>
                        {pred.points}pts
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.3)', fontStyle: 'italic' }}>
                    No prediction
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
