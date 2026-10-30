import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { signOut } from '@/app/login/actions';
import { createClient } from '@/lib/supabase/server';

// Every page here reads the signed-in user's cookies, so none of it can be prerendered. Next 16 (Cache
// Components) asks you to say so explicitly; `instant = false` lets these routes render on request.
export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/login');

  // is_admin() is a SECURITY DEFINER SQL function that reads profiles.is_admin for the signed-in user.
  const { data: isAdmin } = await supabase.rpc('is_admin');
  const pathname = (await headers()).get('x-omnitrack-pathname');
  const personalRoute = pathname === '/companion' || pathname === '/simulator';

  if (!isAdmin && !personalRoute) {
    return (
      <main className="center">
        <h1>Not an admin</h1>
        <p className="sub">
          This account is signed in but is not allowed here. Grant access once, from the Supabase SQL editor:
        </p>
        <pre>{`update public.profiles set is_admin = true
 where id = (select id from auth.users where email = '${data.claims.email ?? 'you@example.com'}');`}</pre>
        <form action={signOut}>
          <button className="ghost" type="submit">
            Sign out
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="shell">
      <nav>
        <div className="brand">
          Omni<b>Track</b>
        </div>
        {isAdmin ? <><Link href="/">Overview</Link><Link href="/achievements">Achievements</Link></> : null}
        <Link href="/companion">My habits &amp; companion</Link>
        <Link href="/simulator">Hub simulator</Link>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
