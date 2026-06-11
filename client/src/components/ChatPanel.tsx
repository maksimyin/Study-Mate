import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import './ChatPanel.css'
import type { Citation, Message } from '../types'

// Sanitize schema: strips dangerous raw HTML (script tags, on* handlers,
// javascript: URLs) from message content while still permitting the citation
// markers we inject in processContent. Applied AFTER rehypeRaw parses the raw
// HTML into nodes and BEFORE rehypeKatex generates its (trusted) math markup.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    sup: [...(defaultSchema.attributes?.sup ?? []), 'className', 'data-cite'],
  },
}

interface Props {
  activeTopic: string
  messages: Message[]
  isSending: boolean
  onSend: (content: string) => void
  onFeedback: (messageId: string, feedback: 'positive' | 'negative') => void
  onRetry: (messageIndex: number) => void
  prefill: string
  onPrefillConsumed: () => void
}

const TEXTAREA_MAX_H = 240  // ~10 rows

function processContent(content: string): string {
  return content.replace(/\[(\d+)\]/g, '<sup class="cite-ref">$1</sup>')
}

// Shared markdown renderer — identical pipeline for user and assistant messages
function MessageMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex]}
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
      {processContent(content)}
    </ReactMarkdown>
  )
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

  if (groups.length === 0) {
    return (
      <div className="sources-section">
        <span className="sources-empty">No sources retrieved</span>
      </div>
    )
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

function MessageActions({
  msg, canRetry, onFeedback, onRetry, onNegativeFollowUp,
}: {
  msg: Message
  canRetry: boolean
  onFeedback: (messageId: string, feedback: 'positive' | 'negative') => void
  onRetry: () => void
  onNegativeFollowUp: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* clipboard unavailable */ })
  }

  return (
    <div className="message-actions">
      <button className="action-btn" onClick={copy} title="Copy response">
        {copied ? (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6.2L4.6 9 10 3" stroke="currentColor" strokeWidth="1.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 4V2.7A1.2 1.2 0 006.8 1.5H2.7A1.2 1.2 0 001.5 2.7v4.1A1.2 1.2 0 002.7 8H4"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Copy
          </>
        )}
      </button>

      <button
        className={`action-btn${msg.feedback === 'positive' ? ' action-active-positive' : ''}`}
        onClick={() => onFeedback(msg.id, 'positive')}
        disabled={msg.feedback != null}
        title="I understood this"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.2L4.6 9 10 3" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Got it
      </button>

      <button
        className={`action-btn${msg.feedback === 'negative' ? ' action-active-negative' : ''}`}
        onClick={() => { onFeedback(msg.id, 'negative'); onNegativeFollowUp() }}
        disabled={msg.feedback != null}
        title="I didn't understand this"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Don't get it
      </button>

      <button className="action-btn" onClick={onRetry} disabled={!canRetry} title="Regenerate response">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M10 6a4 4 0 11-1.17-2.83M10 1.5V3.5H8"
            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Retry
      </button>
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

export default function ChatPanel({
  activeTopic, messages, isSending, onSend,
  onFeedback, onRetry, prefill, onPrefillConsumed,
}: Props) {
  const [input, setInput] = useState('')
  const taRef     = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Single auto-size path for ALL input changes (typing, prefill, seeds) —
  // runs after React commits the value, so scrollHeight is measured correctly
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, TEXTAREA_MAX_H) + 'px'
  }, [input])

  // Seed the input box (weak-spot practice, re-explain suggestions) — editable, never auto-sent
  useEffect(() => {
    if (!prefill) return
    setInput(prefill)
    onPrefillConsumed()
    taRef.current?.focus()
  }, [prefill])

  const seedInput = (text: string) => {
    setInput(text)
    taRef.current?.focus()
  }

  const submit = () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return
    onSend(trimmed)
    setInput('')
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
        <span className="chat-rag-label">RAG powered study tool1</span>

        <div className="chat-scope-wrap">
          <span className="chat-scope-label">Studying</span>
          <span className="scope-chip active">{activeTopic}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-mark">
              <svg width="46" height="46" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect x="7.5" y="4.5" width="14" height="18" rx="2.5"
                  fill="var(--accent-text)" opacity="0.16"
                  transform="rotate(6 14.5 13.5)" />
                <rect x="6" y="5" width="14" height="18" rx="2.5"
                  fill="var(--accent)" opacity="0.38" />
                <path d="M9.5 10.5h7M9.5 14h7M9.5 17.5h4"
                  stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            {activeTopic ? (
              <>
                <h2 className="chat-empty-title">Start with a question.</h2>
                <p className="chat-empty-sub">
                  Ask anything about your {activeTopic} notes —
                  every answer cites the pages it came from.
                </p>
              </>
            ) : (
              <>
                <h2 className="chat-empty-title">A blank page, for now.</h2>
                <p className="chat-empty-sub">
                  Create a topic and upload a document to begin studying.
                </p>
              </>
            )}
          </div>
        )}
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="message message-user">
              <div className="user-bubble">
                <MessageMarkdown content={msg.content} />
              </div>
            </div>
          ) : (
            <div key={msg.id} className="message message-assistant">
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
                    <MessageMarkdown content={msg.content} />
                  </div>
                  {Array.isArray(msg.citations) && (
                    <SourcesSection citations={msg.citations} />
                  )}
                  {!msg.isStreaming && (
                    <MessageActions
                      msg={msg}
                      canRetry={!isSending}
                      onFeedback={onFeedback}
                      onRetry={() => onRetry(i)}
                      onNegativeFollowUp={() => seedInput('Can you explain that differently as if you were teaching me? I still don\'t get it.')}
                    />
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Input */}
      <form className="chat-input-wrap" onSubmit={onSubmit}>
        <div className="chat-input-box">
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
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
