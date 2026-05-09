import { useEffect, useRef, useState } from 'react'
import './DocumentPanel.css'
import type { Document } from '../types'

interface Props {
  topics: string[]
  activeTopics: string[]
  onToggleTopic: (t: string) => void
  docs: Document[]
  onSimulateUpload: (name: string) => void
}

const DEMO_FILES = [
  'chapter-5-thermodynamics.pdf',
  'ap-physics-waves-optics.pdf',
  'civil-rights-movement-timeline.pdf',
  'calc-series-and-sequences.pdf',
  'bio-genetics-mendel-laws.pdf',
]

function ExtBadge({ name }: { name: string }) {
  const ext = (name.split('.').pop() ?? 'file').toLowerCase()
  const cls = ext === 'pdf' ? 'ext-badge-pdf' : ext === 'md' ? 'ext-badge-md' : 'ext-badge-default'
  return (
    <div className={`ext-badge ${cls}`}>{ext}</div>
  )
}

function ProcessingBar() {
  return <div className="processing-bar shimmer-track" />
}

export default function DocumentPanel({ topics, activeTopics, onToggleTopic, docs, onSimulateUpload }: Props) {
  const [isDragOver,    setIsDragOver]    = useState(false)
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const [newIds,        setNewIds]        = useState<Set<string>>(new Set())
  const prevRef    = useRef<Document[]>(docs)
  const demoIdxRef = useRef(0)

  useEffect(() => {
    const prev    = prevRef.current
    const prevIds = new Set(prev.map(d => d.id))

    docs.forEach(doc => {
      if (!prevIds.has(doc.id)) {
        setNewIds(s => new Set([...s, doc.id]))
        setTimeout(() => setNewIds(s => { const n = new Set(s); n.delete(doc.id); return n }), 500)
      }
      const pd = prev.find(d => d.id === doc.id)
      if (pd?.status === 'processing' && doc.status === 'ready') {
        setJustCompleted(s => new Set([...s, doc.id]))
        setTimeout(() => setJustCompleted(s => { const n = new Set(s); n.delete(doc.id); return n }), 1800)
      }
    })

    prevRef.current = docs
  }, [docs])

  const triggerUpload = () => {
    const name = DEMO_FILES[demoIdxRef.current % DEMO_FILES.length]
    demoIdxRef.current++
    onSimulateUpload(name)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files[0]
    onSimulateUpload(f ? f.name : DEMO_FILES[demoIdxRef.current++ % DEMO_FILES.length])
  }

  const readyCount = docs.filter(d => d.status === 'ready').length

  return (
    <aside className="doc-panel">

      {/* Header */}
      <div className="doc-panel-header">
        <span className="doc-panel-title">Documents</span>
        <span className="doc-count-badge">{docs.length} files · {readyCount} ready</span>
      </div>

      {/* Topic chips */}
      <div className="doc-topic-row">
        <span className="doc-topic-title">Topic</span>
        {topics.map(t => (
          <button
            key={t}
            onClick={() => onToggleTopic(t)}
            className={`topic-chip${activeTopics.includes(t) ? ' active' : ''}`}
          >
            {t}
          </button>
        ))}
        <button className="topic-chip topic-chip-new">+ New</button>
      </div>

      {/* Upload zone */}
      <div
        onClick={triggerUpload}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`upload-zone${isDragOver ? ' drag-over' : ''}`}
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
            {isDragOver ? 'Release to upload' : 'Drop files or click to browse'}
          </p>
          <p className="upload-hint">Tagged to active topic · 1 GB max</p>
        </div>

        <div className="upload-ext-row">
          {['.pdf', '.md', '.txt'].map(ext => (
            <span key={ext} className="upload-ext-chip">{ext}</span>
          ))}
        </div>
      </div>

      {/* File list */}
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
              doc.status === 'processing' ? 'processing' : '',
            ].filter(Boolean).join(' ')

            return (
              <div key={doc.id} className={cardCls}>
                <ExtBadge name={doc.name} />

                <div className="file-info">
                  <div className="file-name">{doc.name}</div>
                  <div className="file-meta">{doc.topic} · {doc.pages}p · {doc.uploadedAt}</div>
                  {doc.status === 'processing' && <ProcessingBar />}
                </div>

                {isDone ? (
                  <span className="status-done-icon animate-check-pop">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5.2L3.7 7.5 8.5 2" stroke="#3ecf8e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                ) : doc.status === 'ready' ? (
                  <span className="status-badge status-ready">ready</span>
                ) : doc.status === 'processing' ? (
                  <span className="status-badge status-processing">uploading</span>
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
