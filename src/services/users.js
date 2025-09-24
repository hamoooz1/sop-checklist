// src/services/users.js
import { supabase } from '../lib/supabase';

export async function listAllUsers() {
  const { data, error } = await supabase.from('user_profile').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function listUsersForLocation(locationId) {
  const { data, error } = await supabase
    .from('user_location')
    .select('user: user_profile!inner(id,email,role)')
    .eq('location_id', locationId);
  if (error) throw error;
  return (data || []).map(x => x.user);
}
export async function addUserSimple({ email, role = 'Employee', locationIds = [] }) {
  const { data, error } = await supabase.from('user_profile').insert({ email, role }).select('id').single();
  if (error) throw error;
  if (locationIds.length) {
    const rows = locationIds.map(lid => ({ user_id: data.id, location_id: lid }));
    const { error: e2 } = await supabase.from('user_location').insert(rows);
    if (e2) throw e2;
  }
  return data.id;
}
export async function updateUserRole(userId, role) {
  const { error } = await supabase.from('user_profile').update({ role }).eq('id', userId);
  if (error) throw error;
}
export async function setUserLocations(userId, locationIds) {
  const { error: d } = await supabase.from('user_location').delete().eq('user_id', userId);
  if (d) throw d;
  if (locationIds.length) {
    const rows = locationIds.map(lid => ({ user_id: userId, location_id: lid }));
    const { error: i } = await supabase.from('user_location').insert(rows);
    if (i) throw i;
  }
}
export async function deleteUser(userId) {
  const { error } = await supabase.from('user_profile').delete().eq('id', userId);
  if (error) throw error;
}
