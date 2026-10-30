'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect('/companion');
}

export async function signUp(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (name.length < 2 || name.length > 80) {
    redirect('/register?error=' + encodeURIComponent('Name must be between 2 and 80 characters.'));
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/register?error=' + encodeURIComponent('Enter a valid email address.'));
  }
  if (password.length < 8) {
    redirect('/register?error=' + encodeURIComponent('Use a password with at least 8 characters.'));
  }
  if (password !== confirmPassword) {
    redirect('/register?error=' + encodeURIComponent('The passwords do not match.'));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  });
  if (error) redirect('/register?error=' + encodeURIComponent(error.message));
  if (data.session) redirect('/companion');
  redirect('/register?success=check-email');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
