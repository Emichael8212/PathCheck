# S — database authorization tests

Real RLS/grants evidence requires a real Postgres with Supabase Auth. Unit tests under
`tests/persistence` and `tests/auth` use fetch doubles and are **not** RLS proof.

Run only against a **local or disposable test** stack — never production.

```sh
supabase start            # needs Docker + Supabase CLI; uses lead-owned supabase/config.toml
supabase db reset         # applies supabase/migrations
supabase test db          # pgTAP: supabase/tests/database/*.test.sql (68 assertions)

PATHCHECK_LIVE_SUPABASE_URL=http://127.0.0.1:54321 \
PATHCHECK_LIVE_SUPABASE_PUBLISHABLE_KEY=<local publishable/anon key from `supabase status`> \
npx vitest run tests/persistence/live.supabase.test.ts   # two real users + anon over REST
```

Expected: pgTAP `ok 1..68`, `Result: PASS`; live suite `1 passed` (not skipped).
Failure indicators: any `not ok`, `42501` where success is expected, a cross-owner row
returned, a conflict that overwrote data, or `delete_my_account` failing with a privilege
error on `auth.users` (then account deletion must move to a lead-owned privileged
function). Return the pg_prove summary and vitest summary only — no tokens, keys or emails.
