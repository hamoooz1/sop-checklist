// src/services/locations.js
import { supabase } from '../lib/supabase';

export async function listLocations() {
  const { data, error } = await supabase.from('location').select('id,name,timezone').order('name');
  if (error) throw error;
  return data || [];
}
export async function createLocation({ name, timezone }) {
  const { data, error } = await supabase.from('location')
    .insert({ name, timezone }).select('*').single();
  if (error) throw error;
  return data;
}
export async function updateLocation(id, patch) {
  const { error } = await supabase.from('location').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteLocation(id) {
  const { error } = await supabase.from('location').delete().eq('id', id);
  if (error) throw error;
}
