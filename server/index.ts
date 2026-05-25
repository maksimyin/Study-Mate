import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {getDocumentProxy, extractText} from 'unpdf'
import pool from './db'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })
const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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

// ── Helpers ───────────────────────────────────────────────────

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

interface RetrievedChunk {
  topic: string; filename: string; page: number
  chunk_index: number; char_offset: number; textWithMeta: string
}

async function retrieveTopChunks(query: string, topic: string, topK = 5, fetchK = 20): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embedBatch([query])
  const vec = `[${queryEmbedding.join(',')}]`

  type Row = {
    doc_id: string; topic: string; filename: string
    page: number; chunk_index: number; char_offset: number; content: string; score: number
  }

  const { rows } = await pool.query<Row>(
    `SELECT doc_id::text, topic, filename, page, chunk_index, char_offset, content,
            1 - (embedding <=> $2::vector) AS score
     FROM chunks
     WHERE topic = $1
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [topic, vec, fetchK]
  )

  if (rows.length === 0) return []

  // Group by (doc_id, page); keep best score per group
  const pageGroups = new Map<string, { bestScore: number; rows: Row[] }>()
  for (const row of rows) {
    const key = `${row.doc_id}::${row.page}`
    const group = pageGroups.get(key)
    if (!group) {
      pageGroups.set(key, { bestScore: row.score, rows: [row] })
    } else {
      if (row.score > group.bestScore) group.bestScore = row.score
      group.rows.push(row)
    }
  }

  return [...pageGroups.values()]
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, topK)
    .map(({ rows: groupRows }) => {
      const sorted = [...groupRows].sort((a, b) => a.chunk_index - b.chunk_index)
      const first = sorted[0]
      const combinedText = sorted.map(r => r.content).join('\n')
      return {
        topic: first.topic,
        filename: first.filename,
        page: first.page,
        chunk_index: first.chunk_index,
        char_offset: first.char_offset,
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

app.get('/api/topics', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT topic FROM documents ORDER BY topic`
    )
    res.json({ topics: rows.map((r: { topic: string }) => r.topic) })
  } catch (err) {
    console.error('GET /api/topics error:', err)
    res.status(500).json({ error: 'Failed to fetch topics' })
  }
})

app.get('/api/documents', async (req, res) => {
  try {
    const { topic } = req.query
    const { rows } = await pool.query(
      topic
        ? `SELECT id::text, name, topic, pages,
                  uploaded_at AS "uploadedAt", status, ingested AS "injested"
           FROM documents WHERE topic = $1 ORDER BY uploaded_at DESC`
        : `SELECT id::text, name, topic, pages,
                  uploaded_at AS "uploadedAt", status, ingested AS "injested"
           FROM documents ORDER BY uploaded_at DESC`,
      topic ? [topic] : []
    )
    res.json({ documents: rows })
  } catch (err) {
    console.error('GET /api/documents error:', err)
    res.status(500).json({ error: 'Failed to fetch documents' })
  }
})

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) { res.status(400).json({ error: 'No file provided' }); return }

    const topic = (req.body.topic as string) || 'General'

    let pages = 0
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      try { pages = pdfPageCount(fs.readFileSync(file.path)) } catch { /* leave as 0 */ }
    }

    const { rows } = await pool.query(
      `INSERT INTO documents (name, file_path, topic, pages, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING id::text, name, topic, pages,
                 uploaded_at AS "uploadedAt", status, ingested AS "injested"`,
      [file.originalname, file.path, topic, pages]
    )

    res.json({ document: rows[0] })
  } catch (err) {
    console.error('POST /api/upload error:', err)
    res.status(500).json({ error: 'Upload failed' })
  }
})

app.post('/api/injest', async (req, res) => {
  const { documentId } = req.body as { documentId: string }

  const { rows: docRows } = await pool.query(
    `SELECT id, name, file_path, topic FROM documents WHERE id = $1`,
    [documentId]
  )
  if (docRows.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
  const doc = docRows[0] as { id: number; name: string; file_path: string; topic: string }

  await pool.query(`UPDATE documents SET status = 'processing' WHERE id = $1`, [doc.id])

  try {
    const buffer = fs.readFileSync(doc.file_path)
    const pdf    = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: false })

    const pageTexts: string[] = Array.isArray(text) ? text : [text as string]

    interface RawChunk {
      topic: string; filename: string; page: number
      chunk_index: number; char_offset: number; content: string
      textWithMeta: string; embedding: number[]
    }

    const rawChunks: RawChunk[] = []
    let docCharOffset = 0
    let docChunkIndex = 0

    pageTexts.forEach((pageText, i) => {
      const pageNum = i + 1
      const rawChunkTexts = chunkText(pageText)
      let searchFrom = 0

      for (const raw of rawChunkTexts) {
        const probe      = raw.slice(0, Math.min(raw.length, 60))
        const localIdx   = pageText.indexOf(probe, searchFrom)
        const localOffset = localIdx >= 0 ? localIdx : searchFrom
        const char_offset = docCharOffset + localOffset

        rawChunks.push({
          topic: doc.topic, filename: doc.name, page: pageNum,
          chunk_index: docChunkIndex, char_offset, content: raw,
          textWithMeta:
            `[Subject: ${doc.topic} | Source: ${doc.name} | Page ${pageNum} | ChunkIdx: ${docChunkIndex} | CharOffset: ${char_offset}]\n${raw}`,
          embedding: [],
        })

        searchFrom = localOffset + raw.length
        docChunkIndex++
      }

      docCharOffset += pageText.length
    })

    const embeddings = await embedBatch(rawChunks.map(c => c.textWithMeta))
    rawChunks.forEach((c, i) => { c.embedding = embeddings[i] })

    // Batch insert chunks in a transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const BATCH = 50
      for (let i = 0; i < rawChunks.length; i += BATCH) {
        const batch = rawChunks.slice(i, i + BATCH)
        const values: unknown[] = []
        const placeholders = batch.map((c, j) => {
          const b = j * 8
          values.push(
            doc.id, c.topic, c.filename, c.page,
            c.chunk_index, c.char_offset, c.content,
            `[${c.embedding.join(',')}]`
          )
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8}::vector)`
        })
        await client.query(
          `INSERT INTO chunks (doc_id, topic, filename, page, chunk_index, char_offset, content, embedding)
           VALUES ${placeholders.join(',')}`,
          values
        )
      }

      await client.query(
        `UPDATE documents SET status = 'ready', ingested = true WHERE id = $1`,
        [doc.id]
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.json({ ok: true, chunks: rawChunks.length })
  } catch (err) {
    await pool.query(`UPDATE documents SET status = 'failed' WHERE id = $1`, [doc.id])
    console.error('Ingest error:', err)
    res.status(500).json({ error: 'Failed to ingest document' })
  }
})

app.get('/api/messages', async (req, res) => {
  try {
    const { topic } = req.query
    if (!topic || typeof topic !== 'string') {
      res.status(400).json({ error: 'topic is required' }); return
    }
    const { rows } = await pool.query(
      `SELECT id::text, role, content FROM messages
       WHERE topic = $1 ORDER BY created_at ASC`,
      [topic]
    )
    res.json({ messages: rows })
  } catch (err) {
    console.error('GET /api/messages error:', err)
    res.status(500).json({ error: 'Failed to fetch messages' })
  }
})

app.post('/api/chat', async (req, res) => {
  const { message, topic } = req.body as { message: string; topic: string }

  if (!message || !topic) {
    res.status(400).json({ error: 'message and topic are required' }); return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    // Load last 8 messages for topic context (oldest first for Claude)
    const { rows: historyRows } = await pool.query<{ role: string; content: string }>(
      `SELECT role, content FROM (
         SELECT role, content, created_at FROM messages
         WHERE topic = $1 ORDER BY created_at DESC LIMIT 8
       ) sub ORDER BY created_at ASC`,
      [topic]
    )
    const history = historyRows.map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }))

    // Persist user message before calling Claude
    await pool.query(
      `INSERT INTO messages (topic, role, content) VALUES ($1, 'user', $2)`,
      [topic, message]
    )

    const topChunks = await retrieveTopChunks(message, topic)

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
      messages: [...history, { role: 'user', content: message }],
    })

    let fullResponse = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullResponse += event.delta.text
        res.write(`data: ${JSON.stringify(event.delta.text)}\n\n`)
      }
    }

    // Strip SOURCES_JSON before saving (citations stored separately in a later phase)
    const markerIdx    = fullResponse.lastIndexOf('SOURCES_JSON:')
    const savedContent = markerIdx !== -1 ? fullResponse.slice(0, markerIdx).trim() : fullResponse

    await pool.query(
      `INSERT INTO messages (topic, role, content) VALUES ($1, 'assistant', $2)`,
      [topic, savedContent]
    )

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('Chat error:', err)
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
