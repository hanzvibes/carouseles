# Carousel Core — Design Schema

The JSON document owned by Carouseles is the canonical source of truth. Editor-specific state must be converted through adapters and must never become the only persisted representation.

## Version 1

- Document: `schemaVersion`, stable `id`, `title`, canvas dimensions, theme, pages.
- Page: stable `id`, display name, background, ordered elements.
- Element: stable `id`, type (`text`, `shape`, `image`), geometry, content, and style.

All external and AI-generated documents must pass Zod validation before they enter editor state. Schema changes require a version and migration strategy. Preserve unknown future fields only after an explicit compatibility policy is implemented.

Polotno integration belongs in an adapter package and maps to/from this schema. It is not the persistence format.
