-- Carouseles AI Provider Manager
-- Additive schema only. Run against the FinanceTracker Supabase project after review.
-- This script does not modify existing FinanceTracker or Kasir UMKM tables.

create table if not exists public.carouseles_ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  provider_type text not null check (provider_type in ('openai', 'openrouter', 'groq', 'deepseek', 'custom')),
  base_url text not null,
  api_key_ciphertext text not null,
  api_key_iv text not null,
  api_key_tag text not null,
  model_id text not null check (char_length(model_id) between 1 and 160),
  role text not null check (role in ('writer', 'planner', 'designer', 'editor', 'vision')),
  capabilities jsonb not null default '{"text":true,"structuredOutput":false,"toolCalling":false,"vision":false,"imageGeneration":false,"streaming":false}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carouseles_ai_providers_user_created_idx
  on public.carouseles_ai_providers (user_id, created_at);

create unique index if not exists carouseles_ai_providers_one_default_per_user_idx
  on public.carouseles_ai_providers (user_id) where is_default = true;

alter table public.carouseles_ai_providers enable row level security;

drop policy if exists "Users can read their own Carouseles AI providers" on public.carouseles_ai_providers;
create policy "Users can read their own Carouseles AI providers"
  on public.carouseles_ai_providers for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Carouseles AI providers" on public.carouseles_ai_providers;
create policy "Users can create their own Carouseles AI providers"
  on public.carouseles_ai_providers for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Carouseles AI providers" on public.carouseles_ai_providers;
create policy "Users can update their own Carouseles AI providers"
  on public.carouseles_ai_providers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Carouseles AI providers" on public.carouseles_ai_providers;
create policy "Users can delete their own Carouseles AI providers"
  on public.carouseles_ai_providers for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.carouseles_ai_providers to authenticated;
