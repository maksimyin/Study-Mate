export type View = 'study' | 'progress'

export type DocStatus = 'ready' | 'processing' | 'indexing' | 'failed'

export interface Document {
  id: string
  name: string
  topic: string
  pages: number
  uploadedAt: string
  status: DocStatus
  injested: boolean
}

export interface Citation {
  id: string
  filename: string
  page: number
  chunk_index: number
  char_offset: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  chunksRetrieved?: number
  isStreaming?: boolean
}
