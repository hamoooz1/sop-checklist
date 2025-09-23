// useLocations.js
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export function useLocations(companyId) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchLocations() {
    setLoading(true);
    setError(null);
    let q = supabase.from("location").select("id,name").order("name");
    if (companyId) q = q.eq("company_id", companyId); // optional filter
    const { data, error } = await q;
    if (error) setError(error.message);
    else setLocations(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchLocations();
    const channel = supabase
      .channel("location-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "location" },
        fetchLocations
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return { locations, loading, error, refetch: fetchLocations };
}
