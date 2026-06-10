import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadLeagues() }, [user])

  async function loadLeagues() {
    const { data } = await supabase
      .from('leagues')
      .select('*, prize_type, league_members(user_id, paid, profiles(id, username, total_points)), league_round_payments(user_id, round_label, paid)')
      .eq('admin_user_id', user.id)
      .order('created_at', { ascending: false })
    setLeagues(data || [])
    setLoading(false)
  }

  if (loading) return <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading…</div>

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 48, width: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 18, color: '#0D1B2A', marginBottom: 2 }}>My leagues</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>Manage leagues you created.</p>
        </div>
      </div>

      {leagues.length === 0 ? (
        <div className="card text-center" style={{ padding: '40px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#0D1B2A', marginBottom: 6 }}>No leagues yet</div>
          <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)', marginBottom: 20 }}>
            Create a league to invite friends and compete together.
          </div>
          <button onClick={() => navigate('/leagues')} className="btn-primary" style={{ fontSize: 13 }}>
            Go to Leagues
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {leagues.map(league => (
            <LeagueAdminCard
              key={league.id}
              league={league}
              currentUserId={user.id}
              onDeleted={loadLeagues}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function getRoundOrder(label) {
  if (label.startsWith('Group Stage – Matchday ')) return parseInt(label.slice(-1))
  if (label === 'Round of 32')         return 4
  if (label === 'Round of 16')         return 5
  if (label === 'Quarter-final')       return 6
  if (label === 'Semi-final')          return 7
  if (label === 'Third Place Play-off')return 8
  if (label === 'Final')               return 9
  return 99
}

function roundShortLabel(label) {
  const order = getRoundOrder(label)
  return order < 99 ? `R${order}` : label
}

const hasRoundPrize = (pt) => pt === 'per_round' || pt === 'both'
const hasTournamentPrize = (pt) => pt === 'tournament' || pt === 'both'

function LeagueAdminCard({ league, currentUserId, onDeleted }) {
  const navigate = useNavigate()
  const rawMembers = (league.league_members || [])
    .filter(m => m.profiles)
    .map(m => ({ ...m.profiles, paid: m.paid }))
    .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))

  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [localMembers, setLocalMembers] = useState(rawMembers)
  const [roundPayExpanded, setRoundPayExpanded] = useState(false)
  const [localRoundPay, setLocalRoundPay] = useState(league.league_round_payments || [])
  const [togglingRound, setTogglingRound] = useState(null) // `${userId}_${roundLabel}`

  async function copyCode() {
    await navigator.clipboard.writeText(league.invite_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function removeMember(memberId) {
    setRemovingId(memberId)
    await supabase.from('league_members').delete().eq('league_id', league.id).eq('user_id', memberId)
    setLocalMembers(prev => prev.filter(m => m.id !== memberId))
    setRemovingId(null)
  }

  async function togglePaid(memberId, currentPaid) {
    setTogglingId(memberId)
    await supabase.from('league_members')
      .update({ paid: !currentPaid })
      .eq('league_id', league.id).eq('user_id', memberId)
    setLocalMembers(prev => prev.map(m => m.id === memberId ? { ...m, paid: !currentPaid } : m))
    setTogglingId(null)
  }

  async function toggleRoundPaid(memberId, roundLabel, currentPaid) {
    const key = `${memberId}_${roundLabel}`
    setTogglingRound(key)
    await supabase.from('league_round_payments').upsert(
      { league_id: league.id, user_id: memberId, round_label: roundLabel, paid: !currentPaid },
      { onConflict: 'league_id,user_id,round_label' }
    )
    setLocalRoundPay(prev => {
      const existing = prev.find(p => p.user_id === memberId && p.round_label === roundLabel)
      if (existing) return prev.map(p => p.user_id === memberId && p.round_label === roundLabel ? { ...p, paid: !currentPaid } : p)
      return [...prev, { league_id: league.id, user_id: memberId, round_label: roundLabel, paid: !currentPaid }]
    })
    setTogglingRound(null)
  }

  async function deleteLeague() {
    await supabase.from('leagues').delete().eq('id', league.id)
    onDeleted()
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* League header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '0.5px solid rgba(13,27,42,0.08)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#0D1B2A', marginBottom: 2 }}>{league.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(13,27,42,0.45)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {localMembers.length} member{localMembers.length !== 1 ? 's' : ''}
              {(league.prize_type === 'tournament' || league.prize_type === 'both') && (
                <span style={{ background: '#F5E6B0', color: '#8B6A0A', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 500 }}>Tournament prize</span>
              )}
              {(league.prize_type === 'per_round' || league.prize_type === 'both') && (
                <span style={{ background: '#F5E6B0', color: '#8B6A0A', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 500 }}>Per-round prize</span>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate(`/leagues/${league.id}`)}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '5px 12px', flexShrink: 0 }}
          >
            View league
          </button>
        </div>

        {/* Invite code */}
        <div className="flex items-center gap-3 mt-3">
          <span style={{
            fontFamily: 'monospace', fontSize: 17, fontWeight: 500, letterSpacing: '0.15em',
            background: '#E8E0CC', color: '#0D1B2A', padding: '6px 14px', borderRadius: 8,
          }}>
            {league.invite_code}
          </span>
          <button onClick={copyCode} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>
            {copied ? '✓ Copied' : 'Copy code'}
          </button>
        </div>
      </div>

      {/* Members list */}
      <div>
        {localMembers.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'rgba(13,27,42,0.4)' }}>
            No members yet — share the invite code above.
          </div>
        ) : (
          localMembers.map((member, i) => {
            const isMe = member.id === currentUserId
            return (
              <div key={member.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                borderBottom: i < localMembers.length - 1 ? '0.5px solid rgba(13,27,42,0.06)' : 'none',
                background: isMe ? 'rgba(26,107,58,0.03)' : 'white',
              }}>
                {/* Rank */}
                <span style={{
                  fontSize: 12, fontWeight: 500, minWidth: 20, color: 'rgba(13,27,42,0.35)',
                }}>
                  #{i + 1}
                </span>

                {/* Name */}
                <span style={{ flex: 1, fontSize: 14, fontWeight: isMe ? 500 : 400, color: isMe ? '#1A6B3A' : '#0D1B2A', minWidth: 0 }}
                  className="truncate">
                  {member.username || 'Anonymous'}
                  {isMe && <span style={{ fontSize: 11, color: 'rgba(13,27,42,0.4)', marginLeft: 6 }}>(you)</span>}
                  {isMe && (
                    <span className="badge badge-group" style={{ marginLeft: 6 }}>admin</span>
                  )}
                </span>

                {/* Points */}
                <span style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A', flexShrink: 0 }}>
                  {member.total_points ?? 0}
                  <span style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 400, marginLeft: 3 }}>pts</span>
                </span>

                {/* Paid toggle — shown when tournament prize is enabled */}
                {(league.prize_type === 'tournament' || league.prize_type === 'both') && <button
                  onClick={() => togglePaid(member.id, member.paid)}
                  disabled={togglingId === member.id}
                  style={{
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                    border: 'none', borderRadius: 6, padding: '3px 8px',
                    background: member.paid ? '#D6EFE0' : '#F8DFDC',
                    color: member.paid ? '#0D3D20' : '#7A1C12',
                    opacity: togglingId === member.id ? 0.5 : 1,
                  }}
                  title="Toggle paid status"
                >
                  {member.paid ? 'Paid' : 'Unpaid'}
                </button>}

                {/* Remove button (not for self) */}
                {!isMe && (
                  <button
                    onClick={() => removeMember(member.id)}
                    disabled={removingId === member.id}
                    style={{
                      fontSize: 12, color: 'rgba(13,27,42,0.3)', cursor: 'pointer',
                      background: 'none', border: 'none', padding: '2px 4px',
                      flexShrink: 0,
                    }}
                    title={`Remove ${member.username}`}
                  >
                    {removingId === member.id ? '…' : '✕'}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Round payment history — for per_round / both leagues */}
      {hasRoundPrize(league.prize_type) && (() => {
        // Build grouped structure: { roundLabel: { userId: paid } }
        const roundGroups = {}
        for (const p of localRoundPay) {
          if (!roundGroups[p.round_label]) roundGroups[p.round_label] = {}
          roundGroups[p.round_label][p.user_id] = p.paid
        }
        const sortedRounds = Object.keys(roundGroups).sort((a, b) => getRoundOrder(a) - getRoundOrder(b))

        return (
          <div style={{ borderTop: '0.5px solid rgba(13,27,42,0.08)' }}>
            <button
              onClick={() => setRoundPayExpanded(v => !v)}
              style={{
                width: '100%', padding: '11px 16px', background: 'none', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#8B6A0A',
              }}
            >
              <span>Round payment history</span>
              <span style={{ fontSize: 16, color: 'rgba(13,27,42,0.35)' }}>{roundPayExpanded ? '▲' : '▼'}</span>
            </button>

            {roundPayExpanded && (
              <div style={{ paddingBottom: 8 }}>
                {sortedRounds.length === 0 ? (
                  <div style={{ padding: '8px 16px 12px', fontSize: 13, color: 'rgba(13,27,42,0.4)' }}>
                    No round payments recorded yet.
                  </div>
                ) : sortedRounds.map((roundLabel, ri) => {
                  const shortLabel = roundShortLabel(roundLabel)
                  return (
                    <div key={roundLabel} style={{
                      marginBottom: 10,
                      borderTop: ri > 0 ? '0.5px solid rgba(13,27,42,0.06)' : 'none',
                      paddingTop: ri > 0 ? 10 : 0,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(13,27,42,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 16px', marginBottom: 6 }}>
                        {shortLabel} — {roundLabel}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {localMembers.map(member => {
                          const paid = roundGroups[roundLabel]?.[member.id] ?? false
                          const key = `${member.id}_${roundLabel}`
                          return (
                            <div key={member.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '7px 16px',
                            }}>
                              <span style={{ flex: 1, fontSize: 13, color: '#0D1B2A' }}>
                                {member.username || 'Anonymous'}
                                {member.id === currentUserId && <span style={{ fontSize: 11, color: 'rgba(13,27,42,0.4)', marginLeft: 6 }}>(you)</span>}
                              </span>
                              <button
                                onClick={() => toggleRoundPaid(member.id, roundLabel, paid)}
                                disabled={togglingRound === key}
                                style={{
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                                  border: 'none', borderRadius: 6, padding: '3px 8px',
                                  background: paid ? '#D6EFE0' : '#F8DFDC',
                                  color: paid ? '#0D3D20' : '#7A1C12',
                                  opacity: togglingRound === key ? 0.5 : 1,
                                }}
                              >
                                {paid ? `${shortLabel} Paid` : `${shortLabel} Unpaid`}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Danger zone */}
      <div style={{ padding: '12px 16px', borderTop: '0.5px solid rgba(13,27,42,0.08)', background: 'rgba(13,27,42,0.02)' }}>
        {confirmDelete ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)' }}>
              Delete "{league.name}"? This can't be undone.
            </span>
            <button onClick={deleteLeague} className="btn-danger" style={{ fontSize: 12, padding: '5px 12px' }}>Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="btn-danger" style={{ fontSize: 12, padding: '5px 12px' }}>
            Delete league
          </button>
        )}
      </div>
    </div>
  )
}
