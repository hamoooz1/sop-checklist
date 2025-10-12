import React from "react";
import {
  AppShell,
  Group,
  TextInput,
  Button,
  ActionIcon,
  Menu,
  Avatar,
  Text,
} from "@mantine/core";
import { IconSun, IconMoon, IconSettings } from "@tabler/icons-react";

/**
 * Required props (no placeholders):
 * - scheme: "light" | "dark"
 * - setScheme(next: "light" | "dark")
 * - profileName: string
 * - profileEmail: string
 * - onLogout(): void
 * Optional:
 * - onSearch(q: string): void
 * - middle: ReactNode   // your existing controls (SegmentedControl, Selects, BugReport, etc.)
 */
export default function Topbar({
  scheme,
  setScheme,
  profileName,
  profileEmail,
  onLogout,
  onSearch,
  middle,
}) {
  // hard-fail if anything critical is missing
  if (!scheme || !setScheme) throw new Error("Topbar: scheme/setScheme required");
  if (!profileName) throw new Error("Topbar: profileName required");
  if (!profileEmail) throw new Error("Topbar: profileEmail required");
  if (!onLogout) throw new Error("Topbar: onLogout required");

  const [q, setQ] = React.useState("");
  const next = scheme === "dark" ? "light" : "dark";

  return (
    <AppShell.Header withBorder style={{ borderColor: "var(--mantine-color-dark-4)" }}>
      <Group h={56} px="md" justify="space-between" wrap="nowrap">

        {/* center: your actual controls from AppInner */}
        {middle ? <Group gap="xs">{middle}</Group> : null}

        {/* right: settings, user, theme */}
        <Group gap="xs" wrap="nowrap">

          <Menu width={220} position="bottom-end">
            <Menu.Target>
              <Group gap={8} style={{ cursor: "pointer" }}>
                <Avatar radius="xl" size={28} />
                <div>
                  <Text size="sm" fw={600} lh={1.1}>{profileName}</Text>
                  <Text size="xs" c="dimmed" lh={1.1}>{profileEmail}</Text>
                </div>
              </Group>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item>Profile</Menu.Item>
              <Menu.Item>Account</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" onClick={onLogout}>Sign out</Menu.Item>
            </Menu.Dropdown>
          </Menu>

          <ActionIcon
            variant="default"
            radius="md"
            size="lg"
            onClick={() => setScheme(next)}
            aria-label="Toggle color scheme"
            title="Toggle color scheme"
          >
            {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ActionIcon>
        </Group>
      </Group>
    </AppShell.Header>
  );
}
