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
  const inputRef                = useRef(null)

  // @mention state
  const [mentionSearch, setMentionSearch] = useState(null) // null = closed, string = query
  const [mentionStart, setMentionStart]   = useState(-1)
  const [mentionIndex, setMentionIndex]   = useState(0)

  // name / id lookup maps
  const nameMap = {}
  for (const m of members) nameMap[m.id] = m.username || 'Anonymous'
  const myUsername = (nameMap[user.id] || '').toLowerCase()

  useEffect(() => {
    loadMessages()

    const channel = supabase
      .channel(`league-chat-${leagueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_messages', filter: `league_id=eq.${leagueId}` },
        (payload) => { setMessages(prev => [...prev, payload.new]); scrollToBottom(true) }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'league_messages', filter: `league_id=eq.${leagueId}` },
        (payload) => { setMessages(prev => prev.filter(m => m.id !== payload.old.id)) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

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

  // ── @mention helpers ────────────────────────────────────────────────────────

  const mentionSuggestions = mentionSearch !== null
    ? members
        .filter(m => m.id !== user.id && (m.username || '').toLowerCase().startsWith(mentionSearch))
        .slice(0, 5)
    : []

  function handleTextChange(e) {
    const val = e.target.value
    setText(val)
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match  = before.match(/@(\w*)$/)
    if (match) {
      setMentionSearch(match[1].toLowerCase())
      setMentionStart(match.index)
      setMentionIndex(0)
    } else {
      setMentionSearch(null)
      setMentionStart(-1)
    }
  }

  function selectMention(username) {
    const cursor  = inputRef.current?.selectionStart ?? text.length
    const before  = text.slice(0, mentionStart)
    const after   = text.slice(cursor)
    setText(`${before}@${username} ${after}`)
    setMentionSearch(null)
    setMentionStart(-1)
    setTimeout(() => {
      inputRef.current?.focus()
      const pos = (before + '@' + username + ' ').length
      inputRef.current?.setSelectionRange(pos, pos)
    }, 0)
  }

  function handleKeyDown(e) {
    if (mentionSuggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionSuggestions.length) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length) }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const s = mentionSuggestions[mentionIndex]
      if (s) { e.preventDefault(); selectMention(s.username || 'Anonymous') }
    }
    if (e.key === 'Escape') { setMentionSearch(null) }
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  async function send(e) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    setMentionSearch(null)

    const { data: msgData } = await supabase
      .from('league_messages')
      .insert({ league_id: leagueId, user_id: user.id, message: trimmed })
      .select()
      .single()

    // Create notifications for @mentioned members
    const rawMentions = [...trimmed.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase())
    if (rawMentions.length > 0 && msgData) {
      const senderName = nameMap[user.id] || 'Someone'
      const preview    = trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed
      const notifs = members
        .filter(m => m.id !== user.id && rawMentions.includes((m.username || '').toLowerCase()))
        .map(m => ({
          user_id:      m.id,
          from_user_id: user.id,
          league_id:    leagueId,
          message:      `${senderName} mentioned you: "${preview}"`,
        }))
      if (notifs.length > 0) {
        await supabase.from('notifications').insert(notifs)
      }
    }

    setSending(false)
  }

  async function deleteMessage(id) {
    setMessages(prev => prev.filter(m => m.id !== id))
    const { error } = await supabase.from('league_messages').delete().eq('id', id)
    if (error) loadMessages()
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderMessageText(msgText, isMe) {
    const parts = msgText.split(/(@\w+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const handle   = part.slice(1).toLowerCase()
        const isMember = members.some(m => (m.username || '').toLowerCase() === handle)
        if (isMember) {
          const isMyTag = handle === myUsername
          return (
            <span key={i} style={{
              fontWeight: 600,
              color:  isMe ? (isMyTag ? '#FFE87C' : 'rgba(255,255,255,0.9)') : (isMyTag ? '#1A6B3A' : '#0D3D20'),
              background: isMyTag ? (isMe ? 'rgba(255,255,255,0.15)' : 'rgba(26,107,58,0.12)') : 'transparent',
              borderRadius: 4,
              padding: isMyTag ? '0 3px' : 0,
            }}>
              {part}
            </span>
          )
        }
      }
      return part
    })
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
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8 }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
              const time       = new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              const date       = new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              const showDate   = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString()

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(13,27,42,0.3)', padding: '12px 0 4px', fontWeight: 500 }}>
                      {date}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, padding: '2px 0' }}>
                    {!isMe && showName && (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: stringToColour(msg.user_id),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 600, color: 'white', marginBottom: 2,
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
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMe ? '#1A6B3A' : 'white',
                        color:      isMe ? 'white' : '#0D1B2A',
                        fontSize: 13, lineHeight: 1.5,
                        border: isMe ? 'none' : '0.5px solid rgba(13,27,42,0.1)',
                        wordBreak: 'break-word',
                      }}>
                        {renderMessageText(msg.message, isMe)}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'rgba(13,27,42,0.3)',
                        textAlign: isMe ? 'right' : 'left',
                        marginTop: 2, paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0,
                        display: 'flex', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 6,
                      }}>
                        <span>{time}</span>
                        {isMe && (
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

      {/* Input area */}
      <form onSubmit={send}
        style={{ paddingTop: 12, borderTop: '0.5px solid rgba(13,27,42,0.1)', position: 'relative' }}
      >
        {/* @mention dropdown */}
        {mentionSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
            background: 'white', border: '1px solid rgba(13,27,42,0.15)',
            borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            zIndex: 100, overflow: 'hidden',
          }}>
            {mentionSuggestions.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); selectMention(m.username || 'Anonymous') }}
                style={{
                  width: '100%', padding: '8px 12px', textAlign: 'left',
                  background: idx === mentionIndex ? '#F5F3EE' : 'none',
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, color: '#0D1B2A',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: idx < mentionSuggestions.length - 1 ? '0.5px solid rgba(13,27,42,0.06)' : 'none',
                }}
                onMouseEnter={() => setMentionIndex(idx)}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: stringToColour(m.id),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 600, color: 'white', flexShrink: 0,
                }}>
                  {(m.username || 'A')[0].toUpperCase()}
                </div>
                <span style={{ fontWeight: 500 }}>@{m.username || 'Anonymous'}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            className="input"
            style={{ flex: 1, fontSize: 13 }}
            placeholder="Type a message… use @ to mention someone"
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
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
        </div>
      </form>
    </div>
  )
}

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
