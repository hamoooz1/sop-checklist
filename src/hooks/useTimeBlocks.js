// src/hooks/useTimeBlocks.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listTimeBlocks } from '../services/timeBlocks';

export function useTimeBlocks() {
  const [blocks, setBlocks] = useState([]);
  useEffect(() => {
    let mounted = true;
    (async () => mounted && setBlocks(await listTimeBlocks()))();
    const ch = supabase
      .channel('rt-timeblocks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_block' },
        async () => mounted && setBlocks(await listTimeBlocks()))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);
  return blocks;
}
