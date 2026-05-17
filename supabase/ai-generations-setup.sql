-- AI Lab generation history setup
-- Paste this into the Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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

-- Remove old anonymous rows before enforcing authenticated ownership.
delete from public.ai_generations
where user_id is null;

alter table public.ai_generations
alter column user_id set not null;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.ai_generations'::regclass
      and c.contype = 'f'
      and exists (
        select 1
        from unnest(c.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = key.attnum
        where a.attname = 'user_id'
      )
  loop
    execute format('alter table public.ai_generations drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.ai_generations
add constraint ai_generations_user_id_fkey
foreign key (user_id) references auth.users(id) on delete cascade;

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
);

create policy "Users can insert their own ai generations"
on public.ai_generations
for insert
to authenticated
with check (
  auth.uid() = user_id
);
