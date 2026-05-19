-- Member content RLS hardening
-- Paste this into the Supabase SQL Editor after the feature tables exist.
-- It avoids anonymous writes and keeps member content tied to auth.uid().

do $$
begin
  if to_regclass('public.forum_posts') is not null then
    alter table public.forum_posts enable row level security;
    revoke all on public.forum_posts from anon;
    grant select, insert, update, delete on public.forum_posts to authenticated;

    drop policy if exists "Anyone can read forum posts" on public.forum_posts;
    drop policy if exists "Signed in users can read forum posts" on public.forum_posts;
    drop policy if exists "Users can create own forum posts" on public.forum_posts;
    drop policy if exists "Users can update own forum posts" on public.forum_posts;
    drop policy if exists "Users can delete own forum posts" on public.forum_posts;

    create policy "Signed in users can read forum posts"
    on public.forum_posts
    for select
    to authenticated
    using (true);

    create policy "Users can create own forum posts"
    on public.forum_posts
    for insert
    to authenticated
    with check (auth.uid() = user_id);

    create policy "Users can update own forum posts"
    on public.forum_posts
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

    create policy "Users can delete own forum posts"
    on public.forum_posts
    for delete
    to authenticated
    using (auth.uid() = user_id);
  end if;

  if to_regclass('public.forum_comments') is not null then
    alter table public.forum_comments enable row level security;
    revoke all on public.forum_comments from anon;
    grant select, insert, update, delete on public.forum_comments to authenticated;

    drop policy if exists "Anyone can read forum comments" on public.forum_comments;
    drop policy if exists "Signed in users can read forum comments" on public.forum_comments;
    drop policy if exists "Users can create own forum comments" on public.forum_comments;
    drop policy if exists "Users can update own forum comments" on public.forum_comments;
    drop policy if exists "Users can delete own forum comments" on public.forum_comments;

    create policy "Signed in users can read forum comments"
    on public.forum_comments
    for select
    to authenticated
    using (true);

    create policy "Users can create own forum comments"
    on public.forum_comments
    for insert
    to authenticated
    with check (auth.uid() = user_id);

    create policy "Users can update own forum comments"
    on public.forum_comments
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

    create policy "Users can delete own forum comments"
    on public.forum_comments
    for delete
    to authenticated
    using (auth.uid() = user_id);
  end if;

  if to_regclass('public.game_scores') is not null then
    alter table public.game_scores enable row level security;
    revoke all on public.game_scores from anon;
    grant select, insert on public.game_scores to authenticated;

    drop policy if exists "Anyone can read game scores" on public.game_scores;
    drop policy if exists "Signed in users can read game scores" on public.game_scores;
    drop policy if exists "Users can insert own game scores" on public.game_scores;

    create policy "Signed in users can read game scores"
    on public.game_scores
    for select
    to authenticated
    using (true);

    create policy "Users can insert own game scores"
    on public.game_scores
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;

  if to_regclass('public.chat_messages') is not null then
    alter table public.chat_messages enable row level security;
    revoke all on public.chat_messages from anon;
    grant select, insert on public.chat_messages to authenticated;

    drop policy if exists "Anyone can read chat messages" on public.chat_messages;
    drop policy if exists "Signed in users can read chat messages" on public.chat_messages;
    drop policy if exists "Logged in users can send chat messages" on public.chat_messages;

    create policy "Signed in users can read chat messages"
    on public.chat_messages
    for select
    to authenticated
    using (true);

    create policy "Logged in users can send chat messages"
    on public.chat_messages
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;

  if to_regclass('public.pictionary_rooms') is not null then
    alter table public.pictionary_rooms enable row level security;
    revoke all on public.pictionary_rooms from anon;
    grant select, insert, update on public.pictionary_rooms to authenticated;
  end if;
end $$;
