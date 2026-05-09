# StudyMate — frontend shell

Static UI only. No API calls, no database, no AI. All data is hardcoded.
The goal is to get all views rendering and looking right before any backend work starts.

## Commands

```bash
npm run dev        # localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint
```

## Layout

Split screen on the study view:
- Left panel (~400px fixed width): DocumentPanel — topic chips at top, upload zone, doc list below
- Right panel (flex-1): ChatPanel — scope chips in header, message thread, input at bottom
- Top: TopBar with tab navigation switching between /study and /progress

## Hardcoded mock data

Use this throughout — don't invent your own:

```ts
const TOPICS = ['AP Bio', 'Calc BC', 'US History']

const DOCUMENTS = [
  { id: '1', name: 'lecture-7-cellular-respiration.pdf', subject: 'AP Bio',     pageCount: 12, status: 'ready' },
  { id: '2', name: 'chapter-4-limits-continuity.pdf',   subject: 'Calc BC',    pageCount: 8,  status: 'ready' },
  { id: '3', name: 'reconstruction-era-notes.pdf',       subject: 'US History', pageCount: 5,  status: 'processing' },
]

const MESSAGES = [
  {
    id: '1', role: 'user',
    content: 'What happens during the electron transport chain?',
  },
  {
    id: '2', role: 'assistant',
    content: 'The electron transport chain occurs in the inner mitochondrial membrane. Electrons from NADH and FADH₂ pass through four protein complexes, releasing energy to pump H⁺ ions across the membrane. This proton gradient drives ATP synthase to produce ~32–34 ATP per glucose. Oxygen is the final electron acceptor, forming water.',
    citations: [
      { fileName: 'lecture-7.pdf', pageNumber: 4 },
      { fileName: 'lecture-7.pdf', pageNumber: 6 },
    ],
  },
  {
    id: '3', role: 'user',
    content: "What's the difference between complex I and complex II?",
  },
]
```

## Component checklist

- [ ] TopBar — tab nav switching between /study and /progress routes
- [ ] TopicChips — toggleable chips, active chip has accent style, "+ New topic" chip at end (no handler yet)
- [ ] UploadZone — dashed border zone with icon and label, hover state, no upload logic
- [ ] DocList — renders DOCUMENTS with name, subject, page count, status badge (ready = green, processing = amber)
- [ ] DocumentPanel — composes TopicChips + UploadZone + DocList
- [ ] CitationChip — small inline chip showing `fileName · p.N`, clicking does nothing yet
- [ ] MessageThread — renders MESSAGES, user and assistant messages visually distinct, assistant messages show CitationChips, last message shows pulsing "generating..." indicator
- [ ] ChatInput — auto-resizing textarea + send button, no submit handler yet
- [ ] ChatPanel — header with model label + scope chips, MessageThread, ChatInput
- [ ] ProgressView — centered placeholder text, no content yet
- [ ] /study/page.tsx — DocumentPanel left + ChatPanel right, full viewport height
- [ ] /progress/page.tsx — renders ProgressView

## Rules

- All components use 'use client' for now — chip toggles and tab switching use local useState
- No API calls anywhere
- No useEffect data fetching
- No external component libraries (shadcn, radix, etc.) — Tailwind only
- Functional components, no class components
- No inline styles

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


