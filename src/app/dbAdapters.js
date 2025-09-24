// dbAdapters.js
export function mapTasklistRow(row) {
  // row from tasklist_template with joined tasks: tasklist_task[]
  return {
    id: row.id,
    locationId: row.location_id,
    name: row.name,
    timeBlockId: row.time_block_id,
    recurrence: row.recurrence || [],
    requiresApproval: !!row.requires_approval,
    signoffMethod: row.signoff_method || "PIN",
    tasks: (row.tasks || []).map(mapTaskRow),
  };
}

export function mapTaskRow(t) {
  return {
    id: t.id,
    title: t.title || "Task",
    category: t.category || "",
    inputType: t.input_type || "checkbox",
    min: t.min ?? null,
    max: t.max ?? null,
    photoRequired: !!t.photo_required,
    noteRequired: !!t.note_required,
    allowNA: t.allow_na !== false,
    priority: typeof t.priority === "number" ? t.priority : 3,
  };
}
