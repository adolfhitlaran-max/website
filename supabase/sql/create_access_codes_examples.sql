-- Manual subscriber access-code example
-- Paste this into the Supabase SQL Editor after running supabase/access-codes-setup.sql.
-- Do not commit real issued codes to the repo. Replace the example code before running.

-- insert into public.access_codes (code, label)
-- values ('<YOUR_7_DIGIT_CODE>', 'Manual subscriber code')
-- on conflict (code) do nothing;
