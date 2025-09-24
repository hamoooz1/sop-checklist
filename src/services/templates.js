// src/services/templates.js
import { supabase } from '../lib/supabase';

export async function listActiveTemplatesForLocation(locationId) {
  const { data, error } = await supabase
    .from('tasklist_template')
    .select(`
      id, location_id, name, time_block_id, recurrence,
      requires_approval, signoff_method, active,
      tasks:tasklist_task ( id, title, category, input_type, min, max, photo_required, note_required, allow_na, priority )
    `)
    .eq('location_id', locationId)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function createTemplate(tpl, tasks) {
  const { data, error } = await supabase.from('tasklist_template').insert(tpl).select('id').single();
  if (error) throw error;
  if (tasks?.length) {
    const rows = tasks.map(t => ({ ...t, tasklist_id: data.id }));
    const { error: terr } = await supabase.from('tasklist_task').insert(rows);
    if (terr) throw terr;
  }
  return data.id;
}

export async function updateTemplate(id, tplPatch, tasksNext, tasksServer) {
  const { error } = await supabase.from('tasklist_template').update(tplPatch).eq('id', id);
  if (error) throw error;

  const nextIds = new Set((tasksNext||[]).filter(t=>t.id).map(t=>t.id));
  const toDelete = (tasksServer||[]).filter(st => !nextIds.has(st.id)).map(x=>x.id);
  if (toDelete.length) {
    const { error: delErr } = await supabase.from('tasklist_task').delete().in('id', toDelete);
    if (delErr) throw delErr;
  }
  for (const t of (tasksNext||[])) {
    if (t.id) {
      const { error: u } = await supabase.from('tasklist_task').update({
        title: t.title, category: t.category, input_type: t.input_type,
        min: t.min, max: t.max, photo_required: t.photo_required,
        note_required: t.note_required, allow_na: t.allow_na, priority: t.priority
      }).eq('id', t.id);
      if (u) throw u;
    } else {
      const { error: i } = await supabase.from('tasklist_task').insert({
        tasklist_id: id, title: t.title, category: t.category, input_type: t.input_type,
        min: t.min, max: t.max, photo_required: t.photo_required,
        note_required: t.note_required, allow_na: t.allow_na, priority: t.priority
      });
      if (i) throw i;
    }
  }
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('tasklist_template').delete().eq('id', id);
  if (error) throw error;
}
