// src/queries.js
// Centralized Supabase data access for your app.
//
// Expected tables (you can adapt names/columns easily):
// - locations: { id (uuid or text PK), name text, timezone text, created_at timestamptz }
// - users:     { id (uuid PK), email text, role text, locations text[] }
// - tasks:     { id (uuid or text PK), tasklist_id text, status text, value numeric, note text,
//               photos text[] (urls), na boolean, review_status text, updated_at timestamptz }
// - (optional/next) submissions & submission_tasks (not required for the helpers below)
//
// Storage:
// - Bucket: "task-evidence" (public). RLS/policies should allow read for anon if you want.
//   We never hardcode base URL; we use getPublicUrl().

import { supabase } from "./lib/supabase";

// ---------- tiny utils ----------
const BUCKET = "evidence";

export default async function fetchUsers() {
  const { data, error } = await supabase
    .from("app_user")
    .select("*")
    .eq("company_id", "4f0be4a0-bb1b-409e-bb98-8e6fbd0c8ccb");
  if (error) {
    throw new Error(`fetchUsers: ${error.message}`);
  } 
  return data ?? [];
}

export async function fetchLocations() {
  const { data, error } = await supabase
    .from("location")
    .select("*")
    .eq("company_id", "4f0be4a0-bb1b-409e-bb98-8e6fbd0c8ccb");
  if (error) {
    throw new Error(`fetchLocations: ${error.message}`);
  } 
  return data ?? [];
}

// -----------------------------
// Mapping helpers (UI <-> DB)
// -----------------------------
const pad = (n) => String(n).padStart(2, "0");
const toTime = (hhmm) => (hhmm?.length === 5 ? `${hhmm}:00` : hhmm || null);
const fromTime = (t) => (t ? t.slice(0, 5) : "");

const toUiTimeBlock = (r) => ({
  id: r.id,
  name: r.name,
  start: fromTime(r.start_time),
  end: fromTime(r.end_time),
});
const toDbTimeBlock = (tb) => ({
  id: tb.id,
  name: tb.name,
  start_time: toTime(tb.start),
  end_time: toTime(tb.end),
});

const toUiTask = (r) => ({
  id: r.id,
  title: r.title,
  category: r.category || "",
  inputType: r.input_type || "checkbox",
  min: r.min ?? null,
  max: r.max ?? null,
  photoRequired: !!r.photo_required,
  noteRequired: !!r.note_required,
  allowNA: r.allow_na !== false,
  priority: r.priority ?? 3,
});
const toDbTask = (t, tasklist_id) => ({
  id: t.id, // if undefined, DB will assign if default uuid() is set
  tasklist_id,
  title: t.title,
  category: t.category || null,
  input_type: t.inputType || "checkbox",
  min: t.min,
  max: t.max,
  photo_required: !!t.photoRequired,
  note_required: !!t.noteRequired,
  allow_na: !!t.allowNA,
  priority: typeof t.priority === "number" ? t.priority : 3,
});

const toUiTemplate = (r) => ({
  id: r.id,
  name: r.name,
  locationId: r.location_id,
  timeBlockId: r.time_block_id,
  recurrence: r.recurrence || [],
  requiresApproval: r.requires_approval ?? true,
  signoffMethod: r.signoff_method || "PIN",
  active: r.active !== false,
  tasks: (r.tasklist_task || []).map(toUiTask),
});

// -----------------------------
// Company
// -----------------------------
export async function getCompany(companyId) {
  const { data, error } = await supabase
    .from("company")
    .select("*")
    .eq("id", companyId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompany(companyId, { name, brand_color, timezone }) {
  const { error } = await supabase
    .from("company")
    .update({ name, brand_color, timezone })
    .eq("id", companyId);
  if (error) throw error;
}

// -----------------------------
// Locations (no company_id in schema)
// -----------------------------
export async function listLocations(companyId) {
  const { data, error } = await supabase
    .from("location")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createLocation({ name, timezone, company_id }) {
  const { error } = await supabase.from("location").insert([{ name, timezone, company_id }]);
  if (error) throw error;
}
export async function updateLocation(id, patch) {
  const { error } = await supabase.from("location").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteLocation(id) {
  const { error } = await supabase.from("location").delete().eq("id", id);
  if (error) throw error;
}

// -----------------------------
// Users (scoped by company_id)
// -----------------------------
export async function listUsers(companyId) {
  const { data, error } = await supabase
    .from("app_user")
    .select("*")
    .eq("company_id", companyId)
    .order("email", { ascending: true });
  if (error) throw error;
  return data;
}
export async function createUser(row) {
  const { error } = await supabase.from("app_user").insert([row]);
  alert("User Successfully Created!")
  if (error) throw error;
}
export async function updateUser(id, patch) {
  const { error } = await supabase.from("app_user").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteUser(id) {
  const { error } = await supabase.from("app_user").delete().eq("id", id);
  if (error) throw error;
}

// -----------------------------
// Time blocks
// -----------------------------
export async function listTimeBlocks() {
  const { data, error } = await supabase
    .from("time_block")
    .select("*")
    .order("start_time", { ascending: true });
  if (error) throw error;
  return data.map(toUiTimeBlock);
}

export async function upsertTimeBlock(tbUi) {
  const payload = toDbTimeBlock(tbUi);
  const { error } = await supabase.from("time_block").upsert(payload);
  if (error) throw error;
}
export async function removeTimeBlock(id) {
  const { error } = await supabase.from("time_block").delete().eq("id", id);
  if (error) throw error;
}

// -----------------------------
// Tasklist templates + tasks
// -----------------------------
export async function listTasklistTemplates() {
  // expects FK relation: tasklist_task.tasklist_id -> tasklist_template.id
  const { data, error } = await supabase
    .from("tasklist_template")
    .select("*, tasklist_task(*)")
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map(toUiTemplate);
}

export async function deleteTasklistTemplate(id) {
  // ensure tasks are removed via FK ON DELETE CASCADE or do it manually:
  const { error } = await supabase.from("tasklist_template").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertTasklistTemplateWithTasks(tplUi) {
  // 1) upsert template
  const tplRow = {
    id: tplUi.id, // allow undefined for INSERT if default uuid()
    name: tplUi.name,
    location_id: tplUi.locationId,
    time_block_id: tplUi.timeBlockId,
    recurrence: tplUi.recurrence || [],
    requires_approval: tplUi.requiresApproval ?? true,
    signoff_method: tplUi.signoffMethod || "PIN",
    active: tplUi.active !== false,
  };

  const { data: tplRes, error: tplErr } = await supabase
    .from("tasklist_template")
    .upsert(tplRow)
    .select("*")
    .limit(1);
  if (tplErr) throw tplErr;
  const template = tplRes?.[0];
  const tasklist_id = template.id;

  // 2) read existing tasks to know which to delete
  const { data: existing, error: exErr } = await supabase
    .from("tasklist_task")
    .select("id")
    .eq("tasklist_id", tasklist_id);
  if (exErr) throw exErr;
  const existingIds = new Set((existing || []).map((t) => t.id));
  const incomingIds = new Set((tplUi.tasks || []).map((t) => t.id).filter(Boolean));

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from("tasklist_task").delete().in("id", toDelete);
    if (error) throw error;
  }

  // 3) upsert/insert tasks
  const taskRows = (tplUi.tasks || []).map((t) => toDbTask(t, tasklist_id));
  if (taskRows.length) {
    const { error } = await supabase
      .from("tasklist_task")
      .upsert(taskRows, { onConflict: "id" });
    if (error) throw error;
  }

  return template;
}

// -----------------------------
// One-shot hydrate for Admin
// -----------------------------
export async function hydrateAll(companyId) {
  const [company, locations, users, timeBlocks, templates] = await Promise.all([
    getCompany(companyId),
    listLocations(),
    listUsers(companyId),
    listTimeBlocks(),
    listTasklistTemplates(),
  ]);
  return { company, locations, users, timeBlocks, templates };
}