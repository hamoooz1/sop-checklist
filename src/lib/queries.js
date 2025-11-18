/* Queries.js file containing all helpers and queries to DB*/

import { supabase } from "./supabase";
import { getMyCompanyId } from "./company";

// ---------- tiny utils ----------
const BUCKET = "evidence";
const ITEM_BUCKET = "items";
// -----------------------------
// Storage helpers
// -----------------------------
export async function uploadItemImage(file, companyId) {
  const cid = companyId || (await getMyCompanyId());
  if (!cid) throw new Error("uploadItemImage: no company id");

  const safe = file.name.replace(/\s+/g, "_");
  const path = `company/${cid}/${Date.now()}_${safe}`;

  const { error } = await supabase
    .storage
    .from(ITEM_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (error) throw error;

  const { data: pub } = supabase.storage.from(ITEM_BUCKET).getPublicUrl(path);
  return pub.publicUrl; // store in item.image_url
}

// -----------------------------
// Items (generic catalog)
// -----------------------------
export async function listItems(companyId) {
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return [];

  const { data, error } = await supabase
    .from("item")
    .select("*")
    .eq("company_id", cid)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createItem({
  name,
  category,
  image_url = null,
  unit = null,
  sku = null,
  notes = null,
  is_active = true,
  company_id,
}) {
  const cid = company_id || (await getMyCompanyId());
  if (!cid) throw new Error("createItem: missing company_id");

  const payload = {
    company_id: cid,
    name,
    category,
    image_url,
    unit,
    sku,
    notes,
    is_active,
  };

  const { data, error } = await supabase
    .from("item")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateItem(id, patch) {
  const { data, error } = await supabase
    .from("item")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase
    .from("item")
    .delete()
    .eq("id", id);

  if (error) throw error;
}


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
    .order("display_name", { ascending: true });
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
const toDbTimeBlock = async (tb) => {
  const cid = await getMyCompanyId();
  return {
    id: tb.id,
    company_id: cid,
    name: tb.name,
    start_time: toTime(tb.start),
    end_time: toTime(tb.end),
  };
};

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
  positions: Array.isArray(r.positions) ? r.positions : [],
  tasks: (r.tasklist_task || []).map(toUiTask),
});

// -----------------------------
// Time blocks (global to company or global table?)
// -----------------------------
export async function listTimeBlocks(companyId) {
  const cid = companyId || (await getMyCompanyId());
  const { data, error } = await supabase
    .from("time_block")
    .select("*")
    .order("start_time", { ascending: true })
    .eq("company_id", cid);
  if (error) throw error;
  return data.map(toUiTimeBlock);
}
// queries.js
export async function upsertTimeBlock(tb, companyId) {
  // strip empty id so DB can use default
  const row = {
    id: tb.id || undefined,         // <— important
    company_id: companyId,          // <— required (RLS/NOT NULL)
    name: tb.name,                // <— use label, not name
    start_time: tb.start,
    end_time: tb.end,
  };

  const { data, error } = await supabase
    .from('time_block')
    .upsert(row, { onConflict: 'id' })  // or 'company_id,label' if you added that unique index
    .select('*')
    .single();

  if (error) {
    console.error('upsertTimeBlock error:', error); // helps surface the exact reason
    throw error;
  }
  return data;
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
  const cid = companyId || (await getMyCompanyId());
  const { data, error } = await supabase
    .from("tasklist_template")
    .select("*, tasklist_task(*)")
    .order("name", { ascending: true })
    .eq("company_id", cid);
  if (error) throw error;
  return data.map(toUiTemplate);
}
export async function deleteTasklistTemplate(id) {
  const { error } = await supabase.from("tasklist_template").delete().eq("id", id);
  if (error) throw error;
}
export async function upsertTasklistTemplateWithTasks(tplUi) {
  const cid = await getMyCompanyId();
  const tplRow = {
    id: tplUi.id,
    company_id: cid,
    name: tplUi.name,
    location_id: tplUi.locationId,
    time_block_id: tplUi.timeBlockId,
    recurrence: tplUi.recurrence || [],
    requires_approval: tplUi.requiresApproval ?? true,
    signoff_method: tplUi.signoffMethod || "PIN",
    active: tplUi.active !== false,
    positions: Array.isArray(tplUi.positions) ? tplUi.positions : [],
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
    listTimeBlocks(cid),
    listTasklistTemplates(cid),      // [COMPANY_SCOPE]
  ]);
  return { company, locations, users, timeBlocks, templates };
}


// Restock
export async function listRestockRequests(companyId, { locationId = null, status = null } = {}) {
  const cid = companyId || (await getMyCompanyId());
  if (!cid) return [];

  let q = supabase
    .from("restock_request")
    .select(`
      id, company_id, location_id, requested_by, fulfilled_by,
      status, category, item, item_id, quantity, urgency, notes,
      created_at, fulfilled_at,
      requester:requested_by ( id, display_name ),
      fulfiller:fulfilled_by ( id, display_name ),
      item:item_id ( id, name, category, image_url, unit, sku )
    `)
    .eq("company_id", cid)
    .order("created_at", { ascending: false });

  if (locationId) q = q.eq("location_id", locationId);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createRestockRequest({
  company_id,
  location_id,
  // NEW: structured reference
  item_id = null,
  // Legacy / manual:
  category = null,
  item = null,
  quantity = 1,
  urgency = "Normal",
  notes = "",
  requested_by: requestedByOverride = null,
}) {
  const cid = company_id || (await getMyCompanyId());
  if (!cid) throw new Error("createRestockRequest: missing company_id");

  const { data: { user } } = await supabase.auth.getUser();
  const requested_by = requestedByOverride ?? (user?.id ?? null);

  const payload = {
    company_id: cid,
    location_id,
    requested_by,
    quantity,
    urgency,
    notes,
    status: "Open",
  };

  if (item_id) {
    payload.item_id = item_id;
  } else {
    // Fallback if you still want ad-hoc requests
    payload.category = category;
    payload.item = item;
  }

  const { data, error } = await supabase
    .from("restock_request")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function completeRestockRequest(arg) {
  const id = typeof arg === 'object' ? arg.id : arg;
  const override = typeof arg === 'object' ? (arg.fulfilled_by || null) : null;
  const { data: { user } } = await supabase.auth.getUser();
  const fulfilled_by = override ?? (user?.id ?? null);

  const { data, error } = await supabase
    .from('restock_request')
    .update({
      status: 'Completed',
      fulfilled_by,
      fulfilled_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      id, company_id, location_id, requested_by, fulfilled_by,
      status, category, item, item_id, quantity, urgency, notes,
      created_at, fulfilled_at,
      requester:requested_by ( id, display_name ),
      fulfiller:fulfilled_by ( id, display_name ),
      item:item_id ( id, name, category, image_url, unit, sku )
    `)
    .single();

  if (error) throw error;
  return data;
}
