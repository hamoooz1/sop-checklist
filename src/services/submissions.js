// src/services/submissions.js
import { supabase } from '../lib/supabase';

export async function getOrCreateDraftSubmission({ tlId, locationId, dateISO, submittedBy }) {
  const { data, error } = await supabase.rpc('get_or_create_draft_submission', {
    p_tasklist_id: tlId, p_location_id: locationId, p_date: dateISO, p_submitted_by: submittedBy || null
  });
  if (error) throw error;
  return data; // uuid
}
export async function upsertSubmissionTask({ submissionId, taskId, patch }) {
  const row = { submission_id: submissionId, task_id: taskId, ...patch };
  const { error } = await supabase.from('submission_task').upsert(row, { onConflict: 'submission_id,task_id' });
  if (error) throw error;
}
export async function submitWithPin(submissionId, pinTag) {
  const { error } = await supabase.from('submission').update({
    signed_by: pinTag, signed_at: new Date().toISOString()
  }).eq('id', submissionId);
  if (error) throw error;
}
export async function recomputeSubmissionStatus(submissionId) {
  const { error } = await supabase.rpc('recompute_submission_status', { p_submission_id: submissionId });
  if (error) throw error;
}
export async function listSubmissions({ locationId, fromISO, toISO }) {
  let q = supabase.from('submission').select(`
    id, tasklist_id, location_id, date, status, signed_by, submitted_by, signed_at,
    tasks:submission_task ( task_id, status, na, value, note, photos, review_status, review_note, rework_count )
  `).order('signed_at', { ascending: false });
  if (locationId) q = q.eq('location_id', locationId);
  if (fromISO) q = q.gte('date', fromISO);
  if (toISO) q = q.lte('date', toISO);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function setTasksReview(submissionId, taskIds, review, note) {
  const patch = review === 'Rework'
    ? { review_status: 'Rework', review_note: note || null }
    : { review_status: 'Approved', review_note: null };
  const { error } = await supabase.from('submission_task')
    .update(patch).in('task_id', taskIds).eq('submission_id', submissionId);
  if (error) throw error;
  await recomputeSubmissionStatus(submissionId);
}
