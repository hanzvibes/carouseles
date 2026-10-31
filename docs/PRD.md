# Carouseles — Product Requirements

## Vision
A programmatic carousel design platform for creators and developers: prompt-to-carousel creation with a visual editor and a reusable structured design format.

## Primary journey
Prompt → Generate → Edit → Customize → Export.

## Audiences
- Creators who need polished social carousels quickly.
- Developers and technical teams who want reusable, data-driven design workflows.

## MVP
1. Create and manage carousel projects.
2. Multi-slide canvas with text, shapes, and images.
3. Canonical Carousel Core JSON document with validation.
4. Save, reload, and autosave documents.
5. AI prompt-to-carousel using configurable OpenAI-compatible providers and user-supplied keys.
6. Export PNG, JPG, and PDF.

## AI provider manager
Support provider label, custom base URL, API key, model ID, optional headers, connection test, enabled state, default provider, and model assignment by role (writer, planner, designer, editor, vision). Keep capability flags separate: text, structured output, tool calling, vision, image generation, and streaming.

Keys must be encrypted server-side and never returned to browser clients or logged. Custom endpoint requests require SSRF protections, redirect validation, timeouts, and response-size limits. Do not assume every OpenAI-compatible endpoint supports every capability.

## Not in MVP
Full Canva parity, social scheduling, real-time multiplayer, arbitrary JavaScript execution, advanced video editing, and enterprise permission systems.

## Success criteria
A user can create a project, generate or build at least one multi-slide design, edit it, reload it without data loss, and export a usable image/PDF.
