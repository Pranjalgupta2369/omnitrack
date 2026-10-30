import Link from 'next/link';
import { signUp } from '../login/actions';

export const instant = false;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  return (
    <main className="center">
      <h1 className="brand">Join Omni<b>Track</b></h1>
      <p className="sub">Create an account to track habits and use your personal companion.</p>
      <form action={signUp} className="stack auth-card">
        <label>
          Name
          <input name="name" type="text" autoComplete="name" minLength={2} maxLength={80} required />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" autoCapitalize="none" required />
        </label>
        <label>
          Password <span className="dim">(at least 8 characters)</span>
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          Confirm password
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error ? <p className="err" role="alert">{error}</p> : null}
        {success === 'check-email' ? (
          <p className="auth-success" role="status">Account created. Check your email to confirm it, then sign in.</p>
        ) : null}
        <button className="primary" type="submit">Create account</button>
        <p className="auth-note">Administrator tools require separate approval.</p>
        <p className="auth-links">Already registered? <Link href="/login">Sign in</Link></p>
      </form>
    </main>
  );
}
