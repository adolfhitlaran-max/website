-- AI Lab generation history setup
-- Paste this into the Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tool_type text not null,
  prompt text,
  style text,
  aspect_ratio text,
  negative_prompt text,
  provider text,
  model text,
  output_url text,
  output_text text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.ai_generations enable row level security;

create index if not exists ai_generations_user_created_idx
on public.ai_generations (user_id, created_at desc);

create index if not exists ai_generations_tool_created_idx
on public.ai_generations (tool_type, created_at desc);

drop policy if exists "Users can select their own ai generations" on public.ai_generations;
drop policy if exists "Users can insert their own ai generations" on public.ai_generations;
drop policy if exists "Anonymous ai generations are readable" on public.ai_generations;
drop policy if exists "Anonymous ai generations are insertable" on public.ai_generations;

create policy "Users can select their own ai generations"
on public.ai_generations
for select
to authenticated
using (
  auth.uid() = user_id
  or user_id is null
);

create policy "Users can insert their own ai generations"
on public.ai_generations
for insert
to authenticated
with check (
  auth.uid() = user_id
  or user_id is null
);

create policy "Anonymous ai generations are readable"
on public.ai_generations
for select
to anon
using (
  user_id is null
);

create policy "Anonymous ai generations are insertable"
on public.ai_generations
for insert
to anon
with check (
  user_id is null
);
