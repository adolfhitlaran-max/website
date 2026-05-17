-- Uncensored Media subscriber access-code setup
-- Paste this into the Supabase SQL Editor and run it once.

create extension if not exists pgcrypto;

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text,
  status text not null default 'active',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.access_codes
drop constraint if exists access_codes_code_7_digits_check;

alter table public.access_codes
add constraint access_codes_code_7_digits_check
check (code ~ '^[0-9]{7}$')
not valid;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles
add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.profiles
add column if not exists username text;

alter table public.profiles
add column if not exists display_name text;

alter table public.profiles
add column if not exists created_at timestamptz default now();

update public.profiles
set user_id = id
where user_id is null;

alter table public.profiles
add column if not exists access_code_id uuid references public.access_codes(id);

alter table public.profiles
add column if not exists access_granted boolean not null default false;

alter table public.profiles
add column if not exists avatar_url text;

alter table public.profiles
add column if not exists bio text;

alter table public.profiles
add column if not exists updated_at timestamptz default now();

create unique index if not exists profiles_user_id_unique_idx
on public.profiles (user_id)
where user_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'p'
  ) then
    alter table public.profiles add primary key (user_id);
  end if;
end $$;

create index if not exists access_codes_code_idx
on public.access_codes (code);

create index if not exists access_codes_claimed_by_idx
on public.access_codes (claimed_by);

alter table public.access_codes enable row level security;
alter table public.profiles enable row level security;

revoke all on public.access_codes from public, anon, authenticated;
revoke update on public.profiles from public, anon, authenticated;
revoke insert on public.profiles from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, user_id, username, display_name, avatar_url, bio, created_at, updated_at)
on public.profiles to authenticated;
grant update (id, user_id, username, display_name, avatar_url, bio, updated_at)
on public.profiles to authenticated;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Public profiles are readable" on public.profiles;
drop policy if exists "Profiles are readable by signed in users" on public.profiles;
drop policy if exists "Users can upsert own profile" on public.profiles;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or auth.uid() = user_id
);

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (
  auth.uid() = id
  and (user_id is null or auth.uid() = user_id)
);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  auth.uid() = id
  or auth.uid() = user_id
)
with check (
  auth.uid() = id
  or auth.uid() = user_id
);

create or replace function public.check_access_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.profiles%rowtype;
  code_row public.access_codes%rowtype;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  select *
  into profile_row
  from public.profiles
  where id = current_user_id
     or user_id = current_user_id
  limit 1;

  if not found or profile_row.access_granted is not true or profile_row.access_code_id is null then
    return jsonb_build_object('ok', false, 'error', 'Access code required.');
  end if;

  select *
  into code_row
  from public.access_codes
  where id = profile_row.access_code_id
    and claimed_by = current_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Access code required.');
  end if;

  if code_row.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Access code required.');
  end if;

  if code_row.expires_at is not null and code_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'Access code required.');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Access granted.');
end;
$$;

create or replace function public.claim_access_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_code text := trim(coalesce(input_code, ''));
  code_row public.access_codes%rowtype;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in.');
  end if;

  if clean_code !~ '^[0-9]{7}$' then
    return jsonb_build_object('ok', false, 'error', 'Invalid code.');
  end if;

  select *
  into code_row
  from public.access_codes
  where code = clean_code
  for update;

  if not found or code_row.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Invalid code.');
  end if;

  if code_row.expires_at is not null and code_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'Invalid code.');
  end if;

  if code_row.claimed_by is not null and code_row.claimed_by <> current_user_id then
    return jsonb_build_object('ok', false, 'error', 'Invalid code.');
  end if;

  if code_row.claimed_by is null then
    update public.access_codes
    set
      claimed_by = current_user_id,
      claimed_at = now()
    where id = code_row.id;
  end if;

  insert into public.profiles (
    id,
    user_id,
    username,
    display_name,
    access_code_id,
    access_granted,
    updated_at
  )
  values (
    current_user_id,
    current_user_id,
    'member_' || replace(current_user_id::text, '-', ''),
    'Member',
    code_row.id,
    true,
    now()
  )
  on conflict (id) do update
  set
    user_id = coalesce(public.profiles.user_id, excluded.user_id),
    access_code_id = excluded.access_code_id,
    access_granted = true,
    updated_at = now();

  return jsonb_build_object('ok', true, 'message', 'Access granted.');
end;
$$;

revoke all on function public.check_access_status() from public;
revoke all on function public.claim_access_code(text) from public;
grant execute on function public.check_access_status() to authenticated;
grant execute on function public.claim_access_code(text) to authenticated;
