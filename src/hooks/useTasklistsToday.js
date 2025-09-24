// src/hooks/useTasklistsToday.js
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listActiveTemplatesForLocation } from '../services/templates';

function dowFromISO(dateISO, tz) {
  try {
    const d = new Date(dateISO + 'T12:00:00Z');
    const wk = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz || 'UTC' }).format(d);
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wk);
  } catch { return new Date().getDay(); }
}

export function useTasklistsToday(locationId, dateISO, tz='UTC') {
  const [lists, setLists] = useState([]);
  const dow = useMemo(() => dowFromISO(dateISO || new Date().toISOString().slice(0,10), tz), [dateISO, tz]);

  async function load() {
    if (!locationId) { setLists([]); return; }
    const templates = await listActiveTemplatesForLocation(locationId);
    const todays = templates.filter(t => Array.isArray(t.recurrence) ? t.recurrence.includes(dow) : true);
    // sort by start_time if you also fetched time_block; otherwise leave as-is
    setLists(todays.map(t => ({
      id: t.id, locationId: t.location_id, name: t.name, timeBlockId: t.time_block_id,
      recurrence: t.recurrence || [], requiresApproval: t.requires_approval ?? true,
      signoffMethod: t.signoff_method || 'PIN',
      tasks: (t.tasks||[]).map(x => ({
        id: x.id, title: x.title, category: x.category || '', inputType: x.input_type || 'checkbox',
        min: x.min==null?null:Number(x.min), max: x.max==null?null:Number(x.max),
        photoRequired: !!x.photo_required, noteRequired: !!x.note_required,
        allowNA: x.allow_na !== false, priority: typeof x.priority==='number'?x.priority:3
      }))
    })));
  }

  useEffect(() => {
    let mounted = true;
    load();
    const ch = supabase
      .channel(`rt-templates-${locationId || 'none'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasklist_template',
        ...(locationId ? { filter: `location_id=eq.${locationId}` } : {}) }, () => mounted && load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasklist_task' }, () => mounted && load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [locationId, dow]);

  return lists;
}
