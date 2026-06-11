import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Flag from './Flag'
import {
  GROUPS, R32_FIXED_SLOTS, KNOCKOUT_STAGES, STAGE_LABELS,
  BRACKET_POINTS, buildR32Matchups, resolveSlot,
} from '../lib/bracket'

const POSITIONS = [1, 2, 3, 4]
const POS_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
const POS_COLORS = {
  1: { bg: '#F5E6B0', color: '#8B6A0A' },
  2: { bg: '#E8E0CC', color: '#5A4F3A' },
  3: { bg: '#F8DFDC', color: '#7A1C12' },
  4: { bg: '#F0EDE8', color: 'rgba(13,27,42,0.4)' },
}

export default function BracketPicker({ leagueId, isReadOnly = false, viewUserId = null }) {
  const { user } = useAuth()
  const targetUserId = viewUserId || user.id

  const [teams, setTeams]             = useState({}) // { [group]: [teamObj, ...] }
  const [groupPicks, setGroupPicks]   = useState({}) // { [group]: { 1: teamObj, ... } }
  const [knockoutPicks, setKnockoutPicks] = useState({}) // { 'round_of_32-0': teamId, ... }
  const [thirdPicks, setThirdPicks]   = useState([]) // array of teamId (8 selected 3rd-place teams)
  const [tab, setTab]                 = useState('groups')
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [loading, setLoading]         = useState(true)

  useEffect(() => { loadData() }, [leagueId, targetUserId])

  async function loadData() {
    setLoading(true)
    const [{ data: teamData }, { data: groupPickData }, { data: knockoutPickData }] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('bracket_group_picks')
        .select('*, team:teams(*)').eq('league_id', leagueId).eq('user_id', targetUserId),
      supabase.from('bracket_knockout_picks')
        .select('*, team:teams(*)').eq('league_id', leagueId).eq('user_id', targetUserId),
    ])

    // Group teams by group_name
    const byGroup = {}
    for (const t of teamData || []) {
      if (!t.group_name) continue
      if (!byGroup[t.group_name]) byGroup[t.group_name] = []
      byGroup[t.group_name].push(t)
    }
    setTeams(byGroup)

    // Rebuild groupPicks map { group: { pos: teamObj } }
    const gp = {}
    for (const p of groupPickData || []) {
      if (!gp[p.group_name]) gp[p.group_name] = {}
      gp[p.group_name][p.predicted_position] = p.team
    }
    setGroupPicks(gp)

    // Rebuild knockoutPicks map { 'stage-slot': teamId }
    const kp = {}
    const tp = []
    for (const p of knockoutPickData || []) {
      kp[`${p.stage}-${p.match_slot}`] = p.predicted_winner_team_id
      // Slots 12-19 in round_of_32 are third-place picks
      if (p.stage === 'round_of_32' && p.match_slot >= 12) {
        if (p.predicted_winner_team_id) tp.push(p.predicted_winner_team_id)
      }
    }
    setKnockoutPicks(kp)
    setThirdPicks(tp)
    setLoading(false)
  }

  // ── Group ordering ─────────────────────────────────────────────────────────
  function moveTeam(group, teamId, direction) {
    const current = { ...(groupPicks[group] || {}) }
    const posMap = {}
    for (const [pos, team] of Object.entries(current)) {
      posMap[team.id] = parseInt(pos)
    }
    const currentPos = posMap[teamId]
    if (!currentPos) return
    const targetPos = currentPos + direction
    if (targetPos < 1 || targetPos > 4) return

    // Find team at target position
    const swapTeam = Object.entries(current).find(([p]) => parseInt(p) === targetPos)
    const newPicks = { ...current }
    const movingTeam = current[currentPos]
    if (swapTeam) newPicks[targetPos] = swapTeam[1]
    else delete newPicks[targetPos]
    newPicks[currentPos] = swapTeam ? swapTeam[1] : undefined
    if (!swapTeam) delete newPicks[currentPos]
    newPicks[targetPos] = movingTeam
    setGroupPicks(prev => ({ ...prev, [group]: newPicks }))

    // Cascade: invalidate knockout picks that depended on this group
    invalidateKnockoutForGroup(group)
  }

  function assignTeamToPosition(group, pos, team) {
    setGroupPicks(prev => {
      const current = { ...(prev[group] || {}) }
      // Remove team from its current position if it has one
      for (const [p, t] of Object.entries(current)) {
        if (t.id === team.id) delete current[p]
      }
      // If another team is already at this position, remove it
      // (it becomes unassigned — user must drag it elsewhere)
      current[pos] = team
      invalidateKnockoutForGroup(group)
      return { ...prev, [group]: current }
    })
  }

  function invalidateKnockoutForGroup(group) {
    setKnockoutPicks(prev => {
      const next = { ...prev }
      // Remove any R32 picks where this group's team was involved
      for (const slot of R32_FIXED_SLOTS) {
        if (slot.home.endsWith(group) || slot.away.endsWith(group)) {
          delete next[`round_of_32-${slot.slot}`]
        }
      }
      // Remove all subsequent rounds too (they depend on R32)
      for (const stage of ['round_of_16', 'quarter_final', 'semi_final', 'final']) {
        for (const key of Object.keys(next)) {
          if (key.startsWith(stage)) delete next[key]
        }
      }
      return next
    })
  }

  // ── Knockout picks ─────────────────────────────────────────────────────────
  function pickKnockoutWinner(stage, slot, teamId) {
    if (isReadOnly) return
    const key = `${stage}-${slot}`
    setKnockoutPicks(prev => {
      const next = { ...prev, [key]: teamId }
      // Invalidate downstream picks
      const stageIdx = KNOCKOUT_STAGES.indexOf(stage)
      const nextStage = KNOCKOUT_STAGES[stageIdx + 1]
      if (nextStage) {
        const nextSlot = Math.floor(slot / 2)
        const nextKey = `${nextStage}-${nextSlot}`
        if (next[nextKey]) {
          delete next[nextKey]
          // Cascade further
          cascadeDelete(next, stageIdx + 1, nextSlot)
        }
      }
      return next
    })
  }

  function cascadeDelete(picks, stageIdx, slot) {
    const nextStage = KNOCKOUT_STAGES[stageIdx + 1]
    if (!nextStage) return
    const nextSlot = Math.floor(slot / 2)
    const nextKey = `${nextStage}-${nextSlot}`
    if (picks[nextKey]) {
      delete picks[nextKey]
      cascadeDelete(picks, stageIdx + 1, nextSlot)
    }
  }

  // Get the team for a given knockout stage/slot (from picks or resolved from previous round)
  function getKnockoutTeam(stage, slot) {
    const teamId = knockoutPicks[`${stage}-${slot}`]
    if (!teamId) return null
    return findTeamById(teamId)
  }

  // Get available teams for a given knockout slot (the two teams that could play)
  function getSlotCandidates(stage, slot) {
    const stageIdx = KNOCKOUT_STAGES.indexOf(stage)
    if (stageIdx === 0) {
      // R32 — get from fixed slots or third-place picks
      const fixedSlot = R32_FIXED_SLOTS.find(s => s.slot === slot)
      if (fixedSlot) {
        return [
          resolveSlot(fixedSlot.home, groupPicks),
          resolveSlot(fixedSlot.away, groupPicks),
        ].filter(Boolean)
      }
      // Third-place slot
      const tpIdx = slot - 12
      return thirdPicks[tpIdx] ? [findTeamById(thirdPicks[tpIdx])] : []
    }
    // Subsequent rounds: candidates are winners of previous round
    const prevStage = KNOCKOUT_STAGES[stageIdx - 1]
    return [
      getKnockoutTeam(prevStage, slot * 2),
      getKnockoutTeam(prevStage, slot * 2 + 1),
    ].filter(Boolean)
  }

  function findTeamById(id) {
    for (const group of Object.values(teams)) {
      const t = group.find(t => t.id === id)
      if (t) return t
    }
    return null
  }

  // ── Third-place picks ──────────────────────────────────────────────────────
  function toggleThirdPick(teamId) {
    if (isReadOnly) return
    setThirdPicks(prev => {
      if (prev.includes(teamId)) return prev.filter(id => id !== teamId)
      if (prev.length >= 8) return prev
      return [...prev, teamId]
    })
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)

    // Build group picks upsert payload
    const groupRows = []
    for (const group of GROUPS) {
      const picks = groupPicks[group] || {}
      for (const [pos, team] of Object.entries(picks)) {
        if (team) groupRows.push({
          user_id: user.id, league_id: leagueId,
          group_name: group, team_id: team.id,
          predicted_position: parseInt(pos),
          updated_at: new Date().toISOString(),
        })
      }
    }

    // Build knockout picks upsert payload
    const knockoutRows = []
    for (const [key, teamId] of Object.entries(knockoutPicks)) {
      if (!teamId) continue
      const [stage, slot] = key.split('-')
      knockoutRows.push({
        user_id: user.id, league_id: leagueId,
        stage, match_slot: parseInt(slot),
        predicted_winner_team_id: teamId,
        updated_at: new Date().toISOString(),
      })
    }
    // Add third-place picks as round_of_32 slots 12-19
    thirdPicks.forEach((teamId, idx) => {
      knockoutRows.push({
        user_id: user.id, league_id: leagueId,
        stage: 'round_of_32', match_slot: 12 + idx,
        predicted_winner_team_id: teamId,
        updated_at: new Date().toISOString(),
      })
    })

    // Delete existing then re-insert
    await Promise.all([
      supabase.from('bracket_group_picks').delete().eq('league_id', leagueId).eq('user_id', user.id),
      supabase.from('bracket_knockout_picks').delete().eq('league_id', leagueId).eq('user_id', user.id),
    ])
    await Promise.all([
      groupRows.length ? supabase.from('bracket_group_picks').insert(groupRows) : Promise.resolve(),
      knockoutRows.length ? supabase.from('bracket_knockout_picks').insert(knockoutRows) : Promise.resolve(),
    ])

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── Progress tracking ──────────────────────────────────────────────────────
  const groupsComplete = GROUPS.filter(g => Object.keys(groupPicks[g] || {}).length === 4).length
  const r32Complete = R32_FIXED_SLOTS.filter(s => knockoutPicks[`round_of_32-${s.slot}`]).length
  const thirdComplete = thirdPicks.length

  if (loading) return <div className="text-center py-10" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading bracket…</div>

  return (
    <div>
      {/* Progress summary */}
      <div className="card mb-5" style={{ padding: '12px 16px', background: '#F5F3EE', border: '1px solid rgba(13,27,42,0.08)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(13,27,42,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          How points work
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <ScoreRule pts={2} label="Correct group position (any place)" />
          <ScoreRule pts={5} label="Correct knockout stage winner (any round)" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { key: 'groups',   label: `Groups (${groupsComplete}/12)` },
          { key: 'third',    label: `3rd Place (${thirdComplete}/8)` },
          { key: 'knockout', label: `Knockout (${r32Complete}/12)` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '6px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, flexShrink: 0,
              background: tab === t.key ? '#0D1B2A' : '#E8E0CC',
              color: tab === t.key ? 'white' : 'rgba(13,27,42,0.65)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Groups tab */}
      {tab === 'groups' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {GROUPS.map(group => (
            <GroupOrderPicker
              key={group}
              group={group}
              teams={teams[group] || []}
              picks={groupPicks[group] || {}}
              onAssign={(pos, team) => assignTeamToPosition(group, pos, team)}
              onMove={(teamId, dir) => moveTeam(group, teamId, dir)}
              isReadOnly={isReadOnly}
            />
          ))}
        </div>
      )}

      {/* Third-place tab */}
      {tab === 'third' && (
        <div>
          <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)', marginBottom: 16, lineHeight: 1.6 }}>
            Pick the <strong>8 best 3rd-place teams</strong> you think will qualify from the group stage.
            {!isReadOnly && <span> Select exactly 8.</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {GROUPS.map(group => {
              const team = groupPicks[group]?.[3]
              if (!team) return (
                <div key={group} style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: '#F5F3EE', color: 'rgba(13,27,42,0.4)',
                  border: '1px solid rgba(13,27,42,0.08)',
                }}>
                  Group {group} — pick your group order first
                </div>
              )
              const selected = thirdPicks.includes(team.id)
              return (
                <button key={group} onClick={() => toggleThirdPick(team.id)}
                  disabled={isReadOnly || (!selected && thirdPicks.length >= 8)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                    border: `1.5px solid ${selected ? 'rgba(26,107,58,0.5)' : 'rgba(13,27,42,0.1)'}`,
                    background: selected ? 'rgba(26,107,58,0.07)' : 'white',
                    cursor: isReadOnly ? 'default' : ((!selected && thirdPicks.length >= 8) ? 'not-allowed' : 'pointer'),
                    opacity: (!selected && thirdPicks.length >= 8 && !isReadOnly) ? 0.4 : 1,
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${selected ? '#1A6B3A' : 'rgba(13,27,42,0.2)'}`,
                    background: selected ? '#1A6B3A' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <Flag teamName={team.name} size="sm" />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A' }}>{team.name}</span>
                  <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.4)', marginLeft: 2 }}>3rd in Group {group}</span>
                </button>
              )
            })}
          </div>
          {!isReadOnly && (
            <div style={{ fontSize: 12, color: thirdPicks.length === 8 ? '#1A6B3A' : 'rgba(13,27,42,0.4)', marginTop: 12, fontWeight: 500 }}>
              {thirdPicks.length}/8 selected{thirdPicks.length === 8 ? ' ✓' : ''}
            </div>
          )}
        </div>
      )}

      {/* Knockout tab */}
      {tab === 'knockout' && (
        <KnockoutBracket
          groupPicks={groupPicks}
          knockoutPicks={knockoutPicks}
          thirdPicks={thirdPicks}
          getSlotCandidates={getSlotCandidates}
          getKnockoutTeam={getKnockoutTeam}
          pickKnockoutWinner={pickKnockoutWinner}
          findTeamById={findTeamById}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Save button */}
      {!isReadOnly && (
        <div className="mt-6 pt-4" style={{ borderTop: '0.5px solid rgba(13,27,42,0.1)' }}>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ minWidth: 140 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save bracket'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Group order picker ────────────────────────────────────────────────────────
function GroupOrderPicker({ group, teams, picks, onAssign, onMove, isReadOnly }) {
  const [dragging, setDragging] = useState(null)

  const positionedTeams = POSITIONS.map(pos => ({ pos, team: picks[pos] ?? null }))
  const unassigned = teams.filter(t => !Object.values(picks).find(p => p?.id === t.id))
  const complete = Object.keys(picks).length === 4

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: complete ? '#1A6B3A' : '#0D1B2A', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>
          {group}
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A' }}>Group {group}</span>
        {complete && <span style={{ fontSize: 11, color: '#1A6B3A', fontWeight: 600 }}>✓ Complete</span>}
      </div>

      {/* Position slots */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: unassigned.length ? 12 : 0 }}>
        {positionedTeams.map(({ pos, team }) => {
          const { bg, color } = POS_COLORS[pos]
          return (
            <div
              key={pos}
              onDragOver={isReadOnly ? undefined : e => e.preventDefault()}
              onDrop={isReadOnly ? undefined : e => {
                e.preventDefault()
                const teamId = e.dataTransfer.getData('teamId')
                const t = teams.find(t => t.id === teamId)
                if (t) onAssign(pos, t)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                background: team ? bg : 'rgba(13,27,42,0.03)',
                border: `1px solid ${team ? 'transparent' : 'rgba(13,27,42,0.08)'}`,
                minHeight: 38,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>
                {POS_LABELS[pos]}
              </span>
              {team ? (
                <>
                  <Flag teamName={team.name} size="sm" />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A', flex: 1 }}>{team.name}</span>
                  {!isReadOnly && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => onMove(team.id, -1)} disabled={pos === 1}
                        style={{ fontSize: 12, padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(13,27,42,0.15)', background: 'white', cursor: pos === 1 ? 'not-allowed' : 'pointer', opacity: pos === 1 ? 0.3 : 1 }}>↑</button>
                      <button onClick={() => onMove(team.id, 1)} disabled={pos === 4}
                        style={{ fontSize: 12, padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(13,27,42,0.15)', background: 'white', cursor: pos === 4 ? 'not-allowed' : 'pointer', opacity: pos === 4 ? 0.3 : 1 }}>↓</button>
                    </div>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.3)', fontStyle: 'italic' }}>
                  {isReadOnly ? 'No pick' : 'Drop team here or use ↑↓ below'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Unassigned teams */}
      {!isReadOnly && unassigned.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {unassigned.map(team => (
            <div
              key={team.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData('teamId', team.id); setDragging(team.id) }}
              onDragEnd={() => setDragging(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8, cursor: 'grab',
                background: dragging === team.id ? '#E8E0CC' : '#F5F3EE',
                border: '1px solid rgba(13,27,42,0.1)',
                fontSize: 12, fontWeight: 500, color: '#0D1B2A',
              }}
            >
              <Flag teamName={team.name} size="sm" />
              {team.name}
            </div>
          ))}
          <div style={{ width: '100%', fontSize: 11, color: 'rgba(13,27,42,0.35)', marginTop: 2 }}>
            Drag teams into position slots, or use the ↑↓ buttons once placed
          </div>
        </div>
      )}
    </div>
  )
}

// ── Knockout bracket ──────────────────────────────────────────────────────────
function KnockoutBracket({ groupPicks, knockoutPicks, thirdPicks, getSlotCandidates, getKnockoutTeam, pickKnockoutWinner, findTeamById, isReadOnly }) {
  const [activeStage, setActiveStage] = useState('round_of_32')

  const stageSlotCounts = {
    round_of_32:   16, // 12 fixed + we show only 12 for 1st/2nd picks; thirdPicks handled separately
    round_of_16:   8,
    quarter_final: 4,
    semi_final:    2,
    final:         1,
  }

  // For R32 we only show the 12 fixed slots (1st/2nd matchups) — third-place picks set separately
  const slotsForStage = (stage) => {
    if (stage === 'round_of_32') return Array.from({ length: 12 }, (_, i) => i)
    const count = stageSlotCounts[stage]
    return Array.from({ length: count }, (_, i) => i)
  }

  return (
    <div>
      {/* Stage tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5">
        {KNOCKOUT_STAGES.map(stage => (
          <button key={stage} onClick={() => setActiveStage(stage)}
            style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 20, flexShrink: 0,
              background: activeStage === stage ? '#0D1B2A' : '#E8E0CC',
              color: activeStage === stage ? 'white' : 'rgba(13,27,42,0.65)',
            }}>
            {STAGE_LABELS[stage]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slotsForStage(activeStage).map(slot => {
          const candidates = getSlotCandidates(activeStage, slot)
          const picked = knockoutPicks[`${activeStage}-${slot}`]
          const pickedTeam = picked ? findTeamById(picked) : null
          const fixedSlot = R32_FIXED_SLOTS.find(s => s.slot === slot)
          const slotLabel = fixedSlot ? `${fixedSlot.home} vs ${fixedSlot.away}` : `Match ${slot + 1}`

          return (
            <div key={slot} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,42,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {STAGE_LABELS[activeStage]} — {slotLabel}
              </div>

              {candidates.length === 0 ? (
                <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.35)', fontStyle: 'italic' }}>
                  {activeStage === 'round_of_32'
                    ? 'Set your group picks first'
                    : 'Pick previous round winners first'}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {candidates.map(team => {
                    const isPicked = picked === team.id
                    return (
                      <button
                        key={team.id}
                        onClick={() => !isReadOnly && pickKnockoutWinner(activeStage, slot, team.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 14px', borderRadius: 10, cursor: isReadOnly ? 'default' : 'pointer',
                          border: `1.5px solid ${isPicked ? '#1A6B3A' : 'rgba(13,27,42,0.12)'}`,
                          background: isPicked ? '#D6EFE0' : 'white',
                          fontSize: 13, fontWeight: isPicked ? 600 : 400,
                          color: isPicked ? '#0D3D20' : '#0D1B2A',
                          transition: 'all 0.15s',
                        }}>
                        <Flag teamName={team.name} size="sm" />
                        {team.name}
                        {isPicked && <span style={{ fontSize: 11 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoreRule({ pts, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: 'center',
        background: '#D6EFE0', color: '#0D3D20', borderRadius: 5, padding: '1px 6px',
      }}>+{pts}</span>
      <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.65)' }}>{label}</span>
    </div>
  )
}
