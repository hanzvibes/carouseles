# Carouseles

**Programmatic Carousel Design Platform**

> One idea. Multiple slides. Infinite possibilities.

Carouseles combines a visual carousel editor, a canonical design document format, and AI-assisted creation for creators and developers.

## Product flow

Prompt → Generate → Edit → Customize → Export

## Architecture principles

- **Carousel Core is the source of truth.** The canonical document schema is owned by Carouseles.
- **Editor adapters are replaceable.** Polotno is the initial visual editor integration, not the canonical data format.
- **Provider-agnostic AI.** All model calls pass through a server-side provider router. OpenAI-compatible custom endpoints and BYOK are supported by design.
- **Validate before loading.** AI output is parsed and validated before it can update a design document.
- **Safe by default.** Never expose provider credentials to the browser or execute arbitrary AI-generated JavaScript on the application server.

## MVP scope

1. Carousel Core schema and validation.
2. Multi-slide visual editor.
3. Project create, save, and reload.
4. Prompt-to-carousel generation through configurable AI providers.
5. PNG, JPG, and PDF export.

Animated video export, social scheduling, multiplayer editing, arbitrary code execution, and full Canva feature parity are out of MVP scope.

## Planned stack

- Next.js, React, TypeScript
- Tailwind CSS and shadcn/ui
- Supabase Auth, PostgreSQL, Storage, and RLS
- Polotno editor adapter (subject to commercial licensing and export validation)
- Zod for document and AI-output validation
- Zustand for editor state
- Server-only AI provider adapters with encrypted credentials
- Isolated background rendering workers

## Development status

This repository now includes an initial dashboard, a browser-based multi-slide editor, text and shape editing, local draft persistence, PNG export for the active slide, and Carousel Core schema validation. Cloud projects, AI generation, image elements, PDF export, and production deployment are not implemented yet.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design schema](docs/DESIGN-SCHEMA.md)
- [Roadmap](docs/ROADMAP.md)

## Local setup

Prerequisites: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Environment variables will be documented in `.env.example` as integrations are implemented. Never commit real API keys.
