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

  if (error) throw error;
  return data?.company_id || null;
}

// Returns the current user's company row
export async function getMyCompany() {
  const id = await getMyCompanyId();
  if (!id) return null;
  const { data, error } = await supabase.from("company").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}