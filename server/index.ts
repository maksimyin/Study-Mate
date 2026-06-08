import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {getDocumentProxy, extractText} from 'unpdf'
import pool from './db'
import { getProgressData } from './progressQueries'

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
  'If the context does not cover the question, answer from general knowledge and EXPLICITLY say so.'

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
  subject: string; filename: string; page: number
  chunk_index: number; char_offset: number; textWithMeta: string
}

async function retrieveTopChunks(query: string, subject: string, topK = 5, fetchK = 20): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embedBatch([query])
  const vec = `[${queryEmbedding.join(',')}]`

  type Row = {
    doc_id: string; subject: string; filename: string
    page: number; chunk_index: number; char_offset: number; content: string; score: number
  }

  const { rows } = await pool.query<Row>(
    `SELECT doc_id::text, subject, filename, page, chunk_index, char_offset, content,
            1 - (embedding <=> $2::vector) AS score
     FROM chunks
     WHERE subject = $1
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [subject, vec, fetchK]
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
        subject: first.subject,
        filename: first.filename,
        page: first.page,
        chunk_index: first.chunk_index,
        char_offset: first.char_offset,
        textWithMeta:
          `[Subject: ${first.subject} | Source: ${first.filename} | Page ${first.page} | ChunkIdx: ${first.chunk_index} | CharOffset: ${first.char_offset}]\n` +
          combinedText,
      }
    })
}

// ── Progress classification ───────────────────────────────────

interface ClassificationResult {
  subtopic: string
  concept: string
  questionType: string
  cognitiveLevel: string | null
  confidenceSignal: string
}

const CLASSIFICATION_PROMPT =
  'You are a study session classifier. Given a student\'s message and recent conversation history, extract structured metadata.\n\n' +
  'Return ONLY valid JSON, no other text, no reasoning, no explanation:\n' +
  '{\n' +
  '  "subtopic": string,\n' +
  '  "concept": string,\n' +
  '  "questionType": "factual" | "conceptual" | "procedural" | "application" | "comparative" | "clarification" | "follow_up" | "acknowledgment",\n' +
  '  "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create" | null,\n' +
  '  "confidenceSignal": "high" | "medium" | "low"\n' +
  '}\n\n' +
  'Rules:\n' +
  '- subtopic: sub-area within the subject (e.g. "Cell Division", "Gas Laws")\n' +
  '- concept: specific concept being asked about (e.g. "Crossing Over", "Van der Waals Equation")\n' +
  '- follow_up: continuing directly from the previous exchange on the same concept\n' +
  '- clarification: asking for re-explanation of something just covered\n' +
  '- acknowledgment: affirmation or confirmation with no new question ("got it", "ok thanks", "that makes sense")\n' +
  '- comparative: comparing or judging between two options ("which is better", "what\'s the difference")\n' +
  '- cognitiveLevel follows Bloom\'s taxonomy — set to null when questionType is acknowledgment\n' +
  '- confidenceSignal: high = affirmation/understanding expressed; low = confusion, frustration, or hedging ("I think...?", "I don\'t get it"); medium = neutral question'

async function classifyMessage(
  subject: string,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  existingSubtopics: string[] = []
): Promise<ClassificationResult | null> {
  try {
    const subtopicGuidance = existingSubtopics.length > 0
      ? `\nExisting subtopics for this subject: ${existingSubtopics.join(', ')}\nPrefer one of these; only introduce a new subtopic if the question is clearly about a different area not covered by any of them.`
      : ''

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: CLASSIFICATION_PROMPT,
      messages: [
        ...history,
        {
          role: 'user',
          content: `The student is studying: ${subject}${subtopicGuidance}\n\nClassify this message:\n"${userMessage}"`,
        },
      ],
    })
    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    // Extract just the JSON object — handles code fences and trailing reasoning text
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[classify] no JSON found in response:', raw)
      return null
    }
    console.log('[classify] result:', match[0])
    return JSON.parse(match[0]) as ClassificationResult
  } catch (err) {
    console.error('[classify] failed:', err)
    return null
  }
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
      `SELECT DISTINCT subject FROM documents ORDER BY subject`
    )
    res.json({ topics: rows.map((r: { subject: string }) => r.subject) })
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
        ? `SELECT id::text, name, subject, pages,
                  uploaded_at AS "uploadedAt", status, ingested AS "injested"
           FROM documents WHERE subject = $1 ORDER BY uploaded_at DESC`
        : `SELECT id::text, name, subject, pages,
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

    const subject = (req.body.topic as string)?.trim()
    if (!subject) { res.status(400).json({ error: 'topic is required' }); return }

    let pages = 0
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      try { pages = pdfPageCount(fs.readFileSync(file.path)) } catch { /* leave as 0 */ }
    }

    const { rows } = await pool.query(
      `INSERT INTO documents (name, file_path, subject, pages, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING id::text, name, subject, pages,
                 uploaded_at AS "uploadedAt", status, ingested AS "injested"`,
      [file.originalname, file.path, subject, pages]
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
    `SELECT id, name, file_path, subject FROM documents WHERE id = $1`,
    [documentId]
  )
  if (docRows.length === 0) { res.status(404).json({ error: 'Document not found' }); return }
  const doc = docRows[0] as { id: number; name: string; file_path: string; subject: string }

  await pool.query(`UPDATE documents SET status = 'processing' WHERE id = $1`, [doc.id])

  try {
    const buffer = fs.readFileSync(doc.file_path)
    const pdf    = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: false })

    const pageTexts: string[] = Array.isArray(text) ? text : [text as string]

    interface RawChunk {
      subject: string; filename: string; page: number
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
          subject: doc.subject, filename: doc.name, page: pageNum,
          chunk_index: docChunkIndex, char_offset, content: raw,
          textWithMeta:
            `[Subject: ${doc.subject} | Source: ${doc.name} | Page ${pageNum} | ChunkIdx: ${docChunkIndex} | CharOffset: ${char_offset}]\n${raw}`,
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
            doc.id, c.subject, c.filename, c.page,
            c.chunk_index, c.char_offset, c.content,
            `[${c.embedding.join(',')}]`
          )
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8}::vector)`
        })
        await client.query(
          `INSERT INTO chunks (doc_id, subject, filename, page, chunk_index, char_offset, content, embedding)
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

    // Extract canonical subtopics from document text (best-effort, non-blocking)
    try {
      const textSample = pageTexts.slice(0, 4).join('\n').slice(0, 3000)
      const subRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: 'You are a document analyzer. Extract the 5 most important subtopic headings from this academic text. Return ONLY a JSON array of strings with no other text: ["Subtopic 1", "Subtopic 2", "Subtopic 3", "Subtopic 4", "Subtopic 5"]. Be concise and specific.',
        messages: [{ role: 'user', content: textSample }],
      })
      const raw = subRes.content[0].type === 'text' ? subRes.content[0].text : '[]'
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) {
        const subtopics: string[] = JSON.parse(match[0])
        if (subtopics.length > 0) {
          const vals = subtopics.map((_: string, i: number) => `($1, $2, $${i + 3})`).join(',')
          await pool.query(
            `INSERT INTO document_subtopics (doc_id, subject, name) VALUES ${vals}`,
            [doc.id, doc.subject, ...subtopics]
          )
          console.log(`[ingest] extracted ${subtopics.length} subtopics for "${doc.subject}":`, subtopics)
        }
      }
    } catch (subErr) {
      console.error('[ingest] subtopic extraction failed (non-fatal):', subErr)
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
       WHERE subject = $1 ORDER BY created_at ASC`,
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
         WHERE subject = $1 ORDER BY created_at DESC LIMIT 8
       ) sub ORDER BY created_at ASC`,
      [topic]
    )
    const history = historyRows.map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }))

    // Persist user message before calling Claude
    const { rows: msgRows } = await pool.query<{ id: number }>(
      `INSERT INTO messages (subject, role, content) VALUES ($1, 'user', $2) RETURNING id`,
      [topic, message]
    )
    const messageId = msgRows[0].id

    // Fetch canonical subtopics for this subject to anchor classification
    const { rows: subRows } = await pool.query<{ name: string }>(
      `SELECT DISTINCT name FROM document_subtopics WHERE subject = $1`,
      [topic]
    )
    const existingSubtopics = subRows.map(r => r.name)

    // Start classification concurrently — will be awaited after streaming
    const classificationPromise = classifyMessage(topic, message, history, existingSubtopics)

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

    // Strip SOURCES_JSON before saving
    const markerIdx    = fullResponse.lastIndexOf('SOURCES_JSON:')
    const savedContent = markerIdx !== -1 ? fullResponse.slice(0, markerIdx).trim() : fullResponse

    // Classification is almost certainly done by now; await to get subtopic for both rows
    const classification = await classificationPromise

    const { rows: assistantRows } = await pool.query<{ id: number }>(
      `INSERT INTO messages (subject, role, content, subtopic) VALUES ($1, 'assistant', $2, $3) RETURNING id`,
      [topic, savedContent, classification?.subtopic ?? null]
    )

    if (classification) {
      await Promise.all([
        pool.query(
          `UPDATE messages SET subtopic = $1 WHERE id = $2`,
          [classification.subtopic, messageId]
        ),
        pool.query(
          `INSERT INTO progress_events (message_id, subject, subtopic, concept, question_type, cognitive_level, confidence_signal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [messageId, topic, classification.subtopic, classification.concept, classification.questionType, classification.cognitiveLevel ?? null, classification.confidenceSignal]
        ),
      ])
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('Chat error:', err)
    res.write('data: [ERROR]\n\n')
    res.end()
  }
})

app.get('/api/progress', async (req, res) => {
  try {
    const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined
    const data  = await getProgressData(topic)
    res.json(data)
  } catch (err) {
    console.error('GET /api/progress error:', err)
    res.status(500).json({ error: 'Failed to fetch progress data' })
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
