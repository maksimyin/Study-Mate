import { useEffect, useState } from 'react'
import DocumentPanel from './DocumentPanel'
import ChatPanel from './ChatPanel'
import type { Citation, Document, Message } from '../types'

const TOPICS = ['AP Bio', 'Calc BC', 'US History']

export default function StudyView() {
  const [activeTopics, setActiveTopics] = useState<string[]>(['AP Bio'])
  const [scopeTopics,  setScopeTopics]  = useState<string[]>(['AP Bio'])
  const [docs, setDocs]                 = useState<Document[]>([])
  const [messages, setMessages]         = useState<Message[]>([])
  const [isSending, setIsSending]       = useState(false)

  useEffect(() => {
    fetch('/api/documents')
      .then(r => r.json())
      .then((data: { documents: Document[] }) => setDocs(data.documents))
      .catch(console.error)
  }, [])

  const toggleTopic = (t: string) =>
    setActiveTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const toggleScope = (t: string) =>
    setScopeTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const handleUpload = async (file: File) => {
    const tempId = Date.now().toString()
    let realId = tempId

    setDocs(prev => [{
      id: tempId,
      name: file.name,
      topic: activeTopics[0] ?? 'General',
      pages: 0,
      uploadedAt: 'just now',
      status: 'processing',
      injested: false,
    }, ...prev])

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('topic', activeTopics[0] ?? 'General')

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
    } catch {
      setDocs(prev => prev.map(d => d.id === realId ? { ...d, status: 'failed' } : d))
    }
  }

  const handleChatInput = async (content: string) => {
    if (isSending) return
    setIsSending(true)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    }
    const assistantId = (Date.now() + 1).toString()

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', isStreaming: true },
    ])

    // Network chunks arrive in bursts. Buffer incoming text and drain at a
    // fixed visual rate so text types out smoothly instead of appearing in blocks.
    let pendingBuffer = ''    // received but not yet displayed
    let displayedContent = '' // currently visible in the UI
    let streamComplete = false

    const finalize = (errorFallback?: string) => {
      clearInterval(intervalId)

      let finalContent = errorFallback ?? displayedContent
      let citations: Citation[] = []

      if (!errorFallback) {
        const marker = 'SOURCES_JSON:'
        const idx = finalContent.lastIndexOf(marker)
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

    // Drain 3 chars per 20ms tick (~150 chars/sec) — enough for smooth
    // visible typing. Jumps to 12 chars/tick when the buffer is large
    // to catch up at the end of long responses without visible lag.
    let intervalId = 0
    intervalId = window.setInterval(() => {
      if (pendingBuffer.length > 0) {
        const chunkSize = pendingBuffer.length > 200 ? 12 : 3
        const chunk = pendingBuffer.slice(0, chunkSize)
        pendingBuffer = pendingBuffer.slice(chunkSize)
        displayedContent += chunk
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: displayedContent } : m)
        )
      } else if (streamComplete) {
        finalize()
      }
    }, 20)

    try {
      const apiMessages = [...messages, userMsg]
        .filter(m => !m.isStreaming && m.content.trim() !== '')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
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
          if (payload === '[DONE]') break outer
          if (payload === '[ERROR]') throw new Error('Stream error from server')
          pendingBuffer += JSON.parse(payload) as string
        }
      }

      streamComplete = true // drain interval will call finalize() when buffer empties

    } catch {
      finalize('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <DocumentPanel
        topics={TOPICS}
        activeTopics={activeTopics}
        onToggleTopic={toggleTopic}
        docs={docs}
        onUpload={(f) => { void handleUpload(f) }}
      />
      <ChatPanel
        topics={TOPICS}
        scopeTopics={scopeTopics}
        onToggleScope={toggleScope}
        messages={messages}
        isSending={isSending}
        onSend={handleChatInput}
      />
    </div>
  )
}
