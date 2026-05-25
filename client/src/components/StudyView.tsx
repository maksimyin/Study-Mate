import { useEffect, useState } from 'react'
import DocumentPanel from './DocumentPanel'
import ChatPanel from './ChatPanel'
import type { Citation, Document, Message } from '../types'

export default function StudyView() {
  const [topics,      setTopics]      = useState<string[]>([])
  const [activeTopic, setActiveTopic] = useState<string>('')
  const [docs,        setDocs]        = useState<Document[]>([])
  const [messages,    setMessages]    = useState<Message[]>([])
  const [isSending,   setIsSending]   = useState(false)

  // Load topic list from DB on mount; default to 'General' if none exist
  useEffect(() => {
    fetch('/api/topics')
      .then(r => r.json())
      .then((data: { topics: string[] }) => {
        const loaded = data.topics.length > 0 ? data.topics : ['General']
        setTopics(loaded)
        setActiveTopic(prev => prev || loaded[0])
      })
      .catch(() => {
        setTopics(['General'])
        setActiveTopic(prev => prev || 'General')
      })
  }, [])

  // Reload docs and message history whenever the active topic changes
  useEffect(() => {
    if (!activeTopic) return

    fetch(`/api/documents?topic=${encodeURIComponent(activeTopic)}`)
      .then(r => r.json())
      .then((data: { documents: Document[] }) => setDocs(data.documents))
      .catch(console.error)

    setMessages([])
    fetch(`/api/messages?topic=${encodeURIComponent(activeTopic)}`)
      .then(r => r.json())
      .then((data: { messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }> }) => {
        setMessages(data.messages.map(m => ({ id: m.id, role: m.role, content: m.content })))
      })
      .catch(console.error)
  }, [activeTopic])

  const handleAddTopic = (name: string) => {
    setTopics(prev => prev.includes(name) ? prev : [...prev, name])
    setActiveTopic(name)
  }

  const handleUpload = async (file: File) => {
    const tempId = `temp-${Date.now()}`
    let realId   = tempId

    setDocs(prev => [{
      id: tempId,
      name: file.name,
      topic: activeTopic,
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
            ? { ...m, content: finalContent, citations, isStreaming: false }
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, topic: activeTopic }),
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
        docs={docs}
        onUpload={(f) => { void handleUpload(f) }}
      />
      <ChatPanel
        activeTopic={activeTopic}
        messages={messages}
        isSending={isSending}
        onSend={handleChatInput}
      />
    </div>
  )
}
