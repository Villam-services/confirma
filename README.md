# Confirma

Confirma is an engineering PDF review app for extracting source-backed design criteria, standards, codes, regulations, specifications, and other important engineering information into table-only results.

## Current workflow

1. Upload a PDF.
2. The review agent extracts text page by page and builds a structured findings table with source pages and excerpts.
3. On user request, the cross-reference step compares findings against the reference library and creates a matching table of relevant standards, acts, regulations, and design resources.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Implementation notes

- Frontend: React, TypeScript, Vite.
- PDF parsing: `pdfjs-dist` in the browser.
- Reference matching: seeded library in `src/data/referenceLibrary.ts`.
- Agent logic: `src/services/pdfReviewAgent.ts`.

The extraction and matching services are intentionally isolated so they can be replaced with a server-side AI agent and a private standards library without changing the main user interface.
