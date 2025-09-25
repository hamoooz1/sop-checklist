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
    .select("*");
  if (error) {
    throw new Error(`fetchUsers: ${error.message}`);
  } 
  return data ?? [];
}

export default async function fetchLocations() {
  const { data, error } = await supabase
    .from("location")
    .select("*");
  if (error) {
    throw new Error(`fetchLocations: ${error.message}`);
  } 
  return data ?? [];
}