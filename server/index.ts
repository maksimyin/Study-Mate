import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {getDocumentProxy, extractText} from 'unpdf'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT =
  'You are StudyMate, an AI study assistant. Help students understand their study materials clearly and concisely using the information provided. ' +
  'Break down complex concepts, use examples where helpful, and be direct. ' +
  'Use markdown to structure responses: ## for section headers, **bold** for key terms, bullet points or numbered lists for sequences, and tables for comparisons. ' +
  'When context is provided, answer from it. After relevant statements, place a numbered inline citation like [1] or [2]. ' +
  'At the very end of your response, on its own line with no other text, output the citations as JSON in exactly this format:\n' +
  'SOURCES_JSON:[{"id":"1","filename":"file.pdf","page":3,"chunk_index":4,"char_offset":1820},{"id":"2","filename":"other.pdf","page":7,"chunk_index":11,"char_offset":5340}]\n' +
  'Copy chunk_index and char_offset exactly as they appear in the context metadata headers. ' +
  'Only include sources that were actually cited. Omit the SOURCES_JSON line entirely if no context was used. ' +
  'If the context does not cover the question, answer from general knowledge and say so.'

// ── In-memory document store ──────────────────────────────────
interface StoredDoc {
  id: string
  name: string,
  filePath: string,
  topic: string
  pages: number
  uploadedAt: string
  status: 'ready' | 'processing' | 'failed',
  injested: boolean
}
const documents: StoredDoc[] = []

interface Chunk {
  docId: string
  text: string
  textWithMeta: string
  embedding: number[]
  page: number
  topic: string
  filename: string
  chunk_index: number   // position of this chunk within the document
  char_offset: number   // document-level character offset of chunk start
}
const chunkStore = new Map<string, Chunk[]>()

async function embedBatch(texts: string[]): Promise<number[][]> {
  const BATCH = 100
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts.slice(i, i + BATCH),
    })
    results.push(...response.data.map(d => d.embedding))
  }
  return results
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

async function retrieveTopChunks(query: string, topK = 5, fetchK = 10): Promise<Chunk[]> {
  const allChunks: Chunk[] = []
  for (const chunks of chunkStore.values()) allChunks.push(...chunks)
  if (allChunks.length === 0) return []

  const [queryEmbedding] = await embedBatch([query])

  // Score and take the top fetchK individual chunks
  const scored = allChunks
    .map(chunk => ({ chunk, score: dotProduct(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, fetchK)

  // Group by (docId, page); rank each group by its single best chunk score
  const pageGroups = new Map<string, { bestScore: number; chunks: Chunk[] }>()
  for (const { chunk, score } of scored) {
    const key = `${chunk.docId}::${chunk.page}`
    const group = pageGroups.get(key)
    if (!group) {
      pageGroups.set(key, { bestScore: score, chunks: [chunk] })
    } else {
      if (score > group.bestScore) group.bestScore = score
      group.chunks.push(chunk)
    }
  }

  // Sort groups by best score, take up to topK unique pages
  return [...pageGroups.values()]
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, topK)
    .map(({ chunks }) => {
      // Sort constituent chunks by chunk_index so combined text reads in order
      const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index)
      const first = sorted[0]
      const combinedText = sorted.map(c => c.text).join('\n')
      return {
        ...first,
        text: combinedText,
        textWithMeta:
          `[Subject: ${first.topic} | Source: ${first.filename} | Page ${first.page} | ChunkIdx: ${first.chunk_index} | CharOffset: ${first.char_offset}]\n` +
          combinedText,
      }
    })
}

function chunkText(text: string, maxChars = 1000): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  for (const sep of ['\n\n', '\n', '. ', ' ']) {
    const idx = trimmed.lastIndexOf(sep, maxChars)
    if (idx > 0) {
      const head = trimmed.slice(0, idx + sep.length).trim()
      const tail = trimmed.slice(idx + sep.length)
      return [...(head ? [head] : []), ...chunkText(tail, maxChars)]
    }
  }

  return [trimmed.slice(0, maxChars), ...chunkText(trimmed.slice(maxChars), maxChars)]
}

// ── File storage ──────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
})
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } })

function pdfPageCount(buf: Buffer): number {
  const text = buf.toString('latin1')
  const match = text.match(/\/Count\s+(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

// ── API routes ────────────────────────────────────────────────
app.get('/api/documents', (_req, res) => {
  res.json({ documents })
})

app.post('/api/upload', upload.single('file'), (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const topic = (req.body.topic as string) || 'General'
  const id = Date.now().toString()

  let pages = 0
  if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
    try {
      pages = pdfPageCount(fs.readFileSync(file.path))
    } catch { /* leave as 0 */ }
  }

  const doc: StoredDoc = {
    id,
    name: file.originalname,
    filePath: file.path,
    topic,
    pages,
    uploadedAt: 'just now',
    status: 'ready',
    injested: false,
  }

  documents.unshift(doc)
  res.json({ document: doc })
})

app.post('/api/injest', async (req, res) => {
  const { documentId } = req.body as { documentId: string }
  console.log('Injest request for documentId:', documentId)
  const allDocs = documents.map(d =>{
    console.log('Document:', {
      id: d.id,
      name: d.name,
      topic: d.topic
    })
  })
  const doc = documents.find(d => d.id === documentId)

  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }

  doc.status = 'processing'

  try {
    const buffer = fs.readFileSync(doc.filePath)
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: false })

    const pages: string[] = Array.isArray(text) ? text : [text as string]
    const chunks: Chunk[] = []

    let docCharOffset = 0
    let docChunkIndex = 0

    pages.forEach((pageText, i) => {
      const pageNum = i + 1
      const rawChunks = chunkText(pageText)
      let searchFrom = 0

      for (const raw of rawChunks) {
        // Locate this chunk sequentially within the page text
        const probe = raw.slice(0, Math.min(raw.length, 60))
        const localIdx = pageText.indexOf(probe, searchFrom)
        const localOffset = localIdx >= 0 ? localIdx : searchFrom
        const char_offset = docCharOffset + localOffset

        chunks.push({
          docId: doc.id,
          text: raw,
          textWithMeta:
            `[Subject: ${doc.topic} | Source: ${doc.name} | Page ${pageNum} | ChunkIdx: ${docChunkIndex} | CharOffset: ${char_offset}]\n${raw}`,
          embedding: [],
          page: pageNum,
          topic: doc.topic,
          filename: doc.name,
          chunk_index: docChunkIndex,
          char_offset,
        })

        searchFrom = localOffset + raw.length
        docChunkIndex++
      }

      docCharOffset += pageText.length
    })

    const embeddings = await embedBatch(chunks.map(c => c.textWithMeta))
    chunks.forEach((c, i) => { c.embedding = embeddings[i] })

    chunkStore.set(doc.id, chunks)
    doc.injested = true
    doc.status = 'ready'

    res.json({ ok: true, chunks: chunks.length, chunksSample: chunks.slice(0, 3) })
  } catch (err) {
    doc.status = 'failed'
    console.error('Ingest error:', err)
    res.status(500).json({ error: 'Failed to ingest document' })
  }
})

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const topChunks = await retrieveTopChunks(latestUserMessage)

    const systemPrompt = topChunks.length === 0
      ? SYSTEM_PROMPT
      : SYSTEM_PROMPT + '\n\n--- Retrieved Context ---\n' +
        topChunks.map(c => c.textWithMeta).join('\n\n') +
        '\n--- End Context ---'

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      stream: true,
      system: systemPrompt,
      messages,
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify(event.delta.text)}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('Anthropic stream error:', err)
    res.write('data: [ERROR]\n\n')
    res.end()
  }
})

// ── Serve built client in production ─────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(process.cwd(), 'dist/client')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
