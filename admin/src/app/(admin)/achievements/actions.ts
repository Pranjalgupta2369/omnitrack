'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

const METRICS = ['total_completions', 'hands_free_completions', 'current_streak', 'longest_streak', 'total_xp'];

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const int = (f: FormData, k: string, fallback = 0) => {
  const n = Number.parseInt(text(f, k), 10);
  return Number.isFinite(n) ? n : fallback;
};

// All of these run as the signed-in admin; RLS (is_admin()) is what actually authorises them.
export async function createAchievement(formData: FormData) {
  const metric = text(formData, 'metric');
  if (!METRICS.includes(metric)) throw new Error('Unknown metric');
  const supabase = await createClient();
  const { error } = await supabase.from('achievements').insert({
    id: text(formData, 'id').toLowerCase(),
    title: text(formData, 'title'),
    description: text(formData, 'description'),
    icon: text(formData, 'icon') || 'trophy',
    metric,
    threshold: int(formData, 'threshold', 1),
    xp_reward: int(formData, 'xp_reward'),
    sort_order: int(formData, 'sort_order', 100),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/achievements');
}

export async function setActive(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('achievements')
    .update({ active: text(formData, 'active') === 'true' })
    .eq('id', text(formData, 'id'));
  if (error) throw new Error(error.message);
  revalidatePath('/achievements');
}

export async function remove(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('achievements').delete().eq('id', text(formData, 'id'));
  if (error) throw new Error(error.message);
  revalidatePath('/achievements');
}

// New or edited rules only fire on a user's next log; this re-evaluates everyone right now.
export async function recheckAll() {
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_recheck_achievements');
  if (error) throw new Error(error.message);
  revalidatePath('/achievements');
}
