import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listLocations } from '../services/locations';

export function useLocations() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setLocations(await listLocations());
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    load();

    const ch = supabase
      .channel('rt-locations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location' }, () => mounted && load())
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  return { locations, loading, refetch: load };
}
