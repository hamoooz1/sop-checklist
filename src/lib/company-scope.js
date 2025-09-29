// src/lib/company-scope.js
import { supabase } from "./supabase";

export async function getMyCompanyId() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("profile")
    .select("company_id")
    .eq("id", uid)
    .single();
  if (error) return null;
  return data?.company_id || null;
}

export async function listLocationsForMyCompany() {
  const company_id = await getMyCompanyId();
  if (!company_id) return [];
  const { data, error } = await supabase
    .from("location")
    .select("*")
    .eq("company_id", company_id)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listAppUsersForMyCompany() {
  const company_id = await getMyCompanyId();
  if (!company_id) return [];
  const { data, error } = await supabase
    .from("app_user")
    .select("*")
    .eq("company_id", company_id)
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data || [];
}
