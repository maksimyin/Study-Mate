export type View = 'study' | 'progress'

export type DocStatus = 'ready' | 'processing' | 'failed'

export interface Document {
  id: string
  name: string
  topic: string
  pages: number
  uploadedAt: string
  status: DocStatus
}

export interface Citation {
  id: string
  label: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  chunksRetrieved?: number
  isStreaming?: boolean
}
