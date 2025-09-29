// src/marketing/AuthShell.jsx
import { AppShell, Group, Button, Text } from "@mantine/core";
import { supabase } from "../lib/supabase";

export default function AuthShell({ children }) {
  return (
    <AppShell header={{ height: 64 }}>
      <AppShell.Header style={{ display: "flex", alignItems: "center", paddingInline: 16 }}>
        <Group justify="space-between" w="100%">
          <Text fw={700}>SOP Checklist</Text>
          <Group>
            <Button size="xs" variant="default" onClick={() => supabase.auth.signInWithOAuth({ provider: "google" })}>
              Sign up
            </Button>
            <Button size="xs" onClick={() => supabase.auth.signInWithOAuth({ provider: "google" })}>
              Log in
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}