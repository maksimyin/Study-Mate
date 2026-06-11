## Project
StudyMate — AI study assistant. Next.js app router, TypeScript, Tailwind only (no component libs).

## Current phase: 7
persistance is complete

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


## Rules
- 'use client' only on components that need it (chip toggles, input state)
- Server components and API routes for all data work
- Tailwind only — no shadcn, radix, or other component libs
- Functional components only
- No inline styles
- Do not re-embed a document if chunks already exist for that documentId


 

# Type System

**Font:** Plus Jakarta Sans (all uses)



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