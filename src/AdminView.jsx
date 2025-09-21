import React, { useEffect, useState } from "react";
import {
  Card, Stack, Group, Text, Button, TextInput, ColorInput, Select, MultiSelect,
  NumberInput, Switch, FileButton, Badge, Table, ScrollArea, Divider,
  NavLink, Grid, Modal, ActionIcon, rem
} from "@mantine/core";
import { IconUpload, IconDeviceFloppy, IconTrash, IconPlus, IconSettings } from "@tabler/icons-react";

const LS_KEY = "sop_admin_settings_v1";

const defaultSettings = {
  company: { name: "FreshFork Hospitality", brandColor: "#0ea5e9", timezone: "America/Los_Angeles", weekStart: "Mon", locale: "en-US", logo: null },
  locations: [{ id: "loc_001", name: "Main St Diner", timezone: "America/Los_Angeles", managers: [] }],
  users: [],
  policies: { photoRetentionDays: 90, requirePhotoForCategories: [], requireNoteForFoodSafety: true },
  notifications: { dailyDigest: true, reworkAlerts: true, overdueAlerts: true },
  security: { pinLength: 4, pinExpiryDays: 180, lockoutThreshold: 5, dualSignoff: false },
  theme: { defaultScheme: "auto", accent: "#0ea5e9" },
};

export default function AdminView({ tasklists, submissions, onBrandColorChange }) {
  const [view, setView] = useState("company");
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
    onBrandColorChange?.(settings.company.brandColor);
  }, [settings, onBrandColorChange]);

  const saveToast = () => alert("Settings saved");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(240px, 280px) 1fr",
        gap: "16px",
        alignItems: "start",
        minHeight: "calc(100dvh - 64px - 16px)", // header 64 + page padding 16
      }}
    >
      {/* Left nav — sticky relative to header */}
      <Card
        withBorder
        radius="md"
        style={{
          position: "sticky",
          height: "fit-content",
          zIndex: 1,
        }}
      >
        <Text fw={700} mb="xs">Admin Settings</Text>
        <Stack gap={2}>
          <NavLink active={view === "company"} label="Company" onClick={() => setView("company")} leftSection={<IconSettings size={16} />} />
          <NavLink active={view === "locations"} label="Locations" onClick={() => setView("locations")} />
          <NavLink active={view === "users"} label="Users & Roles" onClick={() => setView("users")} />
          <NavLink active={view === "checklists"} label="Checklists & Templates" onClick={() => setView("checklists")} />
          <NavLink active={view === "policies"} label="Evidence & Compliance" onClick={() => setView("policies")} />
          <NavLink active={view === "notifications"} label="Notifications" onClick={() => setView("notifications")} />
          <NavLink active={view === "security"} label="Security & PIN" onClick={() => setView("security")} />
          <NavLink active={view === "branding"} label="Branding & Theme" onClick={() => setView("branding")} />
          <NavLink active={view === "data"} label="Data & Export" onClick={() => setView("data")} />
        </Stack>
      </Card>

      {/* Right pane — fills remaining space and scrolls */}
      <ScrollArea.Autosize
        mah="calc(100dvh - 64px - 16px)"
        type="auto"
        scrollbarSize={8}
        styles={{ viewport: { overflowX: "hidden" } }}
        style={{ minWidth: 0 }} // IMPORTANT so it can shrink and fill
      >
        <div style={{ minWidth: 0 }}>
          {view === "company" && <CompanyPane settings={settings} setSettings={setSettings} onSave={saveToast} />}
          {view === "locations" && <LocationsPane settings={settings} setSettings={setSettings} onSave={saveToast} />}
          {view === "users" && <UsersPane settings={settings} setSettings={setSettings} onSave={saveToast} />}
          {view === "policies" && <PoliciesPane settings={settings} setSettings={setSettings} onSave={saveToast} />}
          {view === "notifications" && <NotificationsPane settings={settings} setSettings={setSettings} onSave={saveToast} />}
          {view === "security" && <SecurityPane settings={settings} setSettings={setSettings} onSave={saveToast} />}
          {view === "branding" && <BrandingPane settings={settings} setSettings={setSettings} onSave={saveToast} />}
          {view === "checklists" && <ComingSoon label="Checklists & Templates" />}
          {view === "data" && <ComingSoon label="Data & Export" />}
        </div>
      </ScrollArea.Autosize>
    </div>
  );
}

/* ---------- PANES ---------- */

function CompanyPane({ settings, setSettings, onSave }) {
  const s = settings.company;
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Company</Text>
      <Stack gap="sm">
        <TextInput label="Company name" value={s.name} onChange={(e) => setSettings({ ...settings, company: { ...s, name: e.target.value } })} />
        <ColorInput label="Brand color" value={s.brandColor} onChange={(v) => setSettings({ ...settings, company: { ...s, brandColor: v } })} />
        <Select
          label="Timezone"
          value={s.timezone}
          onChange={(v) => setSettings({ ...settings, company: { ...s, timezone: v } })}
          data={["America/Los_Angeles", "America/Vancouver", "America/New_York", "UTC"]}
          comboboxProps={{ withinPortal: true }}
        />
        <Group grow wrap="nowrap">
          <Select
            label="Week starts on"
            value={s.weekStart}
            onChange={(v) => setSettings({ ...settings, company: { ...s, weekStart: v } })}
            data={["Mon", "Sun"]}
            comboboxProps={{ withinPortal: true }}
          />
          <Select
            label="Locale"
            value={s.locale}
            onChange={(v) => setSettings({ ...settings, company: { ...s, locale: v } })}
            data={["en-US", "en-CA", "fr-CA"]}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
        <Group wrap="wrap">
          <FileButton onChange={(file) => file && setSettings({ ...settings, company: { ...s, logo: file.name } })} accept="image/*">
            {(props) => <Button leftSection={<IconUpload size={16} />} variant="default" {...props}>Upload logo</Button>}
          </FileButton>
          {s.logo && <Badge variant="light">{s.logo}</Badge>}
        </Group>
        <Divider />
        <Group justify="flex-end">
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave}>Save</Button>
        </Group>
      </Stack>
    </Card>
  );
}

function LocationsPane({ settings, setSettings, onSave }) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", timezone: "America/Los_Angeles" });

  const addLocation = () => {
    if (!draft.name.trim()) return;
    const id = `loc_${Date.now()}`;
    setSettings({
      ...settings,
      locations: [...settings.locations, { id, name: draft.name.trim(), timezone: draft.timezone, managers: [] }],
    });
    setAddOpen(false);
    setDraft({ name: "", timezone: "America/Los_Angeles" });
  };

  const removeLocation = (id) =>
    setSettings({ ...settings, locations: settings.locations.filter((l) => l.id !== id) });

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Locations</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>Add location</Button>
      </Group>

      <ScrollArea.Autosize mah={360} type="auto" scrollbarSize={8} styles={{ viewport: { overflowX: "hidden" } }}>
        <Table
          highlightOnHover
          withColumnBorders={false}
          style={{ tableLayout: "fixed", width: "100%" }}
        >
          <colgroup>
            <col style={{ width: "52%" }} />
            <col style={{ width: "38%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Timezone</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {settings.locations.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>
                  <TextInput
                    value={l.name}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        locations: settings.locations.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)),
                      })
                    }
                    w="100%"
                    miw={rem(160)}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    value={l.timezone}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        locations: settings.locations.map((x) => (x.id === l.id ? { ...x, timezone: v } : x)),
                      })
                    }
                    data={["America/Los_Angeles", "America/Vancouver", "America/New_York", "UTC"]}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon color="red" variant="subtle" onClick={() => removeLocation(l.id)} title="Delete">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Group justify="flex-end" mt="sm">
        <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave}>Save</Button>
      </Group>

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add location" centered>
        <Stack>
          <TextInput label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Select
            label="Timezone"
            value={draft.timezone}
            onChange={(v) => setDraft({ ...draft, timezone: v })}
            data={["America/Los_Angeles", "America/Vancouver", "America/New_York", "UTC"]}
            comboboxProps={{ withinPortal: true }}
          />
          <Group justify="flex-end">
            <Button onClick={addLocation}>Add</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

function UsersPane({ settings, setSettings, onSave }) {
  const [invite, setInvite] = useState({ email: "", role: "Employee", locations: [] });

  const addUser = () => {
    if (!invite.email.trim()) return;
    const id = `u_${Date.now()}`;
    const user = { id, email: invite.email.trim(), role: invite.role, locations: invite.locations };
    setSettings({ ...settings, users: [user, ...settings.users] });
    setInvite({ email: "", role: "Employee", locations: [] });
  };

  const removeUser = (id) =>
    setSettings({ ...settings, users: settings.users.filter((u) => u.id !== id) });

  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Users & Roles</Text>
      <Stack gap="sm">
        <Group grow wrap="wrap">
          <TextInput
            label="Email"
            placeholder="person@company.com"
            value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })}
          />
          <Select
            label="Role"
            value={invite.role}
            onChange={(v) => setInvite({ ...invite, role: v })}
            data={["Admin", "Manager", "Employee"]}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
        <MultiSelect
          label="Assign to locations"
          placeholder="Pick one or more"
          data={settings.locations.map((l) => ({ value: l.id, label: l.name }))}
          value={invite.locations}
          onChange={(values) => setInvite({ ...invite, locations: values })}
          searchable
          comboboxProps={{ withinPortal: true }}
        />
        <Group justify="flex-end">
          <Button leftSection={<IconPlus size={16} />} onClick={addUser}>Invite</Button>
        </Group>
      </Stack>

      <Divider my="md" />

      <ScrollArea.Autosize mah={360} type="auto" scrollbarSize={8} styles={{ viewport: { overflowX: "hidden" } }}>
        <Table
          highlightOnHover
          style={{ tableLayout: "fixed", width: "100%" }}
        >
          <colgroup>
            <col style={{ width: "36%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "36%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Locations</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {settings.users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</Table.Td>
                <Table.Td>
                  <Select
                    value={u.role}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        users: settings.users.map((x) => (x.id === u.id ? { ...x, role: v } : x)),
                      })
                    }
                    data={["Admin", "Manager", "Employee"]}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <MultiSelect
                    data={settings.locations.map((l) => ({ value: l.id, label: l.name }))}
                    value={u.locations}
                    onChange={(vals) =>
                      setSettings({
                        ...settings,
                        users: settings.users.map((x) => (x.id === u.id ? { ...x, locations: vals } : x)),
                      })
                    }
                    searchable
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon color="red" variant="subtle" onClick={() => removeUser(u.id)} title="Remove">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Group justify="flex-end" mt="sm">
        <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave}>Save</Button>
      </Group>
    </Card>
  );
}

function PoliciesPane({ settings, setSettings, onSave }) {
  const p = settings.policies;
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Evidence & Compliance</Text>
      <Stack gap="sm">
        <NumberInput
          label="Photo retention (days)"
          min={7}
          max={3650}
          value={p.photoRetentionDays}
          onChange={(v) => setSettings({ ...settings, policies: { ...p, photoRetentionDays: Number(v) || 0 } })}
        />
        <Switch
          label="Require note for Food Safety tasks"
          checked={p.requireNoteForFoodSafety}
          onChange={(e) => setSettings({ ...settings, policies: { ...p, requireNoteForFoodSafety: e.currentTarget.checked } })}
        />
        <Text fz="sm" c="dimmed">Category-based photo rules can be added later (global overrides per-task settings).</Text>
        <Group justify="flex-end"><Button onClick={onSave}>Save</Button></Group>
      </Stack>
    </Card>
  );
}

function NotificationsPane({ settings, setSettings, onSave }) {
  const n = settings.notifications;
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Notifications</Text>
      <Stack>
        <Switch label="Daily digest to managers" checked={n.dailyDigest}
          onChange={(e) => setSettings({ ...settings, notifications: { ...n, dailyDigest: e.currentTarget.checked } })} />
        <Switch label="Rework alerts" checked={n.reworkAlerts}
          onChange={(e) => setSettings({ ...settings, notifications: { ...n, reworkAlerts: e.currentTarget.checked } })} />
        <Switch label="Overdue checklist alerts" checked={n.overdueAlerts}
          onChange={(e) => setSettings({ ...settings, notifications: { ...n, overdueAlerts: e.currentTarget.checked } })} />
        <Group justify="flex-end"><Button onClick={onSave}>Save</Button></Group>
      </Stack>
    </Card>
  );
}

function SecurityPane({ settings, setSettings, onSave }) {
  const sec = settings.security;
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Security & PIN</Text>
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <NumberInput label="PIN length" min={4} max={8} value={sec.pinLength}
            onChange={(v) => setSettings({ ...settings, security: { ...sec, pinLength: Number(v) || 4 } })} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <NumberInput label="PIN expiry (days)" min={0} max={3650} value={sec.pinExpiryDays}
            onChange={(v) => setSettings({ ...settings, security: { ...sec, pinExpiryDays: Number(v) || 0 } })} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <NumberInput label="Lockout after failed attempts" min={0} max={10} value={sec.lockoutThreshold}
            onChange={(v) => setSettings({ ...settings, security: { ...sec, lockoutThreshold: Number(v) || 0 } })} />
        </Grid.Col>
      </Grid>
      <Switch mt="sm" label="Two-person signoff (dual approval)" checked={sec.dualSignoff}
        onChange={(e) => setSettings({ ...settings, security: { ...sec, dualSignoff: e.currentTarget.checked } })} />
      <Group justify="flex-end" mt="md"><Button onClick={onSave}>Save</Button></Group>
    </Card>
  );
}

function BrandingPane({ settings, setSettings, onSave }) {
  const t = settings.theme;
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Branding & Theme</Text>
      <Stack gap="sm">
        <Select
          label="Default color scheme"
          value={t.defaultScheme}
          onChange={(v) => setSettings({ ...settings, theme: { ...t, defaultScheme: v } })}
          data={[
            { value: "auto", label: "Auto" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          comboboxProps={{ withinPortal: true }}
        />
        <ColorInput label="Accent color" value={t.accent} onChange={(v) => setSettings({ ...settings, theme: { ...t, accent: v } })} />
        <Group justify="flex-end"><Button onClick={onSave}>Save</Button></Group>
      </Stack>
    </Card>
  );
}

function ComingSoon({ label }) {
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">{label}</Text>
      <Text c="dimmed">Coming soon</Text>
    </Card>
  );
}
