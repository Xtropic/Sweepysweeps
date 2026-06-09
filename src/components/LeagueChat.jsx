import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function LeagueChat({ leagueId, members }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const bottomRef               = useRef(null)

  // Build a quick name lookup from the members list
  const nameMap = {}
  for (const m of members) nameMap[m.id] = m.username || 'Anonymous'

  useEffect(() => {
    loadMessages()

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`league-chat-${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', schema: 'public', table: 'league_messages',
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new])
          scrollToBottom(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE', schema: 'public', table: 'league_messages',
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  // Scroll to bottom when messages first load or new message arrives
  useEffect(() => { scrollToBottom(false) }, [messages.length === 0 ? 0 : 1])

  async function loadMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('league_messages')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true })
      .limit(200)
    setMessages(data || [])
    setLoading(false)
    scrollToBottom(false)
  }

  function scrollToBottom(smooth) {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    }, 50)
  }

  async function send(e) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    await supabase.from('league_messages').insert({
      league_id: leagueId,
      user_id:   user.id,
      message:   trimmed,
    })
    setSending(false)
  }

  async function deleteMessage(id) {
    // Optimistic removal — disappears instantly, reappears only if DB delete fails
    setMessages(prev => prev.filter(m => m.id !== id))
    const { error } = await supabase.from('league_messages').delete().eq('id', id)
    if (error) {
      // Restore message if delete failed
      loadMessages()
    }
  }

  if (loading) {
    return (
      <div className="text-center py-10" style={{ color: 'rgba(13,27,42,0.4)', fontSize: 13 }}>
        Loading chat…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 480 }}>

      {/* Message list */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: 2, paddingBottom: 8,
      }}>
        {messages.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 32 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A' }}>No messages yet</div>
            <div style={{ fontSize: 13, color: 'rgba(13,27,42,0.45)', textAlign: 'center' }}>
              Be the first to start the banter
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const isMe       = msg.user_id === user.id
              const senderName = nameMap[msg.user_id] || 'Unknown'
              const prevMsg    = messages[i - 1]
              const showName   = !prevMsg || prevMsg.user_id !== msg.user_id
              const time       = new Date(msg.created_at).toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit',
              })
              const date       = new Date(msg.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short',
              })
              const showDate   = !prevMsg
                || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString()

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div style={{
                      textAlign: 'center', fontSize: 11, color: 'rgba(13,27,42,0.3)',
                      padding: '12px 0 4px', fontWeight: 500,
                    }}>
                      {date}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row',
                      alignItems: 'flex-end', gap: 6, padding: '2px 0',
                    }}
                  >
                    {/* Avatar initial */}
                    {!isMe && showName && (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: stringToColour(msg.user_id),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 600, color: 'white',
                        marginBottom: 2,
                      }}>
                        {senderName[0]?.toUpperCase()}
                      </div>
                    )}
                    {!isMe && !showName && <div style={{ width: 28, flexShrink: 0 }} />}

                    <div style={{ maxWidth: '75%' }}>
                      {showName && !isMe && (
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(13,27,42,0.45)', marginBottom: 2, marginLeft: 2 }}>
                          {senderName}
                        </div>
                      )}
                      <div
                        style={{
                          padding: '8px 12px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          background: isMe ? '#1A6B3A' : 'white',
                          color:      isMe ? 'white' : '#0D1B2A',
                          fontSize: 13, lineHeight: 1.5,
                          border: isMe ? 'none' : '0.5px solid rgba(13,27,42,0.1)',
                          wordBreak: 'break-word',
                          position: 'relative',
                        }}
                      >
                        {msg.message}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'rgba(13,27,42,0.3)',
                        textAlign: isMe ? 'right' : 'left',
                        marginTop: 2, paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0,
                        display: 'flex', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 6,
                      }}>
                        <span>{time}</span>
                        {(isMe) && (
                          <button
                            onClick={() => deleteMessage(msg.id)}
                            style={{ color: 'rgba(13,27,42,0.25)', fontSize: 10, border: 'none', cursor: 'pointer', padding: 0, background: 'none' }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input bar */}
      <form onSubmit={send}
        style={{
          display: 'flex', gap: 8, paddingTop: 12,
          borderTop: '0.5px solid rgba(13,27,42,0.1)',
        }}
      >
        <input
          className="input"
          style={{ flex: 1, fontSize: 13 }}
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={500}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: 13, flexShrink: 0 }}
        >
          Send
        </button>
      </form>
    </div>
  )
}

// Deterministic colour from user ID string
function stringToColour(str) {
  const palette = [
    '#1A6B3A', '#0D3D20', '#D4A017', '#8B6A0A',
    '#0D2347', '#2563eb', '#7c3aed', '#db2777',
    '#ea580c', '#0891b2',
  ]
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return palette[Math.abs(hash) % palette.length]
}
