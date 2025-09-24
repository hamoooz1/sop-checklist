// src/services/timeBlocks.js
import { supabase } from '../lib/supabase';
export async function listTimeBlocks() {
  const { data, error } = await supabase.from('time_block')
    .select('id,name,start_time,end_time').order('start_time');
  if (error) throw error;
  return data || [];
}
export async function upsertTimeBlock(tb) {
  const { error } = await supabase.from('time_block').upsert(tb);
  if (error) throw error;
}
export async function deleteTimeBlock(id) {
  const { error } = await supabase.from('time_block').delete().eq('id', id);
  if (error) throw error;
}
