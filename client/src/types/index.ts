export type View = 'study' | 'progress'

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'

export interface ConceptActivity {
  subtopic: string
  askCount: number
  lastAskedAt: string
  dominantCognitiveLevel: BloomLevel | null
  recencyScore: number
}

export interface WeakSpot {
  subtopic: string
  subject: string
  askCount: number
  confusionRate: number
  weaknessScore: number
  dominantCognitiveLevel: BloomLevel | null
  status: 'active' | 'revisit'
}

export interface ProgressData {
  summary: {
    totalAsksThisWeek: number
    totalEvents: number
    weakSpotCount: number
    avgCognitiveLevel: BloomLevel
  }
  topicActivity: ConceptActivity[]
  weakSpots: WeakSpot[]
  cognitiveDistribution: Record<BloomLevel, number>
  dailyCounts: Array<{ day: string; count: number }>
}

export type DocStatus = 'ready' | 'processing' | 'indexing' | 'failed'

export interface Document {
  id: string
  name: string
  subject: string
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
  content?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  chunksRetrieved?: number
  isStreaming?: boolean
  feedback?: 'positive' | 'negative' | null
}

export interface Conversation {
  id: string
  subject: string
  title: string
  createdAt: string
  excludedDocIds: string[]
}
