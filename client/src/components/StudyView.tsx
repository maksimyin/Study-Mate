import { useState } from 'react'
import DocumentPanel from './DocumentPanel'
import ChatPanel from './ChatPanel'
import type { Document, Message } from '../types'

const TOPICS = ['AP Bio', 'Calc BC', 'US History']

const INITIAL_DOCS: Document[] = [
  { id: '1', name: 'lecture-7-cellular-respiration.pdf', topic: 'AP Bio',    pages: 12, uploadedAt: 'today', status: 'ready'      },
  { id: '2', name: 'chapter-4-limits-continuity.pdf',   topic: 'Calc BC',   pages: 8,  uploadedAt: 'today', status: 'ready'      },
  { id: '3', name: 'reconstruction-era-notes.pdf',       topic: 'US History',pages: 5,  uploadedAt: 'today', status: 'processing' },
]

const INITIAL_MESSAGES: Message[] = [
  { id: '1', role: 'user', content: 'What happens during the electron transport chain?' },
  {
    id: '2',
    role: 'assistant',
    content:
      'The electron transport chain (ETC) occurs in the inner mitochondrial membrane and is the final stage of cellular respiration. Electrons from NADH and FADH₂ pass through four protein complexes (I–IV), releasing energy at each step to pump H⁺ ions into the intermembrane space.\n\nThis creates a proton gradient that drives ATP synthase — the result is roughly 32–34 ATP per glucose molecule. Oxygen serves as the final electron acceptor, forming water.',
    chunksRetrieved: 3,
    citations: [
      { id: 'c1', label: 'lecture-7.pdf · p.4' },
      { id: 'c2', label: 'lecture-7.pdf · p.6' },
    ],
  },
  { id: '3', role: 'user', content: "What's the difference between complex I and complex II?" },
  { id: '4', role: 'assistant', content: '', chunksRetrieved: 2, isStreaming: true },
]

export default function StudyView() {
  const [activeTopics, setActiveTopics] = useState<string[]>(['AP Bio'])
  const [scopeTopics,  setScopeTopics]  = useState<string[]>(['AP Bio'])
  const [docs, setDocs]                 = useState<Document[]>(INITIAL_DOCS)
  const [messages]                      = useState<Message[]>(INITIAL_MESSAGES)

  const toggleTopic = (t: string) =>
    setActiveTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const toggleScope = (t: string) =>
    setScopeTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const simulateUpload = (name: string) => {
    const id = Date.now().toString()
    const newDoc: Document = {
      id,
      name,
      topic: activeTopics[0] ?? 'AP Bio',
      pages: Math.floor(Math.random() * 14) + 2,
      uploadedAt: 'just now',
      status: 'processing',
    }
    setDocs(prev => [newDoc, ...prev])
    setTimeout(() => {
      setDocs(prev => prev.map(d => d.id === id ? { ...d, status: 'ready' } : d))
    }, 2500)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <DocumentPanel
        topics={TOPICS}
        activeTopics={activeTopics}
        onToggleTopic={toggleTopic}
        docs={docs}
        onSimulateUpload={simulateUpload}
      />
      <ChatPanel
        topics={TOPICS}
        scopeTopics={scopeTopics}
        onToggleScope={toggleScope}
        messages={messages}
      />
    </div>
  )
}
