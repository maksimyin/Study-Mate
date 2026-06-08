import { useEffect, useRef, useState } from 'react'
import './DocumentPanel.css'
import type { Document } from '../types'

interface Props {
  topics: string[]
  activeTopic: string
  onTopicChange: (t: string) => void
  onAddTopic: (name: string) => void
  docs: Document[]
  onUpload: (file: File) => void
}

function ExtBadge({ name }: { name: string }) {
  const ext = (name.split('.').pop() ?? 'file').toLowerCase()
  const cls = ext === 'pdf' ? 'ext-badge-pdf' : ext === 'md' ? 'ext-badge-md' : 'ext-badge-default'
  return <div className={`ext-badge ${cls}`}>{ext}</div>
}

function ProcessingBar() {
  return <div className="processing-bar shimmer-track" />
}

function TopicDropdown({
  topics, activeTopic, onTopicChange, onAddTopic,
}: {
  topics: string[]; activeTopic: string
  onTopicChange: (t: string) => void; onAddTopic: (name: string) => void
}) {
  const [isOpen,        setIsOpen]        = useState(false)
  const [isAdding,      setIsAdding]      = useState(false)
  const [newTopicInput, setNewTopicInput] = useState('')
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setIsAdding(false)
        setNewTopicInput('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Focus input when adding mode opens
  useEffect(() => {
    if (isAdding) inputRef.current?.focus()
  }, [isAdding])

  const select = (t: string) => {
    onTopicChange(t)
    setIsOpen(false)
    setIsAdding(false)
    setNewTopicInput('')
  }

  const confirmNew = () => {
    const name = newTopicInput.trim()
    if (name) onAddTopic(name)
    setIsAdding(false)
    setNewTopicInput('')
    setIsOpen(false)
  }

  return (
    <div className="topic-dropdown-wrap" ref={wrapRef}>
      <button
        className={`topic-trigger${isOpen ? ' open' : ''}`}
        onClick={() => { setIsOpen(o => !o); setIsAdding(false); setNewTopicInput('') }}
      >
        <span className="topic-trigger-label">{activeTopic || '—'}</span>
        <svg
          className={`topic-chevron${isOpen ? ' open' : ''}`}
          width="10" height="10" viewBox="0 0 10 10" fill="none"
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="topic-dropdown">
          {topics.map(t => (
            <button
              key={t}
              className={`topic-dropdown-item${activeTopic === t ? ' active' : ''}`}
              onClick={() => select(t)}
            >
              <span className="topic-check">
                {activeTopic === t && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5.2L3.7 7.5 8.5 2" stroke="#6EE7B7"
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {t}
            </button>
          ))}

          {topics.length > 0 && <div className="topic-dropdown-divider" />}

          {isAdding ? (
            <div className="topic-new-row">
              <input
                ref={inputRef}
                value={newTopicInput}
                onChange={e => setNewTopicInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  confirmNew()
                  if (e.key === 'Escape') { setIsAdding(false); setNewTopicInput('') }
                }}
                placeholder="Topic name…"
                className="topic-new-input"
              />
              <button onClick={confirmNew}
                className="topic-new-btn topic-new-confirm"
                disabled={!newTopicInput.trim()}>✓</button>
              <button onClick={() => { setIsAdding(false); setNewTopicInput('') }}
                className="topic-new-btn topic-new-cancel">✕</button>
            </div>
          ) : (
            <button
              className="topic-dropdown-item topic-dropdown-add"
              onClick={() => setIsAdding(true)}
            >
              <span className="topic-check" />
              + New topic
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function DocumentPanel({ topics, activeTopic, onTopicChange, onAddTopic, docs, onUpload }: Props) {
  const [isDragOver,    setIsDragOver]    = useState(false)
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const [newIds,        setNewIds]        = useState<Set<string>>(new Set())
  const prevRef     = useRef<Document[]>(docs)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddTopicAndUpload = (name: string) => {
    onAddTopic(name)
    // Brief delay lets React commit the activeTopic state before the file picker opens
    setTimeout(() => fileInputRef.current?.click(), 120)
  }

  useEffect(() => {
    const prev    = prevRef.current
    const prevIds = new Set(prev.map(d => d.id))

    docs.forEach(doc => {
      if (!prevIds.has(doc.id)) {
        setNewIds(s => new Set([...s, doc.id]))
        setTimeout(() => setNewIds(s => { const n = new Set(s); n.delete(doc.id); return n }), 500)
      }
      const pd = prev.find(d => d.id === doc.id)
      if ((pd?.status === 'processing' || pd?.status === 'indexing') && doc.status === 'ready') {
        setJustCompleted(s => new Set([...s, doc.id]))
        setTimeout(() => setJustCompleted(s => { const n = new Set(s); n.delete(doc.id); return n }), 1800)
      }
    })

    prevRef.current = docs
  }, [docs])

  const canUpload = activeTopic !== ''

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (!canUpload) return
    const f = e.dataTransfer.files[0]
    if (f) onUpload(f)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUpload(f)
    e.target.value = ''
  }

  const readyCount = docs.filter(d => d.status === 'ready').length

  return (
    <aside className="doc-panel">

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.md,.txt"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="doc-panel-header">
        <span className="doc-panel-title">Documents</span>
        <span className="doc-count-badge">{docs.length} files · {readyCount} ready</span>
      </div>

      {/* Topic dropdown */}
      <div className="doc-topic-row">
        <span className="doc-topic-title">Topic</span>
        <TopicDropdown
          topics={topics}
          activeTopic={activeTopic}
          onTopicChange={onTopicChange}
          onAddTopic={handleAddTopicAndUpload}
        />
      </div>

      {/* Upload zone */}
      <div
        onClick={() => { if (canUpload) fileInputRef.current?.click() }}
        onDragOver={e => { e.preventDefault(); if (canUpload) setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`upload-zone${isDragOver ? ' drag-over' : ''}${!canUpload ? ' upload-zone-disabled' : ''}`}
      >
        <div className="upload-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 10.5V3M8 3L5.5 5.5M8 3l2.5 2.5"
              stroke={isDragOver ? '#6EE7B7' : '#555555'}
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d="M2.5 11.5v1a1 1 0 001 1h9a1 1 0 001-1v-1"
              stroke={isDragOver ? '#6EE7B7' : '#555555'}
              strokeWidth="1.4" strokeLinecap="round"
            />
          </svg>
        </div>

        <div>
          <p className="upload-label">
            {!canUpload
              ? 'Create a topic first'
              : isDragOver ? 'Release to upload' : 'Drop files or click to browse'}
          </p>
          {canUpload ? (
            docs.length === 0
              ? <p className="upload-hint upload-hint-warn">Upload a document to save this topic</p>
              : <p className="upload-hint">Tagged to {activeTopic} · 1 GB max</p>
          ) : (
            <p className="upload-hint">Use "+ New topic" above to get started</p>
          )}
        </div>

        <div className="upload-ext-row">
          {['.pdf', '.md', '.txt'].map(ext => (
            <span key={ext} className="upload-ext-chip">{ext}</span>
          ))}
        </div>
      </div>

      {/* File list scoped to active topic */}
      <div className="doc-files-section">
        <p className="doc-files-label">Uploaded files</p>
        <div className="file-list">
          {docs.map(doc => {
            const isNew  = newIds.has(doc.id)
            const isDone = justCompleted.has(doc.id)

            const cardCls = [
              'file-card',
              doc.status === 'ready' && !isDone ? 'ready' : '',
              isDone ? 'just-done animate-glow-ok' : '',
              isNew  ? 'file-card-new' : '',
              doc.status === 'processing' || doc.status === 'indexing' ? 'processing' : '',
            ].filter(Boolean).join(' ')

            return (
              <div key={doc.id} className={cardCls}>
                <ExtBadge name={doc.name} />

                <div className="file-info">
                  <div className="file-name">{doc.name}</div>
                  <div className="file-meta">{doc.subject} · {doc.pages}p · {doc.uploadedAt}</div>
                  {(doc.status === 'processing' || doc.status === 'indexing') && <ProcessingBar />}
                </div>

                {isDone ? (
                  <span className="status-done-icon animate-check-pop">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5.2L3.7 7.5 8.5 2" stroke="#3ecf8e" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                ) : doc.status === 'ready' ? (
                  <span className="status-badge status-ready">ready</span>
                ) : doc.status === 'processing' ? (
                  <span className="status-badge status-processing">uploading</span>
                ) : doc.status === 'indexing' ? (
                  <span className="status-badge status-processing">indexing</span>
                ) : (
                  <span className="status-badge status-failed">failed</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
