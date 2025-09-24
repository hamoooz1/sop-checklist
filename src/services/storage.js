// src/services/storage.js
import { supabase } from '../lib/supabase';
const BUCKET = 'evidence';
export async function uploadEvidence({ file, locationId, tlId, taskId }) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${locationId}/${tlId}/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}
  