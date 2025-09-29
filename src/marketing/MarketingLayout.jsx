import React from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import {
  AppShell, Group, Button, Container, Text, Anchor, Divider,
} from "@mantine/core";
import { supabase } from "../lib/supabase";

export default function MarketingLayout() {
  const navigate = useNavigate();

  return (
    <AppShell header={{ height: 64 }} padding="md" withBorder={false}>
      <AppShell.Header style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="sm">
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--brand, #0ea5e9)" }} />
              <Anchor component={Link} to="/" fw={700} underline="never" c="inherit">
                OpsCheck
              </Anchor>
              <Group gap="md" visibleFrom="sm">
                <Anchor component={Link} to="/" underline="never" c="dimmed">Home</Anchor>
                <Anchor component={Link} to="/contact" underline="never" c="dimmed">Contact</Anchor>
              </Group>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Button variant="default" component={Link} to="/login">Log in</Button>
              <Button onClick={() => navigate("/signup")}>Get started</Button>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <Divider mt="xl" />
      <Container size="lg" py="xl">
        <Group justify="space-between">
          <Text c="dimmed" fz="sm">© {new Date().getFullYear()} OpsCheck</Text>
          <Group gap="md">
            <Anchor component={Link} to="/contact" c="dimmed" fz="sm">Contact</Anchor>
            <Anchor href="https://example.com/terms" target="_blank" rel="noreferrer" c="dimmed" fz="sm">Terms</Anchor>
            <Anchor href="https://example.com/privacy" target="_blank" rel="noreferrer" c="dimmed" fz="sm">Privacy</Anchor>
          </Group>
        </Group>
      </Container>
    </AppShell>
  );
}
