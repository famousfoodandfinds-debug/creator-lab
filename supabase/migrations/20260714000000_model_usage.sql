-- model_usage: per-call token accounting for every Anthropic model call in Saxe.
-- Written ONLY by the serverless proxy (netlify/functions/claude.js) using the
-- service-role key. Never read or written from the browser.
--
-- Run this once against the Supabase project (SQL editor or `supabase db` / psql).
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

create table if not exists public.model_usage (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  user_id            text,                       -- whoever triggered the call (Supabase user id)
  call_name          text,                       -- buyer_card | spec_translation | hook | body | caption | sharpen | ... | other
  model              text,                       -- the actual model string sent to Anthropic
  input_tokens       int,                        -- usage.input_tokens
  output_tokens      int,                        -- usage.output_tokens
  cache_read_tokens  int,                        -- usage.cache_read_input_tokens (nullable)
  cache_write_tokens int,                        -- usage.cache_creation_input_tokens (nullable)
  generation_id      text,                       -- groups all calls of one script generation
  success            boolean not null default true
);

-- Handy for the before/after rollups.
create index if not exists model_usage_created_at_idx  on public.model_usage (created_at);
create index if not exists model_usage_call_name_idx   on public.model_usage (call_name);
create index if not exists model_usage_generation_idx  on public.model_usage (generation_id);

-- RLS on, with NO policies for anon/authenticated => the browser can neither read nor
-- write this table. The service role bypasses RLS, so the serverless function (which uses
-- the service-role key) is the only writer. This is deliberately service-role-write-only.
alter table public.model_usage enable row level security;
