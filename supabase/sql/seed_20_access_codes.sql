-- Seed 20 random 7-digit subscriber access codes.
-- Run this after supabase/access-codes-setup.sql.

do $$
declare
  inserted_count integer := 0;
  candidate_code text;
begin
  while inserted_count < 20 loop
    candidate_code := lpad(floor(random() * 10000000)::integer::text, 7, '0');

    insert into public.access_codes (code, label, status)
    values (candidate_code, 'X subscriber seed batch 1', 'active')
    on conflict (code) do nothing;

    if found then
      inserted_count := inserted_count + 1;
    end if;
  end loop;
end $$;

select
  code,
  label,
  status,
  claimed_by,
  claimed_at,
  expires_at,
  created_at
from public.access_codes
where label = 'X subscriber seed batch 1'
order by created_at desc, code;
