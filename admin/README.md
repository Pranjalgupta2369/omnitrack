# OmniTrack admin (Next.js 16, TypeScript)

```bash
cp .env.example .env.local     # Windows: copy .env.example .env.local   then fill in the two values
npm install
npm run dev                    # http://localhost:3000
```
Sign in with an account whose `profiles.is_admin` is true. Grant it once in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'you@example.com');
```
Pages: **Overview** (aggregate counts only) and **Achievements** (add / disable / delete rules, re-check all users).
The app signs in as the admin and goes through RLS, so it never holds the secret key.

Next 16 renamed `middleware.ts` to `proxy.ts` (`src/proxy.ts`). The per-user pages export `instant = false`
because they read cookies; see Next's "Cache Components" docs if you want to restructure them with Suspense.

Type-check: `npm run typecheck`. Production build: `npx next build`.
