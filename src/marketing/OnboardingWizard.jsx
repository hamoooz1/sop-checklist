// src/marketing/OnboardingWizard.jsx
import { useState } from "react";
import { Card, Container, Stack, TextInput, Button, Title, Group, Select } from "@mantine/core";
import { supabase } from "../lib/supabase";

export default function OnboardingWizard({ onDone }) {
  const [companyName, setCompanyName] = useState("");
  const [locationName, setLocationName] = useState("Main");
  const [timezone, setTimezone] = useState("UTC");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!companyName.trim()) {
      alert("Company name is required");
      return;
    }
    setLoading(true);
    try {
      // 0) current auth user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
  
      // A friendly display name for seed records
      const displayName =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "Owner";
  
      // 1) create the company
      const { data: company, error: cErr } = await supabase
        .from("company")
        .insert({ name: companyName, timezone })
        .select("id")
        .single();
      if (cErr) throw cErr;
  
      // 2) create default location
      const { data: loc, error: lErr } = await supabase
        .from("location")
        .insert({ company_id: company.id, name: locationName || "Main", timezone })
        .select("id,name,timezone")
        .single();
      if (lErr) throw lErr;
  
      // 3) upsert the user's profile (profile.id = auth uid)
      const { error: pErr } = await supabase
        .from("profile")
        .upsert({
          id: user.id,
          company_id: company.id,
          display_name: displayName,
          role: "Admin",
          email: user.email ?? null, // if you keep email on profile
        }, { onConflict: "id" });
      if (pErr) throw pErr;
  
      // 4) create mirror app_user (for PIN/kiosk usage)
      const { error: aErr } = await supabase.from("app_user").insert({
        company_id: company.id,
        location: loc.id,
        display_name: displayName,
        email: user.email ?? null,
        role: "Admin",
        is_active: true,
        pin: pin || null, // plaintext only if this is just for demo
      });
      if (aErr) throw aErr;
  
      // 5) let parent reload profile/company
      await onDone?.();
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to set up your company");
    } finally {
      setLoading(false);
    }
  }
  

  return (
    <Container size="sm" py="xl">
      <Card withBorder radius="md" p="lg">
        <Stack>
          <Title order={2}>Set up your workspace</Title>
          <TextInput
            label="Company name"
            placeholder="Acme Hospitality"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <Group grow>
            <TextInput
              label="Default location"
              placeholder="Main"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            />
            <Select
              label="Timezone"
              data={["UTC", "America/Los_Angeles", "America/New_York", "America/Vancouver"]}
              value={timezone}
              onChange={setTimezone}
            />
          </Group>
          <TextInput
            label="(Optional) Your kiosk PIN"
            placeholder="1234"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <Group justify="flex-end" mt="sm">
            <Button loading={loading} onClick={handleCreate}>Create workspace</Button>
          </Group>
        </Stack>
      </Card>
    </Container>
  );
}
