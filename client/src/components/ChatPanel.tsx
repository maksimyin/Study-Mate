import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import './ChatPanel.css'
import type { Citation, Message } from '../types'

interface Props {
  activeTopic: string
  messages: Message[]
  isSending: boolean
  onSend: (content: string) => void
}

function processContent(content: string): string {
  return content.replace(/\[(\d+)\]/g, '<sup class="cite-ref">$1</sup>')
}

function SourcesSection({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false)

  // Dedupe by (filename, page) — collect all citation IDs that map to the same page
  type Group = { ids: string[]; filename: string; page: number }
  const groups: Group[] = []
  const seen = new Map<string, number>()
  for (const c of citations) {
    const key = `${c.filename}::${c.page}`
    const idx = seen.get(key)
    if (idx !== undefined) {
      groups[idx].ids.push(c.id)
    } else {
      seen.set(key, groups.length)
      groups.push({ ids: [c.id], filename: c.filename, page: c.page })
    }
  }

  return (
    <div className="sources-section">
      <button className="sources-toggle" onClick={() => setOpen(o => !o)}>
        <span className="sources-chevron">{open ? '▾' : '▸'}</span>
        Sources used · {groups.length}
      </button>
      {open && (
        <div className="sources-list">
          {groups.map((g, i) => (
            <div key={i} className="source-item">
              <span className="source-num">{g.ids.map(id => `[${id}]`).join('')}</span>
              <span className="source-filename">{g.filename}</span>
              {g.page > 0 && <span className="source-page">p. {g.page}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
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

export default function ChatPanel({ activeTopic, messages, isSending, onSend }: Props) {
  const [input, setInput]   = useState('')
  const taRef               = useRef<HTMLTextAreaElement>(null)
  const scrollRef           = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  const submit = () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return
    onSend(trimmed)
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submit()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const scopeLabel = activeTopic

  return (
    <main className="chat-panel">

      {/* Header */}
      <div className="chat-header">
        <span className="chat-model-chip">claude sonnet</span>
        <span className="chat-rag-label">· RAG · top 5 chunks</span>

        <div className="chat-scope-wrap">
          <span className="chat-scope-label">Studying</span>
          <span className="scope-chip active">{activeTopic}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={scrollRef}>
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

              {msg.isStreaming && msg.content === '' ? (
                <StreamingIndicator />
              ) : (
                <div className="prose prose-sm max-w-none">
                  <div className="message-text">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                      components={{
                        h1: ({ children }) => <h2 className="md-h1">{children}</h2>,
                        h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
                        h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
                        p:  ({ children }) => <p  className="md-p">{children}</p>,
                        ul: ({ children }) => <ul className="md-ul">{children}</ul>,
                        ol: ({ children }) => <ol className="md-ol">{children}</ol>,
                        li: ({ children }) => <li className="md-li">{children}</li>,
                        strong: ({ children }) => <strong className="md-strong">{children}</strong>,
                        em:     ({ children }) => <em     className="md-em">{children}</em>,
                        hr: () => <hr className="md-hr" />,
                        table:  ({ children }) => <table  className="md-table">{children}</table>,
                        thead:  ({ children }) => <thead  className="md-thead">{children}</thead>,
                        tr:     ({ children }) => <tr     className="md-tr">{children}</tr>,
                        th:     ({ children }) => <th     className="md-th">{children}</th>,
                        td:     ({ children }) => <td     className="md-td">{children}</td>,
                        code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '')
                            
                            if (!inline && match) {
                                return (
                                <SyntaxHighlighter language={match[1]}>
                                    {String(children)}
                                </SyntaxHighlighter>
                                )
                            }
                            
                            if (!inline) {
                                return <pre className="md-code-block"><code>{children}</code></pre>
                            }
                            
                            return <code className="md-code">{children}</code>
                        },
                        pre:    ({ children }) => <pre    className="md-pre">{children}</pre>,
                      }}
                    >
                      {processContent(msg.content)}
                    </ReactMarkdown>
                  </div>
                  {msg.citations && msg.citations.length > 0 && (
                    <SourcesSection citations={msg.citations} />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form className="chat-input-wrap" onSubmit={onSubmit}>
        <div className="chat-input-box">
          <textarea
            ref={taRef}
            value={input}
            onChange={handleInput}
            onKeyDown={onKeyDown}
            placeholder="Ask about your notes…"
            rows={1}
            className="chat-textarea"
            disabled={isSending}
          />
          <button
            type="submit"
            className="send-button"
            disabled={isSending || !input.trim()}
          >
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
        <p className="chat-hint">Scoped to {scopeLabel} · Shift+Enter for new line</p>
      </form>
    </main>
  )
}
