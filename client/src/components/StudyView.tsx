import { useEffect, useRef, useState } from 'react'
import DocumentPanel from './DocumentPanel'
import ChatPanel from './ChatPanel'
import type { Citation, Conversation, Document, Message } from '../types'
import type { PendingStudy } from '../App'

interface Props {
  pendingStudy: PendingStudy | null
  onPendingStudyConsumed: () => void
}

function readConvMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('activeConvByTopic') ?? '{}') } catch { return {} }
}

export default function StudyView({ pendingStudy, onPendingStudyConsumed }: Props) {
  const [topics,             setTopics]             = useState<string[]>([])
  const [activeTopic,        setActiveTopic]        = useState<string>('')
  const [docs,               setDocs]               = useState<Document[]>([])
  const [messages,           setMessages]           = useState<Message[]>([])
  const [isSending,          setIsSending]          = useState(false)
  const [conversations,      setConversations]      = useState<Conversation[]>([])
  // null = draft chat: nothing exists in the DB until the first prompt is sent
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [prefill,            setPrefill]            = useState('')
  // Docs muted for a draft chat — moves onto the conversation row when it materializes
  const [draftExcluded,      setDraftExcluded]      = useState<string[]>([])

  // Weak-spot practice request captured at mount (StudyView remounts on view switch)
  const pendingRef = useRef<PendingStudy | null>(pendingStudy)
  // Skip the messages refetch when a draft conversation is created mid-send
  const skipNextMessagesFetch = useRef(false)

  const createConversation = async (topic: string, excludedDocIds: string[]): Promise<Conversation | null> => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, excludedDocIds }),
      })
      if (!res.ok) return null
      const { conversation }: { conversation: Conversation } = await res.json()
      return conversation
    } catch {
      return null
    }
  }

  // Load topic list from DB on mount; pending practice request > stored topic > first
  useEffect(() => {
    fetch('/api/topics')
      .then(r => r.json())
      .then((data: { topics: string[] }) => {
        setTopics(data.topics)
        const stored = localStorage.getItem('activeTopic')
        setActiveTopic(prev =>
          prev
          || pendingRef.current?.topic
          || (stored && data.topics.includes(stored) ? stored : '')
          || data.topics[0]
          || ''
        )
      })
      .catch(() => {
        // leave topics empty — UI will show "create a topic" state
      })
  }, [])

  // Reload docs and conversations whenever the active topic changes
  useEffect(() => {
    if (!activeTopic) return
    localStorage.setItem('activeTopic', activeTopic)

    // Capture before any await — the persistence effect must not race this read
    const storedConvId = readConvMap()[activeTopic] ?? null

    fetch(`/api/documents?topic=${encodeURIComponent(activeTopic)}`)
      .then(r => r.json())
      .then((data: { documents: Document[] }) => setDocs(data.documents))
      .catch(console.error)

    setActiveConversation(null)
    setMessages([])
    setDraftExcluded([])

    ;(async () => {
      let convs: Conversation[] = []
      try {
        const res = await fetch(`/api/conversations?topic=${encodeURIComponent(activeTopic)}`)
        const data: { conversations: Conversation[] } = await res.json()
        convs = data.conversations
      } catch { /* leave empty */ }

      setConversations(convs)

      const pending = pendingRef.current
      if (pending && pending.topic === activeTopic) {
        // Weak-spot practice: open a draft with the prompt seeded — saved on send
        pendingRef.current = null
        onPendingStudyConsumed()
        setActiveConversation(null)
        setPrefill(`I keep struggling with ${pending.subtopic}. Can you explain it clearly, then quiz me on it?`)
        return
      }

      const stored = convs.find(c => c.id === storedConvId)
      setActiveConversation(stored ?? convs[0] ?? null)
    })()
  }, [activeTopic])

  // Remember the last-used chat per topic (drafts are never recorded)
  useEffect(() => {
    if (!activeConversation || !activeTopic) return
    const map = readConvMap()
    map[activeTopic] = activeConversation.id
    localStorage.setItem('activeConvByTopic', JSON.stringify(map))
  }, [activeConversation?.id])

  // Reload message history whenever the active conversation changes
  useEffect(() => {
    if (skipNextMessagesFetch.current) { skipNextMessagesFetch.current = false; return }
    if (!activeConversation) { setMessages([]); return }
    fetch(`/api/messages?conversation_id=${encodeURIComponent(activeConversation.id)}`)
      .then(r => r.json())
      .then((data: { messages: Message[] }) => setMessages(data.messages))
      .catch(console.error)
  }, [activeConversation?.id])

  const handleAddTopic = (name: string) => {
    setTopics(prev => prev.includes(name) ? prev : [...prev, name])
    setActiveTopic(name)
  }

  // New chat = local draft; the conversation row is created on first send
  const handleNewChat = () => {
    if (!activeTopic) return
    setActiveConversation(null)
    setMessages([])
    setDraftExcluded([])
  }

  // Per-chat doc scoping: toggle whether retrieval may pull from this document
  const handleToggleDocScope = async (docId: string) => {
    if (!activeConversation) {
      setDraftExcluded(prev =>
        prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId])
      return
    }
    const conv = activeConversation
    const next = conv.excludedDocIds.includes(docId)
      ? conv.excludedDocIds.filter(id => id !== docId)
      : [...conv.excludedDocIds, docId]
    const apply = (list: string[]) => {
      setActiveConversation(prev => prev && prev.id === conv.id ? { ...prev, excludedDocIds: list } : prev)
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, excludedDocIds: list } : c))
    }
    apply(next)
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(conv.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedDocIds: next }),
      })
      if (!res.ok) throw new Error('scope update failed')
    } catch {
      apply(conv.excludedDocIds)
    }
  }

  const handleDeleteDoc = async (docId: string) => {
    const prevDocs = docs
    setDocs(prev => prev.filter(d => d.id !== docId))
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      // Server scrubbed the id from every conversation's exclusions — mirror locally
      setDraftExcluded(prev => prev.filter(id => id !== docId))
      setConversations(prev => prev.map(c => ({
        ...c, excludedDocIds: c.excludedDocIds.filter(id => id !== docId),
      })))
      setActiveConversation(prev => prev
        ? { ...prev, excludedDocIds: prev.excludedDocIds.filter(id => id !== docId) }
        : prev)
    } catch {
      setDocs(prevDocs)
    }
  }

  const handleRenameChat = async (id: string, title: string) => {
    const prevConvs = conversations
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c))
    setActiveConversation(prev => prev && prev.id === id ? { ...prev, title } : prev)
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error('rename failed')
    } catch {
      setConversations(prevConvs)
    }
  }

  const handleRename = async (id: string, name: string) => {
    if (!/\.pdf$/i.test(name)) name += '.pdf'  // server enforces the same rule
    const prevDocs = docs
    setDocs(prev => prev.map(d => d.id === id ? { ...d, name } : d))
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('rename failed')
      // Server rewrote persisted citation JSON — refresh the open thread so
      // "Sources used" reflects the new filename immediately
      if (activeConversation) {
        fetch(`/api/messages?conversation_id=${encodeURIComponent(activeConversation.id)}`)
          .then(r => r.json())
          .then((data: { messages: Message[] }) => setMessages(data.messages))
          .catch(console.error)
      }
    } catch {
      setDocs(prevDocs)
    }
  }

  const handleDeleteChat = async (id: string) => {
    const prevConvs = conversations
    const remaining = conversations.filter(c => c.id !== id)
    setConversations(remaining)
    if (activeConversation?.id === id) {
      // Falls back to a draft when this was the last chat
      setActiveConversation(remaining[0] ?? null)
    }
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setConversations(prevConvs)
    }
  }

  const handleDeleteTopic = async (name: string) => {
    const prevTopics = topics
    const remaining = topics.filter(t => t !== name)
    setTopics(remaining)
    const map = readConvMap()
    delete map[name]
    localStorage.setItem('activeConvByTopic', JSON.stringify(map))
    if (activeTopic === name) {
      if (remaining[0]) {
        setActiveTopic(remaining[0])
      } else {
        localStorage.removeItem('activeTopic')
        setActiveTopic('')
        setDocs([])
        setConversations([])
        setActiveConversation(null)
        setMessages([])
        setDraftExcluded([])
      }
    }
    try {
      const res = await fetch(`/api/topics/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setTopics(prevTopics)
    }
  }

  const handleFeedback = async (messageId: string, feedback: 'positive' | 'negative') => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback } : m))
    try {
      await fetch(`/api/messages/${encodeURIComponent(messageId)}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })
    } catch (err) {
      console.error('feedback save failed:', err)
    }
  }

  const handleRetry = (index: number) => {
    if (isSending) return
    const userMsg = messages[index - 1]
    if (!userMsg || userMsg.role !== 'user') return
    setMessages(prev => prev.slice(0, index - 1))
    void handleChatInput(userMsg.content)
  }

  const handleUpload = async (file: File) => {
    // Non-PDFs never enter the UI — no optimistic row, no failed state, nothing
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) return

    const tempId = `temp-${Date.now()}`
    let realId   = tempId

    setDocs(prev => [{
      id: tempId,
      name: file.name,
      subject: activeTopic,
      pages: 0,
      uploadedAt: 'just now',
      status: 'processing',
      injested: false,
    }, ...prev])

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('topic', activeTopic)

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { document: doc }: { document: Document } = await uploadRes.json()
      realId = doc.id

      setDocs(prev => prev.map(d => d.id === tempId ? { ...doc, status: 'indexing' } : d))

      const ingestRes = await fetch('/api/injest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      })
      if (!ingestRes.ok) throw new Error('Ingest failed')

      setDocs(prev => prev.map(d => d.id === realId ? { ...d, status: 'ready', injested: true } : d))

      // Re-sync topic list now that a new doc is in the DB
      fetch('/api/topics')
        .then(r => r.json())
        .then((data: { topics: string[] }) => {
          if (data.topics.length > 0) setTopics(data.topics)
        })
        .catch(console.error)
    } catch {
      setDocs(prev => prev.map(d => d.id === realId ? { ...d, status: 'failed' } : d))
    }
  }

  const handleChatInput = async (content: string) => {
    if (isSending) return
    setIsSending(true)

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content }
    const assistantId = (Date.now() + 1).toString()
    let convId = activeConversation?.id ?? null
    let realAssistantId: string | null = null

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', isStreaming: true },
    ])

    let pendingBuffer    = ''
    let displayedContent = ''
    let streamComplete   = false

    const finalize = (errorFallback?: string) => {
      clearInterval(intervalId)

      let finalContent = errorFallback ?? displayedContent
      let citations: Citation[] = []

      if (!errorFallback) {
        const marker = 'SOURCES_JSON:'
        const idx    = finalContent.lastIndexOf(marker)
        if (idx !== -1) {
          try { citations = JSON.parse(finalContent.slice(idx + marker.length).trim()) } catch { /* ignore */ }
          finalContent = finalContent.slice(0, idx).trim()
        }
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, id: realAssistantId ?? m.id, content: finalContent, citations, isStreaming: false }
            : m
        )
      )
      setIsSending(false)
    }

    let intervalId = 0
    intervalId = window.setInterval(() => {
      if (pendingBuffer.length > 0) {
        const chunkSize = pendingBuffer.length > 200 ? 12 : 3
        const chunk     = pendingBuffer.slice(0, chunkSize)
        pendingBuffer   = pendingBuffer.slice(chunkSize)
        displayedContent += chunk
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: displayedContent } : m)
        )
      } else if (streamComplete) {
        finalize()
      }
    }, 20)

    try {
      // Draft chat: materialize the conversation row only now, on first send
      if (!convId) {
        const conv = await createConversation(activeTopic, draftExcluded)
        if (conv) {
          convId = conv.id
          skipNextMessagesFetch.current = true
          setConversations(prev => [conv, ...prev])
          setActiveConversation(conv)
          setDraftExcluded([])
        }
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          topic: activeTopic,
          conversation_id: convId,
        }),
      })

      if (!res.ok) throw new Error(`Server error ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const raw = decoder.decode(value, { stream: true })
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]')  break outer
          if (payload === '[ERROR]') throw new Error('Stream error from server')
          if (payload.startsWith('[ID]')) { realAssistantId = payload.slice(4); continue }
          if (payload.startsWith('[TITLE]')) {
            // Server named the chat after the first prompt's classified subtopic
            try {
              const title = JSON.parse(payload.slice(7)) as string
              setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c))
              setActiveConversation(prev => prev && prev.id === convId ? { ...prev, title } : prev)
            } catch { /* ignore malformed title */ }
            continue
          }
          pendingBuffer += JSON.parse(payload) as string
        }
      }

      streamComplete = true
    } catch {
      finalize('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <DocumentPanel
        topics={topics}
        activeTopic={activeTopic}
        onTopicChange={setActiveTopic}
        onAddTopic={handleAddTopic}
        onDeleteTopic={(name) => { void handleDeleteTopic(name) }}
        docs={docs}
        onUpload={(f) => { void handleUpload(f) }}
        onRename={(id, name) => { void handleRename(id, name) }}
        onDelete={(id) => { void handleDeleteDoc(id) }}
        excludedDocIds={activeConversation?.excludedDocIds ?? draftExcluded}
        onToggleDocScope={(id) => { void handleToggleDocScope(id) }}
        conversations={conversations}
        activeConversation={activeConversation}
        onConversationChange={setActiveConversation}
        onNewChat={handleNewChat}
        onRenameChat={(id, title) => { void handleRenameChat(id, title) }}
        onDeleteChat={(id) => { void handleDeleteChat(id) }}
      />
      <ChatPanel
        activeTopic={activeTopic}
        messages={messages}
        isSending={isSending}
        onSend={handleChatInput}
        onFeedback={(id, fb) => { void handleFeedback(id, fb) }}
        onRetry={handleRetry}
        prefill={prefill}
        onPrefillConsumed={() => setPrefill('')}
      />
    </div>
  )
}
