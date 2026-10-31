# AI Provider Manager

## Included

- BYOK settings for OpenAI, OpenRouter, Groq, DeepSeek, and custom OpenAI-compatible endpoints.
- AES-256-GCM server-side API key encryption; the browser only receives a masked "key saved" state.
- Model ID, role assignment (Writer, Planner, Designer, Editor, Vision), capability metadata, default provider, edit/delete, and connection test.
- Server-side OpenAI-compatible `/models` and `/chat/completions` requests.
- User-scoped Supabase RLS and private provider API routes.
- HTTPS-only custom endpoints, DNS checks against private/reserved IPs, and redirects disabled.

## Required setup

1. Review and run `supabase/sql/carouseles-ai-providers.sql` on the FinanceTracker Supabase project. It creates only the new `carouseles_ai_providers` table and its indexes/policies. It is intentionally not auto-applied to the shared database.
2. Generate a 32-byte encryption key and encode it as base64:

   ```bash
   openssl rand -base64 32
   ```

3. Add the result to the server environment as `CAROUSELES_PROVIDER_ENCRYPTION_KEY`. Do not prefix it with `NEXT_PUBLIC_`. Set it in local `.env.local` and hosting Preview/Production only when ready.
4. Ensure the existing Supabase URL and publishable key are configured.
5. Sign in, open Settings → AI providers, add a provider, then use **Test connection**.

## API

- `GET /api/ai/providers` — list the signed-in user's providers (never returns encrypted fields or plaintext keys).
- `POST /api/ai/providers` — create and encrypt a provider.
- `PATCH /api/ai/providers/:id` — update settings; an empty API key preserves the saved key.
- `DELETE /api/ai/providers/:id` — delete a provider and its encrypted credential.
- `POST /api/ai/providers/:id/test` — validate the endpoint and fetch available models.
- `POST /api/ai/chat` — send a bounded text completion through a selected provider, or automatically route by assigned role.

The first router supports OpenAI-compatible non-streaming text completions. Capability fields are descriptive metadata; tool calling, image generation, vision payloads, and streaming adapters are not implemented in this iteration.

## Security notes

- Keys are encrypted using AES-256-GCM with a server-only environment key. Losing or rotating that key makes existing credentials unreadable; re-enter keys after a rotation.
- The database stores ciphertext, IV, and authentication tag only.
- Custom endpoint validation blocks obvious private/reserved destinations and redirects. DNS is checked before requests, but hostname resolution can theoretically change between validation and connection; production hardening should use network-level egress controls or a fixed outbound proxy.
- Do not log request headers, API keys, or provider response bodies.
- The app does not call any provider until the user explicitly saves a provider and invokes a test or AI request.
