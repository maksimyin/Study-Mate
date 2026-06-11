import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './DocumentPanel.css'
import type { Conversation, Document } from '../types'

const SHEET_HANDLE_H  = 54  // collapsed sheet = just the grab handle
const DRAG_THRESHOLD  = 40  // px of travel before a drag commits open/close

interface Props {
  topics: string[]
  activeTopic: string
  onTopicChange: (t: string) => void
  onAddTopic: (name: string) => void
  onDeleteTopic: (name: string) => void
  docs: Document[]
  onUpload: (file: File) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  excludedDocIds: string[]
  onToggleDocScope: (id: string) => void
  conversations: Conversation[]
  activeConversation: Conversation | null
  onConversationChange: (c: Conversation) => void
  onNewChat: () => void
  onRenameChat: (id: string, title: string) => void
  onDeleteChat: (id: string) => void
}

interface PendingDelete {
  kind: 'doc' | 'chat' | 'topic'
  id: string
  label: string
}

function ConfirmDialog({
  pending, onCancel, onConfirm,
}: {
  pending: PendingDelete
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const title =
    pending.kind === 'doc'   ? 'Delete document?' :
    pending.kind === 'chat'  ? 'Delete chat?'     : 'Delete topic?'

  const detail =
    pending.kind === 'doc'
      ? 'will be removed along with its indexed pages. Existing chat messages stay as they are.'
    : pending.kind === 'chat'
      ? 'and all of its messages will be permanently deleted.'
      : 'will be deleted along with all of its documents, chats, and progress history.'

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-msg">
          <strong className="confirm-name">{pending.label}</strong> {detail}
        </p>
        <div className="confirm-actions">
          <button ref={cancelRef} className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-btn confirm-btn-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2.2 3.6h8.6M5.2 3.6V2.7a.8.8 0 01.8-.8h1a.8.8 0 01.8.8v.9M3.5 3.6l.5 6.7a1 1 0 001 .9h3a1 1 0 001-.9l.5-6.7"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.4 5.7v3.2M7.6 5.7v3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
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
  topics, activeTopic, onTopicChange, onAddTopic, onDeleteTopic,
}: {
  topics: string[]; activeTopic: string
  onTopicChange: (t: string) => void; onAddTopic: (name: string) => void
  onDeleteTopic: (name: string) => void
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
            <div
              key={t}
              className={`topic-dropdown-item${activeTopic === t ? ' active' : ''}`}
              onClick={() => select(t)}
            >
              <span className="topic-check">
                {activeTopic === t && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5.2L3.7 7.5 8.5 2" stroke="#059669"
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="topic-item-label">{t}</span>
              <button
                className="file-ctrl file-ctrl-delete row-del"
                onClick={e => { e.stopPropagation(); onDeleteTopic(t) }}
                title="Delete topic"
              >
                <TrashIcon />
              </button>
            </div>
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

export default function DocumentPanel({
  topics, activeTopic, onTopicChange, onAddTopic, onDeleteTopic, docs, onUpload, onRename,
  onDelete, excludedDocIds, onToggleDocScope,
  conversations, activeConversation, onConversationChange, onNewChat, onRenameChat, onDeleteChat,
}: Props) {
  const [isDragOver,    setIsDragOver]    = useState(false)
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set())
  const [newIds,        setNewIds]        = useState<Set<string>>(new Set())
  const [renameId,      setRenameId]      = useState<string | null>(null)
  const [renameValue,   setRenameValue]   = useState('')
  // Click trash → confirm dialog; nothing is deleted until the user says yes
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const prevRef        = useRef<Document[]>(docs)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const confirmPendingDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'doc')       onDelete(pendingDelete.id)
    else if (pendingDelete.kind === 'chat') onDeleteChat(pendingDelete.id)
    else                                    onDeleteTopic(pendingDelete.id)
    setPendingDelete(null)
  }

  // ── Chat sheet (springy bottom drawer) ──────────────────────
  const [sheetOpen, setSheetOpen] = useState(() => localStorage.getItem('chatSheetOpen') === '1')
  const [openH,     setOpenH]     = useState(320)
  const [sheetH,    setSheetH]    = useState<number | null>(null)  // live height while dragging
  const [dragging,  setDragging]  = useState(false)
  const [renameChatId,    setRenameChatId]    = useState<string | null>(null)
  const [renameChatValue, setRenameChatValue] = useState('')
  const [showScrollHint,  setShowScrollHint]  = useState(false)
  const panelRef        = useRef<HTMLElement>(null)
  const sheetRef        = useRef<HTMLDivElement>(null)
  const filesRef        = useRef<HTMLDivElement>(null)
  const chatListRef     = useRef<HTMLDivElement>(null)
  const chatRenameRef   = useRef<HTMLInputElement>(null)
  const dragInfo        = useRef<{ startY: number; startH: number; moved: boolean } | null>(null)

  const maxOpenHeight = () => {
    const panel = panelRef.current
    return panel ? Math.max(panel.clientHeight - 170, 240) : 400
  }

  // Open height = remaining space directly below the documents content
  const computeOpenHeight = () => {
    const panel = panelRef.current
    const files = filesRef.current
    if (!panel) return 320
    const panelRect = panel.getBoundingClientRect()
    let h = panelRect.height * 0.45
    if (files) {
      const filesTop = files.getBoundingClientRect().top - panelRect.top
      h = panelRect.height - filesTop - files.scrollHeight
    }
    return Math.min(Math.max(h, 240), maxOpenHeight())
  }

  const persistSheet = (open: boolean) => localStorage.setItem('chatSheetOpen', open ? '1' : '0')
  const openSheet  = () => { setOpenH(computeOpenHeight()); setSheetOpen(true); persistSheet(true) }
  const closeSheet = () => { setSheetOpen(false); persistSheet(false) }
  const toggleSheet = () => { sheetOpen ? closeSheet() : openSheet() }

  // Restore persisted open state with a correct measured height before paint
  useLayoutEffect(() => {
    if (sheetOpen) setOpenH(computeOpenHeight())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-measure while open as docs/chats change underneath
  useEffect(() => {
    if (sheetOpen && !dragging) setOpenH(computeOpenHeight())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, conversations.length])

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = sheetRef.current?.getBoundingClientRect().height ?? SHEET_HANDLE_H
    dragInfo.current = { startY: e.clientY, startH: h, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragInfo.current
    if (!d) return
    const dy = d.startY - e.clientY
    if (!d.moved && Math.abs(dy) > 4) { d.moved = true; setDragging(true) }
    if (d.moved) {
      setSheetH(Math.min(Math.max(d.startH + dy, SHEET_HANDLE_H), maxOpenHeight()))
    }
  }

  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragInfo.current
    dragInfo.current = null
    setDragging(false)
    setSheetH(null)
    if (!d) return
    if (!d.moved) { toggleSheet(); return }
    const dy = d.startY - e.clientY
    if (!sheetOpen && dy >  DRAG_THRESHOLD) openSheet()
    else if (sheetOpen && dy < -DRAG_THRESHOLD) closeSheet()
    // otherwise: springs back to its current state
  }

  const updateScrollHint = () => {
    const el = chatListRef.current
    if (!el || !sheetOpen) { setShowScrollHint(false); return }
    const overflowing = el.scrollHeight > el.clientHeight + 4
    const atBottom    = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
    setShowScrollHint(conversations.length > 5 && overflowing && !atBottom)
  }

  useEffect(updateScrollHint, [conversations, sheetOpen, openH])

  useEffect(() => {
    if (renameChatId) chatRenameRef.current?.focus()
  }, [renameChatId])

  const commitChatRename = () => {
    if (!renameChatId) return
    const title = renameChatValue.trim()
    const original = conversations.find(c => c.id === renameChatId)?.title
    if (title && title !== original) onRenameChat(renameChatId, title)
    setRenameChatId(null)
    setRenameChatValue('')
  }

  useEffect(() => {
    if (renameId) renameInputRef.current?.focus()
  }, [renameId])

  const commitRename = () => {
    if (!renameId) return
    const name = renameValue.trim()
    const original = docs.find(d => d.id === renameId)?.name
    if (name && name !== original) onRename(renameId, name)
    setRenameId(null)
    setRenameValue('')
  }

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

  const readyCount   = docs.filter(d => d.status === 'ready').length
  const isProcessing = docs.some(d => d.status === 'processing' || d.status === 'indexing')

  return (
    <aside className="doc-panel" ref={panelRef}>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
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
          onDeleteTopic={name => setPendingDelete({ kind: 'topic', id: name, label: name })}
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
        {/* Marching-ants outline, visible only on drag-over */}
        <svg className="upload-ants" aria-hidden="true">
          <rect />
        </svg>

        <div className={`upload-icon-wrap${isProcessing ? ' floating' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 10.5V3M8 3L5.5 5.5M8 3l2.5 2.5"
              stroke={isDragOver ? '#059669' : '#6B6B6B'}
              strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d="M2.5 11.5v1a1 1 0 001 1h9a1 1 0 001-1v-1"
              stroke={isDragOver ? '#059669' : '#6B6B6B'}
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
              : <p className="upload-hint">Tagged to {activeTopic} · 25 MB max</p>
          ) : (
            <p className="upload-hint">Create a new topic above to get started</p>
          )}
        </div>

        <div className="upload-ext-row">
          {['.pdf'].map(ext => (
            <span key={ext} className="upload-ext-chip">{ext}</span>
          ))}
          
        </div>
      </div>

      {/* File list scoped to active topic */}
      <div className="doc-files-section" ref={filesRef}>
        <div className="doc-files-label-row">
          <p className="doc-files-label">Uploaded files</p>
          {excludedDocIds.length > 0 && (
            <span className="files-muted-hint">
              {excludedDocIds.length} muted in this chat
            </span>
          )}
        </div>
        <div className="file-list">
          {docs.map(doc => {
            const isNew   = newIds.has(doc.id)
            const isDone  = justCompleted.has(doc.id)
            const isMuted = excludedDocIds.includes(doc.id)

            const cardCls = [
              'file-card',
              doc.status === 'ready' && !isDone ? 'ready' : '',
              isDone ? 'just-done' : '',
              isNew  ? 'file-card-new' : '',
              isMuted ? 'file-card-muted' : '',
              doc.status === 'processing' || doc.status === 'indexing' ? 'processing' : '',
            ].filter(Boolean).join(' ')

            return (
              <div key={doc.id} className={cardCls}>
                <ExtBadge name={doc.name} />

                <div className="file-info">
                  {renameId === doc.id ? (
                    <input
                      ref={renameInputRef}
                      className="file-rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  commitRename()
                        if (e.key === 'Escape') { setRenameId(null); setRenameValue('') }
                      }}
                    />
                  ) : (
                    <div
                      className="file-name"
                      title={doc.status === 'ready' ? 'Double-click to rename' : undefined}
                      onDoubleClick={() => {
                        if (doc.status !== 'ready') return
                        setRenameId(doc.id)
                        setRenameValue(doc.name)
                      }}
                    >
                      {doc.name}
                    </div>
                  )}
                  <div className="file-meta">{doc.subject} · {doc.pages}p · {doc.uploadedAt}</div>
                  {(doc.status === 'processing' || doc.status === 'indexing') && <ProcessingBar />}
                </div>

                {isDone ? (
                  <span className="status-done-icon animate-check-pop">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5.2L3.7 7.5 8.5 2" stroke="#059669" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                ) : doc.status === 'ready' ? (
                  <div className="file-side">
                    {isMuted
                      ? <span className="status-badge status-muted">muted</span>
                      : <span className="status-badge status-ready">ready</span>}
                    <div className="file-controls">
                      <button
                        className={`file-ctrl${isMuted ? ' file-ctrl-on' : ''}`}
                        onClick={() => onToggleDocScope(doc.id)}
                        title={isMuted
                          ? 'Muted for this chat — click to include it again'
                          : 'In this chat\'s scope — click to mute it for this chat'}
                      >
                        {isMuted ? (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M1.4 6.5s1.9-3.4 5.1-3.4c1 0 1.9.33 2.6.78M11.6 6.5s-1.9 3.4-5.1 3.4c-1 0-1.9-.33-2.6-.78"
                              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            <path d="M2.3 10.7l8.4-8.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M1.4 6.5s1.9-3.4 5.1-3.4 5.1 3.4 5.1 3.4-1.9 3.4-5.1 3.4S1.4 6.5 1.4 6.5z"
                              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                            <circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                          </svg>
                        )}
                      </button>
                      <button
                        className="file-ctrl file-ctrl-delete"
                        onClick={() => setPendingDelete({ kind: 'doc', id: doc.id, label: doc.name })}
                        title="Delete document"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2.2 3.6h8.6M5.2 3.6V2.7a.8.8 0 01.8-.8h1a.8.8 0 01.8.8v.9M3.5 3.6l.5 6.7a1 1 0 001 .9h3a1 1 0 001-.9l.5-6.7"
                            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M5.4 5.7v3.2M7.6 5.7v3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : doc.status === 'processing' ? (
                  <span className="status-badge status-processing">uploading</span>
                ) : doc.status === 'indexing' ? (
                  <span className="status-badge status-processing">indexing</span>
                ) : (
                  <div className="file-side">
                    <span className="status-badge status-failed">failed</span>
                    <div className="file-controls">
                      <button
                        className="file-ctrl file-ctrl-delete"
                        onClick={() => setPendingDelete({ kind: 'doc', id: doc.id, label: doc.name })}
                        title="Remove failed upload"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2.2 3.6h8.6M5.2 3.6V2.7a.8.8 0 01.8-.8h1a.8.8 0 01.8.8v.9M3.5 3.6l.5 6.7a1 1 0 001 .9h3a1 1 0 001-.9l.5-6.7"
                            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M5.4 5.7v3.2M7.6 5.7v3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Chats — springy bottom sheet, drag or click the handle */}
      <div
        ref={sheetRef}
        className={`chat-sheet${dragging ? ' dragging' : ''}${sheetOpen ? ' open' : ''}`}
        style={{ height: sheetH ?? (sheetOpen ? openH : SHEET_HANDLE_H) }}
      >
        <div
          className="chat-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="chat-grab-pill" />
          <div className="chat-handle-row">
            <p className="doc-files-label chat-handle-label">
              Chats{conversations.length > 0 ? ` · ${conversations.length}` : ''}
            </p>
            <button
              className="chat-new-btn"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { if (!sheetOpen) openSheet(); onNewChat() }}
              disabled={!activeTopic}
              title="New chat"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1.5v8M1.5 5.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="chat-list-wrap">
          <div className="chat-list" ref={chatListRef} onScroll={updateScrollHint}>
            {conversations.map(conv =>
              renameChatId === conv.id ? (
                <input
                  key={conv.id}
                  ref={chatRenameRef}
                  className="chat-rename-input"
                  value={renameChatValue}
                  onChange={e => setRenameChatValue(e.target.value)}
                  onBlur={commitChatRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitChatRename()
                    if (e.key === 'Escape') { setRenameChatId(null); setRenameChatValue('') }
                  }}
                />
              ) : (
                <div
                  key={conv.id}
                  className={`chat-item${activeConversation?.id === conv.id ? ' active' : ''}`}
                  onClick={() => onConversationChange(conv)}
                  onDoubleClick={() => {
                    setRenameChatId(conv.id)
                    setRenameChatValue(conv.title)
                  }}
                  title="Double-click to rename"
                >
                  <span className="chat-item-title">{conv.title}</span>
                  <button
                    className="file-ctrl file-ctrl-delete row-del"
                    onClick={e => { e.stopPropagation(); setPendingDelete({ kind: 'chat', id: conv.id, label: conv.title }) }}
                    onDoubleClick={e => e.stopPropagation()}
                    title="Delete chat"
                  >
                    <TrashIcon />
                  </button>
                </div>
              )
            )}
            {conversations.length === 0 && (
              <p className="chat-list-empty">No chats yet</p>
            )}
          </div>

          {showScrollHint && (
            <div className="chat-scroll-hint" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.4"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          pending={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPendingDelete}
        />
      )}
    </aside>
  )
}
