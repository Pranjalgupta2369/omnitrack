import { signIn } from './actions';

// Every page here reads the signed-in user's cookies, so none of it can be prerendered. Next 16 (Cache
// Components) asks you to say so explicitly; `instant = false` lets these routes render on request.
export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="center">
      <h1 className="brand">
        Omni<b>Track</b> admin
      </h1>
      <p className="sub">Sign in with an account that has is_admin = true.</p>
      <form action={signIn} className="stack">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <p className="err">{error}</p> : null}
        <button className="primary" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}
