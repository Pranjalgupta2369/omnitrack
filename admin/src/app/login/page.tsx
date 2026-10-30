import { signIn } from './actions';
import Link from 'next/link';

// Every page here reads the signed-in user's cookies, so none of it can be prerendered. Next 16 (Cache
// Components) asks you to say so explicitly; `instant = false` lets these routes render on request.
export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="center">
      <h1 className="brand">
        Omni<b>Track</b>
      </h1>
      <p className="sub">Sign in to your account. Administrator tools require separate approval.</p>
      <form action={signIn} className="stack auth-card">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" autoCapitalize="none" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <p className="err">{error}</p> : null}
        <button className="primary" type="submit">
          Sign in
        </button>
        <p className="auth-links">New to OmniTrack? <Link href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}
