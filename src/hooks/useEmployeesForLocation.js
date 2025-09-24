import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listUsersForLocation } from '../services/users';

export function useEmployeesForLocation(locationId) {
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    let mounted = true;
    if (!locationId) { setEmployees([]); return; }

    (async () => setEmployees(await listUsersForLocation(locationId)))();

    const ch = supabase
      .channel(`rt-users-${locationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_location', filter: `location_id=eq.${locationId}` },
        async () => mounted && setEmployees(await listUsersForLocation(locationId)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profile' },
        async () => mounted && setEmployees(await listUsersForLocation(locationId)))
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [locationId]);

  return employees;
}
