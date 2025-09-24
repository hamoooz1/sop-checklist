import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listSubmissions } from '../services/submissions';

export function useSubmissions({ locationId, fromISO, toISO }) {
  const [rows, setRows] = useState([]);

  async function load() {
    setRows(await listSubmissions({ locationId, fromISO, toISO }));
  }

  useEffect(() => {
    let mounted = true;
    load();

    const ch = supabase
      .channel(`rt-submissions-${locationId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission',
         ...(locationId ? { filter: `location_id=eq.${locationId}` } : {}) }, () => mounted && load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submission_task' }, () => mounted && load())
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [locationId, fromISO, toISO]);

  return rows;
}
