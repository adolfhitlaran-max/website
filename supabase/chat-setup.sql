-- Uncensored Media realtime chat setup
-- Paste this into the Supabase SQL Editor and run it once.

create table if not exists public.chat_messages (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    room text not null default 'global',
    body text not null,
    created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;
alter table public.chat_messages replica identity full;

revoke all on public.chat_messages from anon;
grant select on public.chat_messages to authenticated;
grant insert on public.chat_messages to authenticated;
grant usage, select on sequence public.chat_messages_id_seq to authenticated;

create index if not exists chat_messages_room_created_at_idx
on public.chat_messages (room, created_at desc);

drop policy if exists "Anyone can read chat messages" on public.chat_messages;
drop policy if exists "Logged in users can send chat messages" on public.chat_messages;
drop policy if exists "Signed in users can read chat messages" on public.chat_messages;
drop policy if exists "Profile users can send chat messages" on public.chat_messages;

create policy "Signed in users can read chat messages"
on public.chat_messages
for select
to authenticated
using (true);

create policy "Logged in users can send chat messages"
on public.chat_messages
for insert
to authenticated
with check (
    auth.uid() = user_id
);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'chat_messages'
    ) then
        alter publication supabase_realtime add table public.chat_messages;
    end if;
end $$;
