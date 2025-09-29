/* Queries.js file containing all helpers and queries to DB*/

import { supabase } from "./lib/supabase";
import { getMyCompanyId } from "./lib/company";

// ---------- tiny utils ----------
const BUCKET = "evidence";

// -----------------------------
// Users (scoped by company_id)
// -----------------------------
export default async function fetchUsers(companyId) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return [];
  const { data, error } = await supabase
    .from("app_user")
    .select("*")
    .eq("company_id", cid)
    .order("display_name", { ascending: true });
  if (error) throw new Error(`fetchUsers: ${error.message}`);
  return data ?? [];
}
export async function listUsers(companyId) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return [];
  const { data, error } = await supabase
    .from("app_user")
    .select("*")
    .eq("company_id", cid)
    .order("email", { ascending: true });
  if (error) throw error;
  return data;
}
export async function createUser(row) {
  // row must include company_id
  const payload = { ...row };
  if (!payload.company_id) payload.company_id = await getMyCompanyId(); // [COMPANY_SCOPE]
  const { error } = await supabase.from("app_user").insert([payload]);
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
// Locations — company scoped
// -----------------------------
export async function fetchLocations(companyId) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return [];
  const { data, error } = await supabase
    .from("location")
    .select("*")
    .eq("company_id", cid)
    .order("name", { ascending: true });
  if (error) throw new Error(`fetchLocations: ${error.message}`);
  return data ?? [];
}

export async function listLocations(companyId) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return [];
  const { data, error } = await supabase
    .from("location")
    .select("*")
    .eq("company_id", cid)
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createLocation({ name, timezone, company_id }) {
  // [COMPANY_SCOPE] ensure cid
  const cid = company_id || (await getMyCompanyId());
  const { error } = await supabase
    .from("location")
    .insert([{ name, timezone, company_id: cid }]);
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
// Company
// -----------------------------
export async function getCompany(companyId) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return null;
  const { data, error } = await supabase.from("company").select("*").eq("id", cid).single();
  if (error) throw error;
  return data;
}
export async function uploadCompanyLogo(companyId, file) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  const safe = file.name.replace(/\s+/g, "_");
  const path = `company/${cid}/${Date.now()}_${safe}`;
  const { error } = await supabase
    .storage.from("branding")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
  return pub.publicUrl; // store in company.logo
}
export async function updateCompany(companyId, patch) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  const { error } = await supabase.from("company").update(patch).eq("id", cid);
  if (error) throw error;
}

// -----------------------------
// Mapping helpers (UI <-> DB)
// -----------------------------
const toTime = (hhmm) => (hhmm?.length === 5 ? `${hhmm}:00` : hhmm || null);
const fromTime = (t) => (t ? t.slice(0, 5) : "");

const toUiTimeBlock = (r) => ({ id: r.id, name: r.name, start: fromTime(r.start_time), end: fromTime(r.end_time) });
const toDbTimeBlock = (tb) => ({ id: tb.id, name: tb.name, start_time: toTime(tb.start), end_time: toTime(tb.end) });

const toUiTask = (r) => ({
  id: r.id, title: r.title, category: r.category || "",
  inputType: r.input_type || "checkbox",
  min: r.min ?? null, max: r.max ?? null,
  photoRequired: !!r.photo_required,
  noteRequired: !!r.note_required,
  allowNA: r.allow_na !== false,
  priority: r.priority ?? 3,
});
const toDbTask = (t, tasklist_id) => ({
  id: t.id, tasklist_id,
  title: t.title, category: t.category || null,
  input_type: t.inputType || "checkbox",
  min: t.min, max: t.max,
  photo_required: !!t.photoRequired,
  note_required: !!t.noteRequired,
  allow_na: !!t.allowNA,
  priority: typeof t.priority === "number" ? t.priority : 3,
});
const toUiTemplate = (r) => ({
  id: r.id, name: r.name,
  locationId: r.location_id,
  timeBlockId: r.time_block_id,
  recurrence: r.recurrence || [],
  requiresApproval: r.requires_approval ?? true,
  signoffMethod: r.signoff_method || "PIN",
  active: r.active !== false,
  tasks: (r.tasklist_task || []).map(toUiTask),
});

// -----------------------------
// Time blocks (global to company or global table?)
// If time_block is global (no company_id), leave as-is. If it's per-company, add filter here.
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
// Tasklist templates + tasks — scope via location.company_id (enforced by RLS)
// -----------------------------
export async function listTasklistTemplates(companyId) {
  // [COMPANY_SCOPE] If your RLS already limits by company through location FK, simple select is okay.
  const { data, error } = await supabase
    .from("tasklist_template")
    .select("*, tasklist_task(*)")
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map(toUiTemplate);
}
export async function deleteTasklistTemplate(id) {
  const { error } = await supabase.from("tasklist_template").delete().eq("id", id);
  if (error) throw error;
}
export async function upsertTasklistTemplateWithTasks(tplUi) {
  const tplRow = {
    id: tplUi.id,
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

  const taskRows = (tplUi.tasks || []).map((t) => toDbTask(t, tasklist_id));
  if (taskRows.length) {
    const { error } = await supabase.from("tasklist_task").upsert(taskRows, { onConflict: "id" });
    if (error) throw error;
  }

  return template;
}

// -----------------------------
// One-shot hydrate for Admin — company scoped
// -----------------------------
export async function hydrateAll(companyId) {
  // [COMPANY_SCOPE]
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return { company: null, locations: [], users: [], timeBlocks: [], templates: [] };

  const [company, locations, users, timeBlocks, templates] = await Promise.all([
    getCompany(cid),                 // [COMPANY_SCOPE]
    listLocations(cid),              // [COMPANY_SCOPE]
    listUsers(cid),                  // [COMPANY_SCOPE]
    listTimeBlocks(),
    listTasklistTemplates(cid),      // [COMPANY_SCOPE]
  ]);
  return { company, locations, users, timeBlocks, templates };
}