import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

const SYSTEM_PROMPT =
  'You are StudyMate, an AI study assistant. Help students understand their study materials clearly and concisely. ' +
  'Break down complex concepts, use examples where helpful, and be direct. ' +
  'Use markdown to structure responses: ## for section headers, **bold** for key terms, bullet points or numbered lists for sequences, and tables for comparisons. ' +
  'In a later phase you will receive retrieved document chunks as context — for now answer from general knowledge.'

// ── In-memory document store ──────────────────────────────────
interface StoredDoc {
  id: string
  name: string
  topic: string
  pages: number
  uploadedAt: string
  status: 'ready' | 'processing' | 'failed'
}
const documents: StoredDoc[] = []

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
    topic,
    pages,
    uploadedAt: 'just now',
    status: 'ready',
  }

  documents.unshift(doc)
  res.json({ document: doc })
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
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512, //when phase 4 is complete we can play around with token usage more
      stream: true,
      system: SYSTEM_PROMPT,
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
