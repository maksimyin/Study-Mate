import { useRef, useState } from 'react'
import './ChatPanel.css'
import type { Message } from '../types'

interface Props {
  topics: string[]
  scopeTopics: string[]
  onToggleScope: (t: string) => void
  messages: Message[]
}

function StreamingIndicator() {
  return (
    <div className="streaming-wrap">
      <span className="streaming-dots">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="streaming-dot animate-dot-b"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </span>
      <span className="streaming-label">Generating response…</span>
    </div>
  )
}

export default function ChatPanel({ topics, scopeTopics, onToggleScope, messages }: Props) {
  const [input, setInput] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  const scopeLabel = scopeTopics.length > 0 ? scopeTopics.join(', ') : 'no topics'

  return (
    <main className="chat-panel">

      {/* Header */}
      <div className="chat-header">
        <span className="chat-model-chip">claude sonnet</span>
        <span className="chat-rag-label">· RAG · top 5 chunks</span>

        <div className="chat-scope-wrap">
          <span className="chat-scope-label">Scope</span>
          {topics.map(t => (
            <button
              key={t}
              onClick={() => onToggleScope(t)}
              className={`scope-chip${scopeTopics.includes(t) ? ' active' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div
            key={msg.id}
            className="message animate-fade-up"
            style={{ animationDelay: `${Math.min(idx * 0.06, 0.24)}s` }}
          >
            <div className={`message-avatar ${msg.role === 'user' ? 'message-avatar-user' : 'message-avatar-ai'}`}>
              {msg.role === 'user' ? 'U' : '✦'}
            </div>

            <div className="message-body">
              <div className="message-sender">
                {msg.role === 'user' ? 'You' : 'StudyMate'}
              </div>

              {msg.chunksRetrieved != null && (
                <div className="message-retrieval">
                  <span className="retrieval-dot" />
                  {msg.chunksRetrieved} chunks retrieved from {scopeLabel}
                </div>
              )}

              {msg.isStreaming ? (
                <StreamingIndicator />
              ) : (
                <div>
                  <p className="message-text">{msg.content}</p>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="citations">
                      {msg.citations.map(c => (
                        <a key={c.id} href="#" className="citation-chip">
                          {c.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="chat-input-wrap">
        <div className="chat-input-box">
          <textarea
            ref={taRef}
            value={input}
            onChange={handleInput}
            placeholder="Ask about your notes…"
            rows={1}
            className="chat-textarea"
          />
          <button className="send-button">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                className="send-icon"
                d="M6 10V2M6 2L3 5M6 2l3 3"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="chat-hint">Scoped to {scopeLabel} · Enter to send</p>
      </div>
    </main>
  )
}
