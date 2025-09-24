import { supabase } from '../lib/supabase';

export async function getCompany() {
  const { data, error } = await supabase.from('company').select('*').limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function updateCompany(patch) {
  const c = await getCompany();
  if (c) {
    const { error } = await supabase.from('company').update(patch).eq('id', c.id);
    if (error) throw error;
    return { ...c, ...patch };
  } else {
    const { data, error } = await supabase.from('company').insert(patch).select('*').single();
    if (error) throw error;
    return data;
  }
}
