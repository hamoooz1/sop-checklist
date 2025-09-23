// useTasklistsToday.js
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

// helpers
function weekdayIndexFromISO(dateISO) {
  const d = new Date(dateISO + "T12:00:00Z");
  return d.getUTCDay(); // 0..6
}

// shape returned: [{ id, locationId, name, timeBlockId, recurrence, requiresApproval, signoffMethod, tasks: [...] }]
export function useTasklistsToday(activeLocationId, dateISO) {
  const [tasklists, setTasklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setErr] = useState(null);

  const dow = useMemo(() => weekdayIndexFromISO(dateISO || new Date().toISOString().slice(0,10)), [dateISO]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!activeLocationId) { setTasklists([]); return; }
      setLoading(true); setErr(null);
      try {
        // 1) templates for location, active=true, includes today’s DOW in recurrence
        // Postgres: recurrence is int[]; use contains operator with a one-element array
        const { data: templates, error: tErr } = await supabase
          .from("tasklist_template")
          .select(`
            id,
            location_id,
            name,
            time_block_id,
            recurrence,
            requires_approval,
            signoff_method,
            active,
            time_block:time_block_id (
              id, name, start_time, end_time
            )
          `)
          .eq("location_id", activeLocationId)
          .eq("active", true);

        if (tErr) throw tErr;

        // filter by DOW client-side (portable across older PostgRESTs)
        const todays = (templates || []).filter(t => Array.isArray(t.recurrence) && t.recurrence.includes(dow));

        if (todays.length === 0) { setTasklists([]); setLoading(false); return; }

        // 2) fetch tasks for these templates in one go
        const ids = todays.map(t => t.id);
        const { data: tasks, error: taskErr } = await supabase
          .from("tasklist_task")
          .select("*")
          .in("tasklist_id", ids);
        if (taskErr) throw taskErr;

        // 3) assemble
        const tasksByTpl = new Map();
        for (const t of tasks || []) {
          if (!tasksByTpl.has(t.tasklist_id)) tasksByTpl.set(t.tasklist_id, []);
          tasksByTpl.get(t.tasklist_id).push({
            id: t.id,
            title: t.title,
            category: t.category || "",
            inputType: t.input_type,
            min: t.min == null ? null : Number(t.min),
            max: t.max == null ? null : Number(t.max),
            photoRequired: !!t.photo_required,
            noteRequired: !!t.note_required,
            allowNA: !!t.allow_na,
            priority: typeof t.priority === "number" ? t.priority : 3,
          });
        }

        // 4) sort by time_block.start_time
        const assembled = todays.map(t => ({
          id: t.id,
          locationId: t.location_id,
          name: t.name,
          timeBlockId: t.time_block_id,
          recurrence: t.recurrence,
          requiresApproval: t.requires_approval !== false,
          signoffMethod: t.signoff_method || "PIN",
          tasks: (tasksByTpl.get(t.id) || []).sort((a,b) => (a.priority ?? 3) - (b.priority ?? 3)),
          _tbStart: t.time_block?.start_time || "00:00:00"
        }))
        .sort((a,b) => String(a._tbStart).localeCompare(String(b._tbStart)));

        if (!cancelled) setTasklists(assembled);
      } catch (e) {
        if (!cancelled) setErr(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [activeLocationId, dow, dateISO]);

  return { tasklists, loading, error };
}
