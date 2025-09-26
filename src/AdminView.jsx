import React, { useCallback, useEffect, useState } from "react";
import {
  Card, Stack, Group, Text, Button, TextInput, ColorInput, Select, MultiSelect,
  NumberInput, Switch, FileButton, Badge, Table, ScrollArea, Divider,
  NavLink, Grid, Modal, ActionIcon, rem
} from "@mantine/core";

import { supabase } from "./lib/supabase.js";

import { IconUpload, IconDeviceFloppy, IconTrash, IconPlus, IconSettings } from "@tabler/icons-react";
import { useSettings } from "./settings-store.jsx";
import {
  hydrateAll, updateCompany,
  listLocations, createLocation, updateLocation, deleteLocation,
  listUsers, createUser, updateUser, deleteUser,
  listTimeBlocks, upsertTimeBlock, removeTimeBlock,
  listTasklistTemplates, upsertTasklistTemplateWithTasks, deleteTasklistTemplate
} from "./queries.js";

export default function AdminView({ onAfterLocationsChange }) {
  const { settings, updateSettings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const companyId = "4f0be4a0-bb1b-409e-bb98-8e6fbd0c8ccb"; // make sure this is set in your SettingsProvider init

  const [view, setView] = useState("company");
  const [draft, setDraft] = useState({
    company: { name: "", brandColor: "#0ea5e9", timezone: "UTC", weekStart: "Mon", locale: "en-US", logo: null },
    policies: { photoRetentionDays: 90, requireNoteForFoodSafety: true },
    notifications: { dailyDigest: true, reworkAlerts: true, overdueAlerts: true },
    security: { pinLength: 4, pinExpiryDays: 180, lockoutThreshold: 5, dualSignoff: false },
    theme: { defaultScheme: "auto", accent: "#0ea5e9" },
    checklists: { timeBlocks: [], templates: [], overrides: [] },
    locations: []
  });

  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);

  // ------- Refreshers
  const refreshLocations = useCallback(async () => {
    const rows = await listLocations();
    setLocations(Array.isArray(rows) ? rows : []);
  }, []);

  const refreshUsers = useCallback(async () => {
    const rows = await listUsers(companyId);
    setUsers(Array.isArray(rows) ? rows : []);
  }, [companyId]);

  // Initial fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([refreshLocations(), refreshUsers()]);
      // hydrate non-list stuff if you want:
      const all = await hydrateAll(companyId);
      alive && setDraft(prev => ({ ...prev, ...all }));
    })();
    return () => { alive = false; };
  }, [refreshLocations, refreshUsers, companyId]);

  // ------- Realtime subscriptions (auto-update on external changes)
  useEffect(() => {
    const ch = supabase
      .channel("admin-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "location" }, async () => { await refreshLocations(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_user", filter: `company_id=eq.${companyId}` }, async () => { await refreshUsers(); })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [companyId, refreshLocations, refreshUsers]);

  // ------- Company save
  const saveDraftToApp = async () => {
    await updateCompany(companyId, {
      name: draft.company.name,
      brand_color: draft.company.brandColor,
      timezone: draft.company.timezone,
    });
    // If you store company in local state, patch it optimistically; or re-hydrate:
    const all = await hydrateAll(companyId);
    setDraft(prev => ({ ...prev, ...all }));
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(240px, 280px) 1fr",
        gap: "16px",
        alignItems: "start",
        minHeight: "calc(100dvh - 64px - 16px)",
      }}
    >
      <Card
        withBorder
        radius="md"
        style={{ position: "sticky", height: "fit-content", zIndex: 1, top: 80 }}
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

      <ScrollArea.Autosize
        mah="calc(100dvh - 64px - 16px)"
        type="auto"
        scrollbarSize={8}
        styles={{ viewport: { overflowX: "hidden" } }}
        style={{ minWidth: 0 }}
      >
        <div style={{ minWidth: 0 }}>
          {view === "company" && (
            <CompanyPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />
          )}

          {view === "locations" && (
            <LocationsPane
              locations={locations}
              companyId={companyId}
              onAdd={async (row) => { await createLocation(row); await refreshLocations(); onAfterLocationsChange?.(); }}
              onUpdate={async (id, patch) => {
                // optimistic
                setLocations(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
                await updateLocation(id, patch);
                onAfterLocationsChange?.();
              }}
              onDelete={async (id) => {
                setLocations(prev => prev.filter(l => l.id !== id));
                await deleteLocation(id); await refreshLocations();
                onAfterLocationsChange?.();
              }}
            />
          )}

          {view === "users" && (
            <UsersPane
              companyId={companyId}
              users={users}
              locations={locations}
              onInvite={async (row) => { await createUser({ ...row, company_id: companyId }); await refreshUsers(); }}
              onUpdate={async (id, patch) => {
                setUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
                await updateUser(id, patch);
              }}
              onDelete={async (id) => {
                setUsers(prev => prev.filter(u => u.id !== id));
                await deleteUser(id);
              }}
            />
          )}
          {view === "policies" && <PoliciesPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />}
          {view === "notifications" && <NotificationsPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />}
          {view === "security" && <SecurityPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />}
          {view === "branding" && <BrandingPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />}
          {view === "checklists" && <ChecklistsPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />}
          {view === "data" && (
            <DataPane
              settings={draft}
              submissions={submissions}
              onImportSettings={(json) => setDraft(json)}
              onSeedDemo={settings?.__seedDemo}
            />
          )}

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
          <FileButton
            onChange={async (file) => {
              if (!file) return;
              const dataUrl = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = rej;
                r.readAsDataURL(file);
              });
              setSettings({ ...settings, company: { ...s, logo: dataUrl } });
            }}
            accept="image/*"
          >
            {(props) => (
              <Button leftSection={<IconUpload size={16} />} variant="default" {...props}>
                Upload logo
              </Button>
            )}
          </FileButton>
          {s.logo && <Badge variant="light">Logo selected</Badge>}
        </Group>
        <Divider />
        <Group justify="flex-end">
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave}>Save</Button>
        </Group>
      </Stack>
    </Card>
  );
}

function LocationsPane({ locations, onAdd, onUpdate, onDelete, companyId }) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", timezone: "America/Los_Angeles", company_id: companyId });

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Locations</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>Add location</Button>
      </Group>

      <ScrollArea.Autosize mah={360} type="auto" scrollbarSize={8} styles={{ viewport: { overflowX: "hidden" } }}>
        <Table highlightOnHover style={{ tableLayout: "fixed", width: "100%" }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Timezone</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {locations.map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>
                  <TextInput
                    value={l.name}
                    onChange={(e) => onUpdate(l.id, { name: e.currentTarget.value })}
                    w="100%"
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    value={l.timezone}
                    onChange={(v) => onUpdate(l.id, { timezone: v })}
                    data={["America/Los_Angeles", "America/Vancouver", "America/New_York", "UTC"]}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon color="red" variant="subtle" onClick={() => onDelete(l.id)} title="Delete">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>


      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add location" centered>
        <Stack>
          <TextInput label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Select
            label="Timezone"
            value={draft.timezone}
            data={["America/Los_Angeles", "America/Vancouver", "America/New_York", "UTC"]}
            onChange={(v) => setDraft({ ...draft, timezone: v })}
            comboboxProps={{ withinPortal: true, zIndex: 11000 }}
          />

          <Group justify="flex-end">
            <Button onClick={async () => { await onAdd(draft); setAddOpen(false); setDraft({ name: "", timezone: "America/Los_Angeles", company_id: companyId }); }}>
              Add
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

function UsersPane({ companyId, users, locations, onInvite, onUpdate, onDelete }) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({
    email: "",
    display_name: "",
    role: "Employee",
    // If your DB column is "location_id", rename this field and the two noted update spots below.
    location: locations[0]?.id || null,
    is_active: true,
    pin: null,
  });

  const roleOptions = ["Admin", "Manager", "Employee"];
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }));

  function resetDraft() {
    setDraft({
      email: "",
      display_name: "",
      role: "Employee",
      location: locations[0]?.id || null,
      is_active: true,
      pin: null,
    });
  }

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Users & Roles</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>
          Add user
        </Button>
      </Group>

      <ScrollArea.Autosize
        mah={360}
        type="auto"
        scrollbarSize={8}
        styles={{ viewport: { overflowX: "hidden" } }}
      >
        <Table highlightOnHover style={{ tableLayout: "fixed", width: "100%" }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: "24%" }}>Name</Table.Th>
              <Table.Th style={{ width: "26%" }}>Email</Table.Th>
              <Table.Th style={{ width: "16%" }}>Role</Table.Th>
              <Table.Th style={{ width: "24%" }}>Location</Table.Th>
              <Table.Th style={{ width: "6%" }}>Active</Table.Th>
              <Table.Th style={{ width: "4%" }} />
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>
                  <TextInput
                    value={u.display_name ?? ""}
                    onChange={(e) => onUpdate(u.id, { display_name: e.currentTarget.value })}
                    w="100%"
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    value={u.email ?? ""}
                    onChange={(e) => onUpdate(u.id, { email: e.currentTarget.value })}
                    w="100%"
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    value={u.role ?? "Employee"}
                    data={["Admin", "Manager", "Employee"]}
                    onChange={(v) => onUpdate(u.id, { role: v })}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Select
                    data={locations.map((l) => ({ value: l.id, label: l.name }))}
                    value={u.location ?? null}     // or u.location_id if that's your column
                    onChange={(v) => onUpdate(u.id, { location: v })} // or location_id: v
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={u.is_active !== false}
                    onChange={(e) => onUpdate(u.id, { is_active: e.currentTarget.checked })}
                    aria-label="Active"
                  />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => onDelete(u.id)}
                      title="Remove"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

      </ScrollArea.Autosize>

      {/* Add user modal (mirrors Locations "Add") */}
      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add user" centered>
        <Stack gap="sm">
          <Group grow wrap="wrap">
            <TextInput
              label="Name"
              placeholder="John Doe"
              value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.currentTarget.value })}
            />
            <TextInput
              label="Email"
              placeholder="person@company.com"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.currentTarget.value })}
            />
          </Group>

          <Group grow wrap="nowrap">
            <Select
              label="Role"
              value={draft.role}
              onChange={(v) => setDraft({ ...draft, role: v })}
              data={roleOptions}
              comboboxProps={{ withinPortal: true, zIndex: 11000 }}
            />
            <Select
              label="Assign to location"
              data={locationOptions}
              // If your column is "location_id", rename field here and in create call.
              value={draft.location}
              onChange={(v) => setDraft({ ...draft, location: v })}
              comboboxProps={{ withinPortal: true, zIndex: 11000 }}
            />
          </Group>

          <Switch
            label="Active"
            checked={draft.is_active}
            onChange={(e) => setDraft({ ...draft, is_active: e.currentTarget.checked })}
          />

          <Group justify="flex-end" mt="xs">
            <Button
              onClick={async () => {
                if (!draft.email.trim()) return alert("Email is required.");
                await onInvite(draft); // parent already adds company_id and refreshes
                resetDraft();
                setAddOpen(false);
              }}
              leftSection={<IconPlus size={16} />}
            >
              Add
            </Button>
          </Group>
        </Stack>
      </Modal>
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

function ChecklistsPane({ settings, setSettings, onSave }) {
  const stores = settings.checklists || { timeBlocks: [], templates: [], overrides: [] };

  // Local UI state
  const [tab, setTab] = useState("templates"); // "templates" | "timeblocks" | "adhoc"
  const [createTplOpen, setCreateTplOpen] = useState(false);
  const [editTplOpen, setEditTplOpen] = useState(false);
  const [tplDraft, setTplDraft] = useState(initTemplateDraft());
  const [activeTplId, setActiveTplId] = useState(null);

  const [tbOpen, setTbOpen] = useState(false);
  const [tbDraft, setTbDraft] = useState(initTimeBlockDraft());

  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocDraft, setAdhocDraft] = useState(initAdhocDraft(settings.locations?.[0]?.id));

  function initTemplateDraft() {
    return {
      id: makeId("tpl"),
      name: "",
      locationId: settings.locations?.[0]?.id || "",
      timeBlockId: stores.timeBlocks?.[0]?.id || "",
      recurrence: [0, 1, 2, 3, 4, 5, 6],
      tasks: []
    };
  }

  function initTimeBlockDraft() {
    return { id: "", name: "", start: "09:00", end: "17:00" };
  }

  function initAdhocDraft(defaultLocation) {
    return {
      id: makeId("ovr"),
      date: new Date().toISOString().slice(0, 10),
      locationId: defaultLocation || "",
      timeBlockId: stores.timeBlocks?.[0]?.id || "",
      tasks: []
    };
  }

  function makeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
  }

  // Save helpers on settings
  function upsertTemplate(tpl, mode) {
    const exists = stores.templates.findIndex(t => t.id === tpl.id);
    const next = { ...settings, checklists: { ...stores } };
    if (exists >= 0 && mode !== "duplicate") {
      next.checklists.templates = stores.templates.map(t => t.id === tpl.id ? tpl : t);
    } else {
      next.checklists.templates = [...stores.templates, { ...tpl, id: mode === "duplicate" ? makeId("tpl") : tpl.id }];
    }
    setSettings(next);
  }

  function removeTemplate(id) {
    const next = { ...settings, checklists: { ...stores, templates: stores.templates.filter(t => t.id !== id) } };
    setSettings(next);
    if (activeTplId === id) setActiveTplId(null);
  }

  function upsertTimeBlock(tb) {
    const exists = stores.timeBlocks.findIndex(t => t.id === tb.id);
    const next = { ...settings, checklists: { ...stores } };
    if (!tb.id.trim()) return;
    if (exists >= 0) {
      next.checklists.timeBlocks = stores.timeBlocks.map(t => t.id === tb.id ? tb : t);
    } else {
      next.checklists.timeBlocks = [...stores.timeBlocks, tb];
    }
    setSettings(next);
  }

  function removeTimeBlock(id) {
    const next = { ...settings, checklists: { ...stores, timeBlocks: stores.timeBlocks.filter(t => t.id !== id) } };
    setSettings(next);
  }

  function addTaskToDraftTemplate(taskDraft) {
    setTplDraft(prev => ({ ...prev, tasks: [...prev.tasks, { ...taskDraft, id: makeId("tt") }] }));
  }

  function updateTaskInDraftTemplate(taskId, patch) {
    setTplDraft(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) }));
  }

  function removeTaskFromDraftTemplate(taskId) {
    setTplDraft(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) }));
  }

  function addTaskToAdhoc(taskDraft) {
    setAdhocDraft(prev => ({ ...prev, tasks: [...prev.tasks, { ...taskDraft, id: makeId("adh") }] }));
  }

  function removeTaskFromAdhoc(taskId) {
    setAdhocDraft(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) }));
  }

  function saveAdhocOverride() {
    const exists = stores.overrides.findIndex(o => o.id === adhocDraft.id);
    const next = { ...settings, checklists: { ...stores } };
    if (exists >= 0) {
      next.checklists.overrides = stores.overrides.map(o => o.id === adhocDraft.id ? adhocDraft : o);
    } else {
      next.checklists.overrides = [...stores.overrides, adhocDraft];
    }
    setSettings(next);
    setAdhocOpen(false);
    setAdhocDraft(initAdhocDraft(settings.locations?.[0]?.id));
  }

  const timeBlockOptions = stores.timeBlocks.map(tb => ({ value: tb.id, label: `${tb.name} (${tb.start}–${tb.end})` }));
  const locationOptions = settings.locations.map(l => ({ value: l.id, label: l.name }));

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Checklists & Templates</Text>
        <Group gap="xs">
          <Button variant={tab === "timeblocks" ? "filled" : "default"} onClick={() => setTab("timeblocks")}>Time Blocks</Button>
          <Button variant={tab === "templates" ? "filled" : "default"} onClick={() => setTab("templates")}>Templates</Button>
          <Button variant={tab === "adhoc" ? "filled" : "default"} onClick={() => setTab("adhoc")}>Ad-hoc Tasks</Button>
        </Group>
      </Group>

      {tab === "timeblocks" && (
        <Stack gap="sm">
          <Group>
            <Button leftSection={<IconPlus size={16} />} onClick={() => { setTbDraft(initTimeBlockDraft()); setTbOpen(true); }}>
              New time block
            </Button>
          </Group>

          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Start</Table.Th>
                <Table.Th>End</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stores.timeBlocks.map(tb => (
                <Table.Tr key={tb.id}>
                  <Table.Td><Badge variant="light">{tb.id}</Badge></Table.Td>
                  <Table.Td>{tb.name}</Table.Td>
                  <Table.Td>{tb.start}</Table.Td>
                  <Table.Td>{tb.end}</Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <Button size="xs" variant="default" onClick={() => { setTbDraft(tb); setTbOpen(true); }}>Edit</Button>
                      <ActionIcon color="red" variant="subtle" onClick={() => removeTimeBlock(tb.id)} title="Delete"><IconTrash size={16} /></ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group justify="flex-end"><Button onClick={onSave}>Save</Button></Group>

          <Modal opened={tbOpen} onClose={() => setTbOpen(false)} title="Time block" centered>
            <Stack>
              <TextInput label="ID (e.g., open, mid, close)" value={tbDraft.id} onChange={(e) => setTbDraft({ ...tbDraft, id: e.target.value })} />
              <TextInput label="Name" value={tbDraft.name} onChange={(e) => setTbDraft({ ...tbDraft, name: e.target.value })} />
              <Group grow>
                <TextInput label="Start (HH:MM)" value={tbDraft.start} onChange={(e) => setTbDraft({ ...tbDraft, start: e.target.value })} />
                <TextInput label="End (HH:MM)" value={tbDraft.end} onChange={(e) => setTbDraft({ ...tbDraft, end: e.target.value })} />
              </Group>
              <Group justify="flex-end">
                <Button onClick={() => { upsertTimeBlock(tbDraft); setTbOpen(false); }}>Save</Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      )}

      {tab === "templates" && (
        <Stack gap="sm">
          <Group>
            <Button leftSection={<IconPlus size={16} />} onClick={() => { setTplDraft(initTemplateDraft()); setCreateTplOpen(true); }}>
              New template
            </Button>
          </Group>

          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Location</Table.Th>
                <Table.Th>Time block</Table.Th>
                <Table.Th>Days</Table.Th>
                <Table.Th>Tasks</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stores.templates.map(tpl => {
                const tb = stores.timeBlocks.find(x => x.id === tpl.timeBlockId);
                const loc = settings.locations.find(l => l.id === tpl.locationId);
                return (
                  <Table.Tr key={tpl.id}>
                    <Table.Td><Text fw={600}>{tpl.name}</Text></Table.Td>
                    <Table.Td>{loc?.name || "-"}</Table.Td>
                    <Table.Td>{tb ? `${tb.name} (${tb.start}–${tb.end})` : tpl.timeBlockId}</Table.Td>
                    <Table.Td>{tpl.recurrence.join(",")}</Table.Td>
                    <Table.Td>{tpl.tasks.length}</Table.Td>
                    <Table.Td>
                      <Group justify="flex-end" gap="xs">
                        <Button size="xs" variant="default" onClick={() => { setActiveTplId(tpl.id); setTplDraft(tpl); setEditTplOpen(true); }}>Edit</Button>
                        <Button size="xs" variant="default" onClick={() => upsertTemplate(tpl, "duplicate")}>Duplicate</Button>
                        <ActionIcon color="red" variant="subtle" onClick={() => removeTemplate(tpl.id)} title="Delete"><IconTrash size={16} /></ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          <Group justify="flex-end"><Button onClick={onSave}>Save</Button></Group>

          <Modal opened={createTplOpen || editTplOpen} onClose={() => { setCreateTplOpen(false); setEditTplOpen(false); }} title="Template" centered>
            <Stack gap="sm">
              <TextInput label="Template name" value={tplDraft.name} onChange={(e) => setTplDraft({ ...tplDraft, name: e.target.value })} />
              <Group grow wrap="nowrap">
                <Select
                  label="Location"
                  value={tplDraft.locationId}
                  onChange={(v) => setTplDraft({ ...tplDraft, locationId: v })}
                  data={locationOptions}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                />
                <Select
                  label="Time block"
                  value={tplDraft.timeBlockId}
                  onChange={(v) => setTplDraft({ ...tplDraft, timeBlockId: v })}
                  data={timeBlockOptions}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                />
              </Group>
              <Select
                label="Days of week (0=Sun...6=Sat)"
                data={["0", "1", "2", "3", "4", "5", "6"].map(x => ({ value: x, label: x }))}
                value={tplDraft.recurrence.map(String)}
                onChange={(arr) => setTplDraft({ ...tplDraft, recurrence: (arr || []).map(x => Number(x)) })}
                multiple
                searchable
                comboboxProps={{ withinPortal: true, zIndex: 11000 }}
              />

              <TaskEditor
                tasks={tplDraft.tasks}
                onAdd={(task) => addTaskToDraftTemplate(task)}
                onChange={(taskId, patch) => updateTaskInDraftTemplate(taskId, patch)}
                onRemove={(taskId) => removeTaskFromDraftTemplate(taskId)}
              />

              <Group justify="flex-end">
                <Button onClick={() => {
                  upsertTemplate(tplDraft, createTplOpen ? "create" : "update");
                  setCreateTplOpen(false);
                  setEditTplOpen(false);
                }}>
                  Save template
                </Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      )}

      {tab === "adhoc" && (
        <Stack>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Ad-hoc (one-off) tasks</Text>
            <Button leftSection={<IconPlus size={16} />} onClick={() => { setAdhocDraft(initAdhocDraft(settings.locations?.[0]?.id)); setAdhocOpen(true); }}>
              Add ad-hoc
            </Button>
          </Group>

          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Location</Table.Th>
                <Table.Th>Time block</Table.Th>
                <Table.Th>Tasks</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stores.overrides.map(ovr => {
                const tb = stores.timeBlocks.find(x => x.id === ovr.timeBlockId);
                const loc = settings.locations.find(l => l.id === ovr.locationId);
                return (
                  <Table.Tr key={ovr.id}>
                    <Table.Td>{ovr.date}</Table.Td>
                    <Table.Td>{loc?.name || "-"}</Table.Td>
                    <Table.Td>{tb ? `${tb.name} (${tb.start}–${tb.end})` : ovr.timeBlockId}</Table.Td>
                    <Table.Td>{ovr.tasks.length}</Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>

          <Group justify="flex-end"><Button onClick={onSave}>Save</Button></Group>

          <Modal opened={adhocOpen} onClose={() => setAdhocOpen(false)} title="Ad-hoc tasks" centered>
            <Stack>
              <Group grow>
                <TextInput label="Date (YYYY-MM-DD)" value={adhocDraft.date} onChange={(e) => setAdhocDraft({ ...adhocDraft, date: e.target.value })} />
                <Select
                  label="Location"
                  value={adhocDraft.locationId}
                  onChange={(v) => setAdhocDraft({ ...adhocDraft, locationId: v })}
                  data={locationOptions}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                />
                <Select
                  label="Time block"
                  value={adhocDraft.timeBlockId}
                  onChange={(v) => setAdhocDraft({ ...adhocDraft, timeBlockId: v })}
                  data={timeBlockOptions}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                />
              </Group>

              <TaskEditor
                tasks={adhocDraft.tasks}
                onAdd={(task) => addTaskToAdhoc(task)}
                onChange={(taskId, patch) => {
                  setAdhocDraft(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) }))
                }}
                onRemove={(taskId) => removeTaskFromAdhoc(taskId)}
              />

              <Group justify="flex-end">
                <Button onClick={saveAdhocOverride}>Save ad-hoc</Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      )}
    </Card>
  );
}

// Simple task editor reused for template and ad-hoc dialogs
function TaskEditor({ tasks, onAdd, onChange, onRemove }) {
  const [draft, setDraft] = useState({
    title: "",
    category: "",
    inputType: "checkbox", // 'checkbox' | 'number' | 'text'
    min: null,
    max: null,
    noteRequired: false,
    photoRequired: false,
    allowNA: true,
    priority: 3
  });

  function resetDraft() {
    setDraft({
      title: "",
      category: "",
      inputType: "checkbox",
      min: null,
      max: null,
      noteRequired: false,
      photoRequired: false,
      allowNA: true,
      priority: 3
    });
  }

  return (
    <Stack gap="sm">
      <Text fw={600}>Tasks</Text>

      <Table withColumnBorders={false} highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th className="hide-sm">Category</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th className="hide-sm">Range</Table.Th>
            <Table.Th className="hide-sm">Rules</Table.Th>
            <Table.Th>Priority</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map(t => (
            <Table.Tr key={t.id}>
              <Table.Td>
                <TextInput value={t.title} onChange={(e) => onChange(t.id, { title: e.target.value })} />
              </Table.Td>
              <Table.Td className="hide-sm">
                <TextInput value={t.category || ""} onChange={(e) => onChange(t.id, { category: e.target.value })} />
              </Table.Td>
              <Table.Td>
                <Select
                  value={t.inputType}
                  onChange={(v) => onChange(t.id, { inputType: v })}
                  data={["checkbox", "number", "text"].map(x => ({ value: x, label: x }))}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                />
              </Table.Td>
              <Table.Td className="hide-sm">
                <Group gap="xs" wrap="nowrap">
                  <NumberInput placeholder="min" value={t.min ?? ""} onChange={(v) => onChange(t.id, { min: v === "" ? null : Number(v) })} style={{ width: rem(90) }} />
                  <NumberInput placeholder="max" value={t.max ?? ""} onChange={(v) => onChange(t.id, { max: v === "" ? null : Number(v) })} style={{ width: rem(90) }} />
                </Group>
              </Table.Td>
              <Table.Td className="hide-sm">
                <Group gap="xs">
                  <Switch label="Photo" checked={!!t.photoRequired} onChange={(e) => onChange(t.id, { photoRequired: e.currentTarget.checked })} />
                  <Switch label="Note" checked={!!t.noteRequired} onChange={(e) => onChange(t.id, { noteRequired: e.currentTarget.checked })} />
                  <Switch label="N/A" checked={!!t.allowNA} onChange={(e) => onChange(t.id, { allowNA: e.currentTarget.checked })} />
                </Group>
              </Table.Td>
              <Table.Td>
                <NumberInput min={1} max={5} value={t.priority ?? 3} onChange={(v) => onChange(t.id, { priority: Number(v) || 3 })} style={{ width: rem(80) }} />
              </Table.Td>
              <Table.Td>
                <ActionIcon color="red" variant="subtle" onClick={() => onRemove(t.id)} title="Remove"><IconTrash size={16} /></ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Card withBorder radius="md" className="u-card">
        <Text fw={600} mb="xs">Add task</Text>
        <Group align="flex-end" gap="xs" wrap="wrap">
          <TextInput label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ minWidth: rem(220) }} />
          <TextInput label="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
          <Select
            label="Type"
            value={draft.inputType}
            onChange={(v) => setDraft({ ...draft, inputType: v })}
            data={["checkbox", "number", "text"].map(x => ({ value: x, label: x }))}
            comboboxProps={{ withinPortal: true, zIndex: 11000 }}
          />
          <NumberInput label="Min" value={draft.min ?? ""} onChange={(v) => setDraft({ ...draft, min: v === "" ? null : Number(v) })} style={{ width: rem(100) }} />
          <NumberInput label="Max" value={draft.max ?? ""} onChange={(v) => setDraft({ ...draft, max: v === "" ? null : Number(v) })} style={{ width: rem(100) }} />
          <Switch label="Photo req" checked={draft.photoRequired} onChange={(e) => setDraft({ ...draft, photoRequired: e.currentTarget.checked })} />
          <Switch label="Note req" checked={draft.noteRequired} onChange={(e) => setDraft({ ...draft, noteRequired: e.currentTarget.checked })} />
          <Switch label="Allow N/A" checked={draft.allowNA} onChange={(e) => setDraft({ ...draft, allowNA: e.currentTarget.checked })} />
          <NumberInput label="Priority" min={1} max={5} value={draft.priority} onChange={(v) => setDraft({ ...draft, priority: Number(v) || 3 })} style={{ width: rem(100) }} />
          <Button onClick={() => { if (!draft.title.trim()) return; onAdd(draft); resetDraft(); }}>Add</Button>
        </Group>
      </Card>
    </Stack>
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

function DataPane({ settings, submissions, onImportSettings, onSeedDemo }) {
  const download = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const json = JSON.parse(String(r.result));
        onImportSettings(json);
        alert("Settings imported");
      } catch {
        alert("Invalid JSON");
      }
    };
    r.readAsText(file);
  };

  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Data & Export</Text>
      <Stack gap="sm">
        <Group>
          <Button onClick={() => download("settings.json", settings)}>Export settings</Button>
          <FileButton onChange={handleImport} accept="application/json">
            {(props) => <Button variant="default" {...props}>Import settings</Button>}
          </FileButton>
        </Group>

        <Group>
          <Button onClick={() => download("submissions.json", submissions)}>Export submissions</Button>
          <Button variant="default" onClick={() => onSeedDemo?.()}>Seed demo submissions</Button>
        </Group>

        <Text c="dimmed" fz="sm">
          Use “Seed demo submissions” to generate realistic historical data for the Manager Dashboard/filters.
        </Text>
      </Stack>
    </Card>
  );
}
