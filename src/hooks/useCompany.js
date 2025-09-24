// src/hooks/useCompany.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCompany } from '../services/company';

export function useCompany() {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const c = await getCompany();
      if (mounted) { setCompany(c); setLoading(false); }
    })();
    const ch = supabase
      .channel('rt-company')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company' }, async () => {
        const c = await getCompany();
        if (mounted) setCompany(c);
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);
  return { company, loading, setCompany };
}
