# Carouseles — Architecture

## System shape
Start with a modular Next.js application. Keep boundaries explicit without splitting into microservices prematurely.

- `src/lib/carousel-core`: canonical schema, validation, migrations, document operations.
- `src/features/editor`: editor UI and state.
- `src/lib/editor-adapters/polotno`: conversion between canonical documents and Polotno.
- `src/lib/ai`: request router, provider adapters, prompt builders, structured-output validation.
- `src/app/api`: authenticated server endpoints.
- Supabase: Auth, PostgreSQL, Storage, RLS.
- Background worker: isolated image/PDF rendering jobs.

## AI request path
Browser → authenticated API → role/model assignment → provider adapter → validated structured response → Carousel Core validation → editor state.

Business logic must not call vendor SDKs directly. Credentials remain server-only and encrypted at rest. Never execute AI-generated JavaScript on the main application server.

## Editor strategy
Polotno is the first visual editor integration, behind an adapter. Confirm commercial licensing and export support before shipping it in a paid product. Keep canonical persistence independent from Polotno serialization.

## Security
- Encrypt provider secrets server-side; mask on read.
- Restrict custom endpoint hosts and redirects to prevent SSRF.
- Apply request timeouts and response-size limits.
- Validate AI output with strict schemas.
- Enforce workspace ownership and RLS.
- Keep rendering workloads outside interactive request handlers.

## Deployment
Vercel is the planned web host. No deployment or production environment is configured by this foundation commit.
