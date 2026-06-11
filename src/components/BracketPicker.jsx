import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Flag from './Flag'
import {
  GROUPS, R32_FIXED_SLOTS, R32_3RD_SLOTS, R16_FROM_R32, QF_FROM_R16,
  KNOCKOUT_STAGES, STAGE_LABELS, BRACKET_POINTS, resolveSlot,
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

  const [teams, setTeams]             = useState({})
  const [groupPicks, setGroupPicks]   = useState({})
  const [knockoutPicks, setKnockoutPicks] = useState({}) // { 'stage-slot': teamId }
  const [thirdOppPicks, setThirdOppPicks] = useState({}) // { [r32Slot]: teamId } — which 3rd-place team faces each group winner
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

    const byGroup = {}
    for (const t of teamData || []) {
      if (!t.group_name) continue
      if (!byGroup[t.group_name]) byGroup[t.group_name] = []
      byGroup[t.group_name].push(t)
    }
    setTeams(byGroup)

    const gp = {}
    for (const p of groupPickData || []) {
      if (!gp[p.group_name]) gp[p.group_name] = {}
      gp[p.group_name][p.predicted_position] = p.team
    }
    setGroupPicks(gp)

    const kp = {}
    const tp = {}
    for (const p of knockoutPickData || []) {
      if (p.stage === 'r32_third_opp') {
        tp[p.match_slot] = p.predicted_winner_team_id
      } else {
        kp[`${p.stage}-${p.match_slot}`] = p.predicted_winner_team_id
      }
    }
    setKnockoutPicks(kp)
    setThirdOppPicks(tp)
    setLoading(false)
  }

  // ── Group ordering ─────────────────────────────────────────────────────────
  function moveTeam(group, teamId, direction) {
    const current = { ...(groupPicks[group] || {}) }
    const posMap = {}
    for (const [pos, team] of Object.entries(current)) posMap[team.id] = parseInt(pos)
    const currentPos = posMap[teamId]
    if (!currentPos) return
    const targetPos = currentPos + direction
    if (targetPos < 1 || targetPos > 4) return
    const swapTeam = Object.entries(current).find(([p]) => parseInt(p) === targetPos)
    const newPicks = { ...current }
    const movingTeam = current[currentPos]
    if (swapTeam) newPicks[targetPos] = swapTeam[1]
    else delete newPicks[targetPos]
    if (!swapTeam) delete newPicks[currentPos]
    newPicks[targetPos] = movingTeam
    setGroupPicks(prev => ({ ...prev, [group]: newPicks }))
    invalidateKnockoutForGroup(group)
  }

  function assignTeamToPosition(group, pos, team) {
    setGroupPicks(prev => {
      const current = { ...(prev[group] || {}) }
      for (const [p, t] of Object.entries(current)) {
        if (t.id === team.id) delete current[p]
      }
      current[pos] = team
      invalidateKnockoutForGroup(group)
      return { ...prev, [group]: current }
    })
  }

  function invalidateKnockoutForGroup(group) {
    // Find all R32 slots that involve this group (fixed or 3rd-place)
    const affectedR32Slots = new Set()
    for (const s of R32_FIXED_SLOTS) {
      if (s.home.endsWith(group) || s.away.endsWith(group)) affectedR32Slots.add(s.slot)
    }
    for (const s of R32_3RD_SLOTS) {
      if (s.winner.endsWith(group)) affectedR32Slots.add(s.slot)
    }

    setKnockoutPicks(prev => {
      const next = { ...prev }
      // Clear affected R32 picks
      for (const slot of affectedR32Slots) delete next[`round_of_32-${slot}`]
      // Cascade to R16
      const affectedR16Slots = new Set()
      for (const [r16Slot, [a, b]] of Object.entries(R16_FROM_R32)) {
        if (affectedR32Slots.has(a) || affectedR32Slots.has(b)) {
          affectedR16Slots.add(parseInt(r16Slot))
          delete next[`round_of_16-${r16Slot}`]
        }
      }
      // Cascade to QF
      const affectedQFSlots = new Set()
      for (const [qfSlot, [a, b]] of Object.entries(QF_FROM_R16)) {
        if (affectedR16Slots.has(a) || affectedR16Slots.has(b)) {
          affectedQFSlots.add(parseInt(qfSlot))
          delete next[`quarter_final-${qfSlot}`]
        }
      }
      // Cascade to SF
      const affectedSFSlots = new Set()
      for (const qfSlot of affectedQFSlots) {
        const sfSlot = Math.floor(qfSlot / 2)
        affectedSFSlots.add(sfSlot)
        delete next[`semi_final-${sfSlot}`]
      }
      // Cascade to Final
      for (const sfSlot of affectedSFSlots) {
        delete next[`final-${Math.floor(sfSlot / 2)}`]
      }
      return next
    })
  }

  // ── Knockout picks ─────────────────────────────────────────────────────────
  function getNextStageSlot(stage, slot) {
    if (stage === 'round_of_32') {
      for (const [r16Slot, [a, b]] of Object.entries(R16_FROM_R32)) {
        if (a === slot || b === slot) return parseInt(r16Slot)
      }
    } else if (stage === 'round_of_16') {
      for (const [qfSlot, [a, b]] of Object.entries(QF_FROM_R16)) {
        if (a === slot || b === slot) return parseInt(qfSlot)
      }
    } else {
      return Math.floor(slot / 2)
    }
    return null
  }

  function pickKnockoutWinner(stage, slot, teamId) {
    if (isReadOnly) return
    const key = `${stage}-${slot}`
    setKnockoutPicks(prev => {
      const next = { ...prev, [key]: teamId }
      const stageIdx = KNOCKOUT_STAGES.indexOf(stage)
      const nextStage = KNOCKOUT_STAGES[stageIdx + 1]
      if (nextStage) {
        const nextSlot = getNextStageSlot(stage, slot)
        if (nextSlot !== null) {
          const nextKey = `${nextStage}-${nextSlot}`
          if (next[nextKey]) {
            delete next[nextKey]
            cascadeDelete(next, stageIdx + 1, nextSlot)
          }
        }
      }
      return next
    })
  }

  function cascadeDelete(picks, stageIdx, slot) {
    const nextStage = KNOCKOUT_STAGES[stageIdx + 1]
    if (!nextStage) return
    const nextSlot = getNextStageSlot(KNOCKOUT_STAGES[stageIdx], slot)
    if (nextSlot === null) return
    const nextKey = `${nextStage}-${nextSlot}`
    if (picks[nextKey]) {
      delete picks[nextKey]
      cascadeDelete(picks, stageIdx + 1, nextSlot)
    }
  }

  function getKnockoutTeam(stage, slot) {
    const teamId = knockoutPicks[`${stage}-${slot}`]
    return teamId ? findTeamById(teamId) : null
  }

  function getSlotCandidates(stage, slot) {
    const stageIdx = KNOCKOUT_STAGES.indexOf(stage)
    if (stageIdx === 0) {
      // R32 — check fixed slots first
      const fixedSlot = R32_FIXED_SLOTS.find(s => s.slot === slot)
      if (fixedSlot) {
        return [
          resolveSlot(fixedSlot.home, groupPicks),
          resolveSlot(fixedSlot.away, groupPicks),
        ].filter(Boolean)
      }
      // 3rd-place slot: group winner + user-assigned 3rd-place opponent
      const thirdSlot = R32_3RD_SLOTS.find(s => s.slot === slot)
      if (thirdSlot) {
        const winnerTeam = resolveSlot(thirdSlot.winner, groupPicks)
        const thirdTeam = thirdOppPicks[slot] ? findTeamById(thirdOppPicks[slot]) : null
        return [winnerTeam, thirdTeam].filter(Boolean)
      }
      return []
    }

    if (stage === 'round_of_16') {
      const [a, b] = R16_FROM_R32[slot] || []
      return [
        getKnockoutTeam('round_of_32', a),
        getKnockoutTeam('round_of_32', b),
      ].filter(Boolean)
    }

    if (stage === 'quarter_final') {
      const [a, b] = QF_FROM_R16[slot] || []
      return [
        getKnockoutTeam('round_of_16', a),
        getKnockoutTeam('round_of_16', b),
      ].filter(Boolean)
    }

    // semi_final and final: sequential pairing from previous stage
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

  // ── Third-place opponent assignment ────────────────────────────────────────
  function assignThirdOpp(r32Slot, teamId) {
    if (isReadOnly) return
    setThirdOppPicks(prev => ({ ...prev, [r32Slot]: teamId }))
    // Invalidate the winner pick for this slot if there was one
    setKnockoutPicks(prev => {
      const next = { ...prev }
      delete next[`round_of_32-${r32Slot}`]
      // Cascade
      const r16Slot = getNextStageSlot('round_of_32', r32Slot)
      if (r16Slot !== null && next[`round_of_16-${r16Slot}`]) {
        delete next[`round_of_16-${r16Slot}`]
        cascadeDelete(next, 1, r16Slot)
      }
      return next
    })
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)

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

    const knockoutRows = []
    for (const [key, teamId] of Object.entries(knockoutPicks)) {
      if (!teamId) continue
      const [stage, slotStr] = key.split('-')
      knockoutRows.push({
        user_id: user.id, league_id: leagueId,
        stage, match_slot: parseInt(slotStr),
        predicted_winner_team_id: teamId,
        updated_at: new Date().toISOString(),
      })
    }
    // Save 3rd-place opponent assignments under stage 'r32_third_opp'
    for (const [slot, teamId] of Object.entries(thirdOppPicks)) {
      if (!teamId) continue
      knockoutRows.push({
        user_id: user.id, league_id: leagueId,
        stage: 'r32_third_opp', match_slot: parseInt(slot),
        predicted_winner_team_id: teamId,
        updated_at: new Date().toISOString(),
      })
    }

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

  // ── Progress ───────────────────────────────────────────────────────────────
  const groupsComplete = GROUPS.filter(g => Object.keys(groupPicks[g] || {}).length === 4).length
  const thirdOppComplete = Object.keys(thirdOppPicks).length
  const r32WinnersComplete = R32_FIXED_SLOTS.filter(s => knockoutPicks[`round_of_32-${s.slot}`]).length
    + R32_3RD_SLOTS.filter(s => knockoutPicks[`round_of_32-${s.slot}`]).length

  if (loading) return <div className="text-center py-10" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading bracket…</div>

  return (
    <div>
      {/* Scoring summary */}
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
          { key: 'third',    label: `3rd Place (${thirdOppComplete}/8)` },
          { key: 'knockout', label: `Knockout (${r32WinnersComplete}/16)` },
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

      {/* 3rd-place tab — assign which 3rd-place team faces each group winner in R32 */}
      {tab === 'third' && (
        <ThirdPlacePicker
          groupPicks={groupPicks}
          thirdOppPicks={thirdOppPicks}
          onAssign={assignThirdOpp}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Knockout tab */}
      {tab === 'knockout' && (
        <KnockoutBracket
          groupPicks={groupPicks}
          knockoutPicks={knockoutPicks}
          thirdOppPicks={thirdOppPicks}
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
        }}>{group}</div>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A' }}>Group {group}</span>
        {complete && <span style={{ fontSize: 11, color: '#1A6B3A', fontWeight: 600 }}>✓ Complete</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: unassigned.length ? 12 : 0 }}>
        {positionedTeams.map(({ pos, team }) => {
          const { bg, color } = POS_COLORS[pos]
          return (
            <div key={pos}
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
              }}>
              <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>{POS_LABELS[pos]}</span>
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

      {!isReadOnly && unassigned.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {unassigned.map(team => (
            <div key={team.id} draggable
              onDragStart={e => { e.dataTransfer.setData('teamId', team.id); setDragging(team.id) }}
              onDragEnd={() => setDragging(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8, cursor: 'grab',
                background: dragging === team.id ? '#E8E0CC' : '#F5F3EE',
                border: '1px solid rgba(13,27,42,0.1)',
                fontSize: 12, fontWeight: 500, color: '#0D1B2A',
              }}>
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

// ── 3rd-place opponent assignment ─────────────────────────────────────────────
function ThirdPlacePicker({ groupPicks, thirdOppPicks, onAssign, isReadOnly }) {
  const allThirdPlaceTeams = GROUPS.map(g => groupPicks[g]?.[3]).filter(Boolean)

  return (
    <div>
      <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)', marginBottom: 16, lineHeight: 1.6 }}>
        8 of the 12 group 3rd-place teams will advance to the Round of 32. Pick which 3rd-place team you think will face each group winner below.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {R32_3RD_SLOTS.map(({ slot, winner }) => {
          const winnerTeam = resolveSlotFromPicks(winner, groupPicks)
          const selectedId = thirdOppPicks[slot]
          const selectedTeam = allThirdPlaceTeams.find(t => t.id === selectedId)

          return (
            <div key={slot} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,42,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Match {slot + 73} — {winner} vs Best 3rd
              </div>

              {/* Group winner (fixed) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.5)', minWidth: 60 }}>{winner}:</span>
                {winnerTeam ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Flag teamName={winnerTeam.name} size="sm" />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{winnerTeam.name}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.35)', fontStyle: 'italic' }}>Set group {winner[1]} picks first</span>
                )}
              </div>

              {/* 3rd-place opponent picker */}
              {!isReadOnly && (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', marginBottom: 6 }}>Pick the 3rd-place opponent:</div>
                  {allThirdPlaceTeams.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(13,27,42,0.35)', fontStyle: 'italic' }}>Set group picks first to see 3rd-place teams</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {allThirdPlaceTeams.map(team => {
                        const isPicked = selectedId === team.id
                        return (
                          <button key={team.id} onClick={() => onAssign(slot, team.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                              border: `1.5px solid ${isPicked ? '#1A6B3A' : 'rgba(13,27,42,0.1)'}`,
                              background: isPicked ? '#D6EFE0' : '#F5F3EE',
                              fontSize: 12, fontWeight: isPicked ? 600 : 400,
                              color: isPicked ? '#0D3D20' : '#0D1B2A',
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
              )}
              {isReadOnly && selectedTeam && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.5)', minWidth: 60 }}>3rd pick:</span>
                  <Flag teamName={selectedTeam.name} size="sm" />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedTeam.name}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Helper for ThirdPlacePicker (can't call resolveSlot directly due to import scope)
function resolveSlotFromPicks(slotDesc, groupPicks) {
  const pos = parseInt(slotDesc[0])
  const group = slotDesc.slice(1)
  return groupPicks[group]?.[pos] ?? null
}

// ── Knockout bracket ──────────────────────────────────────────────────────────
function KnockoutBracket({ knockoutPicks, thirdOppPicks, getSlotCandidates, getKnockoutTeam, pickKnockoutWinner, findTeamById, isReadOnly }) {
  const [activeStage, setActiveStage] = useState('round_of_32')

  const slotsForStage = (stage) => {
    const counts = { round_of_32: 16, round_of_16: 8, quarter_final: 4, semi_final: 2, final: 1 }
    return Array.from({ length: counts[stage] }, (_, i) => i)
  }

  return (
    <div>
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
          const fixedSlot = R32_FIXED_SLOTS.find(s => s.slot === slot)
          const thirdSlot = R32_3RD_SLOTS.find(s => s.slot === slot)
          let slotLabel
          if (activeStage === 'round_of_32') {
            if (fixedSlot) slotLabel = `${fixedSlot.home} vs ${fixedSlot.away}`
            else if (thirdSlot) slotLabel = `${thirdSlot.winner} vs Best 3rd`
            else slotLabel = `Match ${slot + 1}`
          } else {
            slotLabel = `Match ${slot + 1}`
          }

          // For 3rd-place R32 slots with no group winner pick yet
          const thirdInfo = activeStage === 'round_of_32' && thirdSlot
          const hasThirdOpp = thirdInfo && thirdOppPicks[slot]
          const noGroupWinner = thirdInfo && candidates.length === 0

          return (
            <div key={slot} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,42,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {STAGE_LABELS[activeStage]} — {slotLabel}
              </div>

              {candidates.length === 0 ? (
                <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.35)', fontStyle: 'italic' }}>
                  {activeStage === 'round_of_32'
                    ? thirdInfo
                      ? (hasThirdOpp ? 'Set your group picks first' : 'Set group picks + assign 3rd-place opponent in the "3rd Place" tab')
                      : 'Set your group picks first'
                    : 'Pick previous round winners first'}
                </div>
              ) : candidates.length === 1 && thirdInfo && !hasThirdOpp ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Flag teamName={candidates[0].name} size="sm" />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{candidates[0].name}</span>
                    <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.4)', marginLeft: 4 }}>vs ?</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(13,27,42,0.4)', fontStyle: 'italic' }}>
                    Assign the 3rd-place opponent in the "3rd Place" tab first
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {candidates.map(team => {
                    const isPicked = picked === team.id
                    return (
                      <button key={team.id}
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
