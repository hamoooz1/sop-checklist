import React from "react";
import { AppShell, ScrollArea, NavLink, Text, Group, ActionIcon, Tooltip } from "@mantine/core";
import {
  IconHome,
  IconVideo,
  IconCash,
  IconUsersGroup,
  IconListDetails,
  IconQuestionMark,
  IconChevronLeft,
} from "@tabler/icons-react";

/**
 * Required props:
 * - company: { name: string; logo: string | null; brandColor: string }
 * - activeKey: string
 * - onNavigate(key: string): void
 * - onCollapse(): void         // NEW: collapse handler
 */
function SectionTitle({ children }) {
  return (
    <Text size="xs" c="dimmed" fw={600} tt="uppercase" px="md" mt="md" mb={4} style={{ letterSpacing: 0.4 }}>
      {children}
    </Text>
  );
}

export default function Sidebar({ company, activeKey, onNavigate, onCollapse }) {
  if (!company?.name) throw new Error("Sidebar: company.name required");
  if (company.brandColor == null) throw new Error("Sidebar: company.brandColor required");
  if (!onNavigate) throw new Error("Sidebar: onNavigate required");
  if (!onCollapse) throw new Error("Sidebar: onCollapse required");

  return (
    <AppShell.Navbar p={0}>
      <ScrollArea style={{ height: "100%" }}>
        {/* Brand row with logo.svg on the left + collapse button on the right */}
        <Group
          h={56}
          px="md"
          gap="sm"
          justify="space-between"
          style={{ borderBottom: "1px solid var(--mantine-color-dark-4)" }}
        >
          <Group gap="sm">
            {/* Always show /logo.svg as requested */}
            <img
              src="/logo.svg"
              alt={`${company.name} logo`}
              style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }}
            />
            <Text fw={700} title={company.name} lineClamp={1}>
              {company.name}
            </Text>
          </Group>

          <Tooltip label="Collapse sidebar" withArrow>
            <ActionIcon variant="subtle" radius="md" onClick={onCollapse} aria-label="Collapse sidebar">
              <IconChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <SectionTitle>Welcome</SectionTitle>
        <NavLink
          active={activeKey === "welcome"}
          label="Home"
          leftSection={<IconHome size={18} />}
          onClick={() => onNavigate("welcome")}
        />

        <SectionTitle>Customer Management</SectionTitle>
        <NavLink
          active={activeKey === "video-calls"}
          label="Welcome Video Calls"
          leftSection={<IconVideo size={18} />}
          onClick={() => onNavigate("video-calls")}
        />
        <NavLink
          active={activeKey === "sales"}
          label="Sales"
          leftSection={<IconCash size={18} />}
          onClick={() => onNavigate("sales")}
        />

        <SectionTitle>Employee Management</SectionTitle>
        <NavLink
          active={activeKey === "employees"}
          label="List of Employees"
          leftSection={<IconUsersGroup size={18} />}
          onClick={() => onNavigate("employees")}
        />

        <SectionTitle>Configuration</SectionTitle>
        <NavLink
          active={activeKey === "video-intros"}
          label="Video Intros"
          leftSection={<IconVideo size={18} />}
          onClick={() => onNavigate("video-intros")}
        />
        <NavLink
          active={activeKey === "questionnaires"}
          label="Video Questionnaires"
          leftSection={<IconListDetails size={18} />}
          onClick={() => onNavigate("questionnaires")}
        />

        <SectionTitle>Support</SectionTitle>
        <NavLink
          active={activeKey === "help"}
          label="Help"
          leftSection={<IconQuestionMark size={18} />}
          onClick={() => onNavigate("help")}
        />
      </ScrollArea>
    </AppShell.Navbar>
  );
}
