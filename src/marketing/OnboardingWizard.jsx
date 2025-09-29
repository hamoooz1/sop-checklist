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
    if (!companyName.trim()) { alert("Company name is required"); return; }
    setLoading(true);
    try {
      // get current user/profile
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("Not authenticated");

      // 1) create company
      const { data: company, error: cErr } = await supabase
        .from("company")
        .insert({ name: companyName, timezone })
        .select("*")
        .single();
      if (cErr) throw cErr;

      // 2) attach my profile to company, set as Owner
      const { data: profile, error: pErr } = await supabase
        .from("profile")
        .update({ company_id: company.id, role: "Owner" })
        .eq("id", user.id)
        .select("*")
        .single();
      if (pErr) throw pErr;

      // 3) create default location
      const { data: loc, error: lErr } = await supabase
        .from("location")
        .insert({ company_id: company.id, name: locationName, timezone })
        .select("*")
        .single();
      if (lErr) throw lErr;

      // 4) create mirror app_user for PIN use (simple; store plaintext only for demo)
      const displayName = profile.display_name || user.user_metadata?.name || profile.email || "Owner";
      await supabase.from("app_user").insert({
        company_id: company.id,
        location_id: loc.id,
        display_name: displayName,
        email: profile.email,
        role: "Admin",
        is_active: true,
        pin: pin || null
      });

      onDone && onDone(profile);
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
