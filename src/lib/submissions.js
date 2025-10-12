// src/lib/submissions.js
export function todayISOInTz(tz = 'UTC') {
  // 'YYYY-MM-DD' in a target timezone
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

export async function validatePin({ supabase, companyId, pin }) {
  const { data, error } = await supabase
    .from('app_user')
    .select('id, display_name, is_active')
    .eq('company_id', companyId)
    .eq('pin', String(pin))
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data; // null if wrong
}

export async function findOrCreateSubmission({ supabase, companyId, tasklistId, locationId, dateISO }) {
  // Try find
  let { data, error } = await supabase
    .from('submission')
    .select('id')
    .eq('tasklist_id', tasklistId)
    .eq('location_id', locationId)
    .eq('date', dateISO)
    .maybeSingle();

  // PGRST116 = no rows; ignore it
  if (error && error.code !== 'PGRST116') throw error;
  if (data?.id) return data.id;

  // Create (idempotent thanks to your unique index)
  const { data: created, error: insErr } = await supabase
    .from('submission')
    .insert({
      company_id: companyId,
      tasklist_id: tasklistId,
      location_id: locationId,
      date: dateISO,
      status: 'Pending',
    })
    .select('id')
    .single();
  if (insErr) throw insErr;
  return created.id;
}

export async function upsertSubmissionTask({ supabase, submissionId, taskId, payload }) {
  // payload must match your columns: { status, na, value, note, photos, review_status, review_note, rework_count? }
  const { error } = await supabase
    .from('submission_task')
    .upsert(
      { submission_id: submissionId, task_id: taskId, ...payload },
      { onConflict: 'submission_id,task_id' }
    );
  if (error) throw error;
}

/**
 * Evidence upload helper (private bucket recommended: 'evidence')
 * Returns the STORAGE PATH (store this in submission_task.photos).
 */
// src/lib/submissions.js
export async function fetchSubmissionAndTasks({ supabase, companyId, tasklistId, locationId, dateISO }) {
  // find the submission for this (template, location, date)
  const { data: sub, error: sErr } = await supabase
    .from('submission')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('tasklist_id', tasklistId)
    .eq('location_id', locationId)
    .eq('date', dateISO)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!sub) return { submissionId: null, tasks: [] };

  const { data: stRows, error: tErr } = await supabase
    .from('submission_task')
    .select('task_id, status, review_status, na, value, note, photos, rework_count, review_note')
    .eq('submission_id', sub.id);
  if (tErr) throw tErr;

  return { submissionId: sub.id, submissionStatus: sub.status, tasks: stRows || [] };
}

// lib/submissions.js
export async function uploadEvidence({
  supabase, bucket, companyId, tasklistId, taskId, file, submissionId
}) {
  const ext = file.name.split('.').pop() || 'png';
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const key = `${companyId}/${tasklistId}/${taskId}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${safeExt}`;

  const guessType = file.type && file.type !== '' ? file.type :
    (safeExt === 'jpg' || safeExt === 'jpeg') ? 'image/jpeg' :
    (safeExt === 'png') ? 'image/png' :
    (safeExt === 'webp') ? 'image/webp' : 'application/octet-stream';

  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, file, { upsert: false, contentType: guessType, cacheControl: '3600' });

  if (error) throw error;

  // Return JUST the path (what you’ll store in submission_task.photos)
  return key;
}

export function toPublicUrl(supabase, bucket, path) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// If your bucket is private:
export async function toSignedUrl(supabase, bucket, path, ttl = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  if (error) throw error;
  return data.signedUrl;
}