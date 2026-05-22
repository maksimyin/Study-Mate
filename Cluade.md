## Project
StudyMate — AI study assistant. Next.js app router, TypeScript, Tailwind only (no component libs).

## Current phase: 4 — Retrieval + Citations
Previously completed: Phase 1 (shell), Phase 2 (upload pipeline), Phase 3 (chat, no RAG)
Next: Phase 5 (Postgres persistence)

## Commands
npm run dev        # localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint

## Layout
Split screen on /study:
- Left panel (~400px fixed): DocumentPanel — topic chips, upload zone, doc list
- Right panel (flex-1): ChatPanel — scope chips, message thread, input
- Top: TopBar with tab nav between /study and /progress

## Architecture

### Chunk schema (Phase 4 source of truth)
{
  id: string,            // crypto.randomUUID()
  documentId: string,
  text: string,
  pageNumber: number,
  chunkIndex: number,
  embedding: number[]    // 1536-dim, text-embedding-3-small
}

### In-memory store 
Replace module-level Map<documentId, Chunk[]> in lib/store.ts with pgvector PostgresSQL database 
Embedded chunks should be stored in pgvector

### Embedding model
OpenAI text-embedding-3-small. Batch chunks in a single embeddings API call.
Do NOT use text-embedding-ada-002.

### Retrieval
Use pgvectors cosine query function
Return top 5 chunks. Pass to Claude in proper JSON format with appropraite citations.


## API routes (Phase 4 additions)
POST /api/ingest     — extract text (unpdf), chunk, embed, store
POST /api/chat       — embed query, retrieve top-5 chunks, call Claude with context

## Rules
- 'use client' only on components that need it (chip toggles, input state)
- Server components and API routes for all data work
- Tailwind only — no shadcn, radix, or other component libs
- Functional components only
- No inline styles
- Do not re-embed a document if chunks already exist for that documentId

## Style direction
 
Dark, monochromatic, AI-native. Reference: Perplexity dark mode.
Bold contrast — white on near-black — not muted or gray-washed.
 
### Color palette
- **Background**: `#0f0f0f` — true near-black, no blue tint
- **Surface (left panel)**: `#171717` — just barely lifted from bg
- **Surface (inputs, cards)**: `#1c1c1c`
- **Border**: `rgba(255,255,255,0.06)` — barely visible, not heavy
- **Text primary**: `#f5f5f5` — near-white, bold and legible
- **Text secondary**: `#888888` — mid-gray for metadata, labels
- **Text muted**: `#555555` — timestamps, hints, disabled
- **Accent**: `#ffffff` — pure white for active states, selected chips, send button. No color accent.
- **Status ready**: `#3ecf8e` — green, small badge only
- **Status processing/uploading**: `#f5a623` — amber, small badge only
- **Citation chips**: `#1c1c1c` bg, `rgba(255,255,255,0.12)` border, `font-mono`
- Slight accent on the active topic chip `#6EE7B7`

# Type System

**Font:** Plus Jakarta Sans (all uses)

---

## Scale

| Role | Size | Weight | Letter Spacing | Line Height | Color |
|---|---|---|---|---|---|
| Display | 40px | 700 | -0.02em | 1.1 | primary |
| H1 | 28px | 700 | -0.015em | 1.2 | primary |
| H2 | 22px | 600 | -0.01em | 1.25 | primary |
| H3 | 17px | 600 | 0 | 1.3 | primary |
| H4 | 14px | 600 | 0 | 1.4 | primary |
| Body | 15px | 400 | 0 | 1.7 | primary |
| Body SM | 13px | 400 | 0 | 1.6 | secondary |
| Button (lg) | 14px | 600 | 0 | — | — |
| Button (sm) | 13px | 500 | 0 | — | — |
| Tab / Nav | 13px | 500 | 0 | — | secondary → primary (active) |
| Tag / Badge | 12px | 500 | 0 | — | secondary |
| Caption / Meta | 12px | 400 | 0 | 1.5 | tertiary |
| Overline | 11px | 600 | 0.1em | — | secondary, uppercase |

---

## Rules

- Negative tracking on headings 22px+, zero everywhere else
- 700 for display impact, 600 for all headings, 500 for UI chrome, 400 for reading copy

## Design
- Confirm design direction with a brief plan before implementing multi-file CSS changes
- Avoid generic dark SaaS aesthetics; prioritize distinctive visual identity

## Edit Workflow
- Before large multi-file edits, propose a brief plan and wait for confirmation
- For visual/UI changes, render and verify in browser before declaring complete
- When fixing bugs, list all identified issues first, then fix in a single batch