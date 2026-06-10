import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AdBanner from '../components/AdBanner'
import RoundHistory from '../components/RoundHistory'

const TABS = [
  { key: 'global',            label: 'All players' },
  { key: 'my_league',         label: 'My leagues' },
  { key: 'league_of_leagues', label: 'League of leagues' },
  { key: 'round_winners',     label: 'Round winners' },
]

// Rank badge colours from design guide
const rankStyle = (i) => {
  if (i === 0) return { bg: '#F5E6B0', color: '#8B6A0A' }
  if (i === 1) return { bg: '#E8E0CC', color: '#5A4F3A' }
  if (i === 2) return { bg: '#F8DFDC', color: '#7A1C12' }
  return { bg: '#E8E0CC', color: 'rgba(13,27,42,0.5)' }
}

export default function LeaderboardPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('global')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png?v=2" alt="Sweepy" style={{ height: 48, width: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: 18, color: '#0D1B2A', marginBottom: 2 }}>Leaderboard</h1>
          <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>See how everyone stacks up</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="rounded-badge flex-shrink-0 whitespace-nowrap transition-colors"
            style={{
              padding: '5px 14px', fontSize: 13, fontWeight: 500,
              background: tab === t.key ? '#0D1B2A' : '#E8E0CC',
              color: tab === t.key ? 'white' : 'rgba(13,27,42,0.65)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdBanner slot="0987654321" size="responsive" style={{ marginBottom: 20 }} />

      {tab === 'global'            && <GlobalTab userId={user?.id} />}
      {tab === 'my_league'         && <MyLeaguesTab userId={user?.id} />}
      {tab === 'league_of_leagues' && <LeagueOfLeaguesTab />}
      {tab === 'round_winners'     && <RoundHistory />}
    </div>
  )
}

function GlobalTab({ userId }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('profiles').select('id, username, total_points')
      .order('total_points', { ascending: false }).limit(200)
      .then(({ data }) => { setPlayers(data || []); setLoading(false) })
  }, [])

  const myRank = players.findIndex(p => p.id === userId) + 1

  if (loading) return <Spinner />
  return (
    <>
      {myRank > 0 && (
        <div className="card mb-4 flex items-center justify-between">
          <span style={{ fontSize: 13, color: 'rgba(13,27,42,0.55)' }}>Your position</span>
          <span style={{ fontSize: 18, fontWeight: 500, color: '#D4A017' }}>#{myRank} of {players.length}</span>
        </div>
      )}
      <RankedList rows={players.map(p => ({ id: p.id, label: p.username || 'Anonymous', points: p.total_points ?? 0 }))} highlightId={userId} />
    </>
  )
}

function MyLeaguesTab({ userId }) {
  const [myLeagues, setMyLeagues] = useState([])
  const [selected, setSelected] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)

  useEffect(() => {
    supabase.from('league_members').select('leagues(id, name)').eq('user_id', userId)
      .then(({ data }) => {
        const leagues = (data || []).map(r => r.leagues).filter(Boolean)
        setMyLeagues(leagues)
        if (leagues.length > 0) loadMembers(leagues[0].id, leagues[0])
        else setLoading(false)
      })
  }, [userId])

  async function loadMembers(leagueId, league) {
    setSelected(league)
    setMembersLoading(true)
    const { data } = await supabase
      .from('league_members').select('profiles(id, username, total_points)').eq('league_id', leagueId)
    const sorted = (data || []).map(m => m.profiles).filter(Boolean)
      .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
    setMembers(sorted)
    setLoading(false)
    setMembersLoading(false)
  }

  if (loading) return <Spinner />
  if (myLeagues.length === 0) return (
    <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.45)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
      <p style={{ fontSize: 16 }}>You're not in any leagues yet.</p>
      <Link to="/leagues" style={{ fontSize: 13, color: '#1A6B3A', fontWeight: 500 }}>Create or join a league →</Link>
    </div>
  )

  const totalPoints = members.reduce((s, m) => s + (m.total_points || 0), 0)

  return (
    <>
      {myLeagues.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
          {myLeagues.map(lg => (
            <button key={lg.id} onClick={() => loadMembers(lg.id, lg)}
              className="rounded-badge flex-shrink-0 whitespace-nowrap transition-colors"
              style={{
                padding: '5px 12px', fontSize: 13, fontWeight: 500,
                background: selected?.id === lg.id ? '#0D1B2A' : '#E8E0CC',
                color: selected?.id === lg.id ? 'white' : 'rgba(13,27,42,0.65)',
              }}>
              {lg.name}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="card mb-4 flex items-center justify-between">
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{selected.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>{members.length} members</div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 22, fontWeight: 500, color: '#D4A017' }}>{totalPoints}</div>
            <div style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 500 }}>league total</div>
          </div>
        </div>
      )}
      {membersLoading ? <Spinner /> : (
        <RankedList rows={members.map(m => ({ id: m.id, label: m.username || 'Anonymous', points: m.total_points ?? 0 }))} highlightId={userId} />
      )}
    </>
  )
}

function LeagueOfLeaguesTab() {
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: leagueData }, { data: memberData }] = await Promise.all([
        supabase.from('leagues').select('id, name'),
        supabase.from('league_members').select('league_id, profiles(total_points)'),
      ])
      const enriched = (leagueData || []).map(lg => {
        const lgMembers = (memberData || []).filter(m => m.league_id === lg.id)
        return { ...lg, points: lgMembers.reduce((s, m) => s + (m.profiles?.total_points || 0), 0), memberCount: lgMembers.length }
      }).sort((a, b) => b.points - a.points)
      setLeagues(enriched)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <Spinner />
  if (leagues.length === 0) return (
    <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.45)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
      <p style={{ fontSize: 16 }}>No leagues yet.</p>
      <Link to="/leagues" style={{ fontSize: 13, color: '#1A6B3A', fontWeight: 500 }}>Create the first league →</Link>
    </div>
  )

  return (
    <>
      <p style={{ fontSize: 13, color: 'rgba(13,27,42,0.45)', marginBottom: 16 }}>Ranked by combined points of all members.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {leagues.map((lg, i) => {
          const rs = rankStyle(i)
          return (
            <Link key={lg.id} to={`/leagues/${lg.id}`} className="card flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="rounded-badge flex items-center justify-center flex-shrink-0"
                style={{ width: 32, height: 32, background: rs.bg, color: rs.color, fontSize: 13, fontWeight: 500 }}>
                {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 14, fontWeight: 500 }}>{lg.name}</div>
                <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.5)' }}>{lg.memberCount} member{lg.memberCount !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#D4A017' }}>
                {lg.points}<span style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 400, marginLeft: 3 }}>pts</span>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}

function RankedList({ rows, highlightId }) {
  if (rows.length === 0) return <div className="text-center py-12" style={{ color: 'rgba(13,27,42,0.4)' }}>No entries yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row, i) => {
        const isMe = row.id === highlightId
        const rs = rankStyle(i)
        return (
          <div key={row.id} className="card flex items-center gap-3"
            style={isMe ? { border: '1.5px solid #1A6B3A' } : {}}>
            <div className="rounded-badge flex items-center justify-center flex-shrink-0"
              style={{ width: 32, height: 32, background: rs.bg, color: rs.color, fontSize: 13, fontWeight: 500 }}>
              {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
            </div>
            <div className="flex-1 min-w-0">
              <span style={{ fontSize: 14, fontWeight: 500, color: isMe ? '#1A6B3A' : '#0D1B2A' }}>
                {row.label}
                {isMe && <span style={{ fontSize: 12, color: 'rgba(13,27,42,0.4)', marginLeft: 6 }}>(you)</span>}
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#0D1B2A' }}>
              {row.points}<span style={{ fontSize: 11, color: 'rgba(13,27,42,0.45)', fontWeight: 400, marginLeft: 3 }}>pts</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Spinner() {
  return <div className="text-center py-16" style={{ color: 'rgba(13,27,42,0.4)' }}>Loading…</div>
}
