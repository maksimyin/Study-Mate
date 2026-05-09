import express from 'express'
import path from 'path'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(express.json())

// ── Stub API routes ───────────────────────────────────────────
// Replaced with real implementations as the RAG pipeline is built.

app.get('/api/documents', (_req, res) => {
  res.json({ documents: [] })
})

app.post('/api/upload', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' })
})

app.post('/api/chat', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' })
})

// ── Serve built client in production ─────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../dist/client')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
