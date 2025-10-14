import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import {
  Card, Stack, Group, Text, Button, TextInput, ColorInput, Select, MultiSelect,
  NumberInput, Switch, FileButton, Badge, Table, ScrollArea, Divider,
  NavLink, Grid, Modal, ActionIcon, Drawer, Burger, rem
} from "@mantine/core";

import { supabase } from "./lib/supabase.js";

import { IconUpload, IconDeviceFloppy, IconTrash, IconPlus, IconSettings } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import {
  hydrateAll, updateCompany,
  listLocations, createLocation, updateLocation, deleteLocation,
  listUsers, createUser, updateUser, deleteUser, uploadCompanyLogo,
  listTimeBlocks, upsertTimeBlock, removeTimeBlock,
  listTasklistTemplates, upsertTasklistTemplateWithTasks, deleteTasklistTemplate
} from "./lib/queries.js";

// Custom hook for debounced updates
function useDebouncedUpdate(updateFn, delay = 500) {
  const timeoutRef = useRef(null);
  
  const debouncedUpdate = useCallback((id, patch) => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      updateFn(id, patch);
    }, delay);
  }, [updateFn, delay]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return debouncedUpdate;
}

export default function AdminView({ companyId, refreshHeaderData, refreshCompanySettings, onReloadChecklists, employees }) {

  const [view, setView] = useState("company");
  const [draft, setDraft] = useState({
    company: { name: "", brandColor: "#0ea5e9", timezone: "UTC", weekStart: "Mon", locale: "en-US", logo: null, positions: [] },
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
    setUsers(Array.isArray(rows)
      ? rows.map(u => ({ ...u, pin: u.pin ?? "" })) // <-- keep controlled
      : []
    );
  }, [companyId]);

  // Initial fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([refreshLocations(), refreshUsers()]);
      // hydrate non-list stuff if you want:
      const all = await hydrateAll(companyId);
      alive && setDraft(prev => ({
        ...prev,
        company: {
          ...prev.company,
          ...toUiCompany(all.company), // <- normalize brand_color -> brandColor
        },
        locations: all.locations ?? prev.locations,
        users: all.users ?? prev.users,
        checklists: {
          ...prev.checklists,
          timeBlocks: all.timeBlocks ?? prev.checklists.timeBlocks,
          templates: all.templates ?? prev.checklists.templates,
        },
      }));
    })();
    return () => { alive = false; };
  }, [refreshLocations, refreshUsers, companyId]);

  // ------- Realtime subscriptions (auto-update on external changes)
  useEffect(() => {
    const ch = supabase
      .channel("admin-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "location" }, async () => { await refreshLocations(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_user", filter: `company_id=eq.${companyId}` }, async () => { await refreshUsers(); })
      // NEW: react to company updates (positions/name/color/logo/timezone)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company", filter: `id=eq.${companyId}` },
        async (payload) => {
          const c = payload?.new ?? {};
          setDraft(prev => ({
            ...prev,
            company: {
              ...prev.company,
              name: c.name ?? prev.company.name,
              brandColor: c.brand_color ?? prev.company.brandColor,
              timezone: c.timezone ?? prev.company.timezone,
              logo: c.logo ?? prev.company.logo,
              positions: Array.isArray(c.positions) ? c.positions : prev.company.positions,
            },
          }));
        }
      )
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

  useEffect(() => {
    refreshHeaderData();        // users/locations
    // refreshCompanySettings();   // <-- get company name/color/timezone on first load
  }, [refreshHeaderData]);

  // queries.js
  const toUiCompany = (r) => ({
    id: r.id,
    name: r.name ?? "",
    brandColor: r.brand_color ?? "#0ea5e9",
    timezone: r.timezone ?? "UTC",
    logo: r.logo ?? null,
    positions: Array.isArray(r.positions) ? r.positions : [],
  });

  const companyInitial = useMemo(() => ({
    name: draft.company.name,
    brandColor: draft.company.brandColor ?? draft.company.brand_color ?? "#0ea5e9",
    timezone: draft.company.timezone,
    weekStart: draft.company.weekStart,
    locale: draft.company.locale,
    logo: draft.company.logo,
    positions: draft.company.positions ?? [],
  }), [
    draft.company.name,
    draft.company.brandColor,
    draft.company.timezone,
    draft.company.weekStart,
    draft.company.locale,
    draft.company.logo,
    draft.company.positions,
  ]);


  const [navOpened, { open: openNav, close: closeNav, toggle: toggleNav }] = useDisclosure(false);

  return (
    <Stack gap="sm">
      {/* Mobile top bar for Admin section */}
      <Group px="xs" py={4} justify="space-between" hiddenFrom="sm">
        <Group gap="xs">
          <Burger opened={navOpened} onClick={toggleNav} aria-label="Open admin menu" />
          <Text fw={700}>Admin Settings</Text>
        </Group>
      </Group>

      <Grid gutter="sm" align="start">
        {/* Sidebar (visible on ≥sm) */}
        <Grid.Col span={{ base: 12, sm: 4, md: 3 }} visibleFrom="sm">
          <Card
            withBorder
            radius="md"
            className="sticky-card"
            style={{ position: "sticky", top: 80, height: "fit-content", zIndex: 1 }}
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
            </Stack>
          </Card>
        </Grid.Col>

        {/* Content */}
        <Grid.Col span={{ base: 12, sm: 8, md: 9 }}>
          <ScrollArea.Autosize
            mah="calc(100dvh - 60px - 16px)"
            type="auto"
            scrollbarSize={8}
            styles={{ viewport: { overflowX: "hidden" } }}
            style={{ minWidth: 0 }}
          >
            <div style={{ minWidth: 0 }}>
              {view === "company" && (
                <CompanyPane
                  companyId={companyId}
                  initial={companyInitial}
                  onUpdate={async (id, patch) => {
                    await updateCompany(id, patch);     // persist to DB
                    refreshHeaderData?.();              // header picks up latest users/locations
                    setDraft(prev => ({
                      ...prev,
                      company: {
                        ...prev.company,
                        name: patch.name ?? prev.company.name,
                        brandColor: patch.brand_color ?? prev.company.brandColor,
                        timezone: patch.timezone ?? prev.company.timezone,
                        logo: patch.logo ?? prev.company.logo,
                        positions: Array.isArray(patch.positions) ? patch.positions : prev.company.positions,
                      }
                    }));
                    refreshCompanySettings?.(); // instant header update from DB
                    refreshHeaderData?.();      // users/locations (unchanged, but fine)
                  }}
                />
              )}

              {view === "locations" && (
                <LocationsPane
                  locations={locations}
                  companyId={companyId}
                  onAdd={async (row) => { await createLocation(row); await refreshLocations(); refreshHeaderData?.(); }}
                  onUpdate={async (id, patch) => {
                    // optimistic
                    setLocations(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
                    await updateLocation(id, patch);
                    refreshHeaderData?.();
                  }}
                  onDelete={async (id) => {
                    setLocations(prev => prev.filter(l => l.id !== id));
                    await deleteLocation(id); await refreshLocations();
                    refreshHeaderData?.();
                  }}
                />
              )}

              {view === "users" && (
                <UsersPane
                  companyId={companyId}
                  users={users}
                  locations={locations}
                  positionOptions={draft.company.positions}                 // <—
                  onAddPosition={async (label) => {                         // <— helper to persist
                    const next = Array.from(new Set([...(draft.company.positions || []), label.trim()])).sort();
                    await updateCompany(companyId, { positions: next });
                    setDraft(prev => ({ ...prev, company: { ...prev.company, positions: next } }));
                  }}
                  onInvite={async (row) => { 
                    try {
                      await createUser({ ...row, company_id: companyId }); 
                      await refreshUsers(); 
                      refreshHeaderData?.(); 
                    } catch (error) {
                      // Re-throw the error so the UI can handle it
                      throw error;
                    }
                  }}
                  onUpdate={async (id, patch) => {
                    if ("pin" in patch) {
                      const digits = String(patch.pin ?? "").replace(/\D/g, "").slice(0, 6);
                      // If your DB column is TEXT/VARCHAR (recommended), keep string:
                      patch.pin = digits === "" ? null : digits;
                      // If your DB column is SMALLINT/INT instead, use:
                      // patch.pin = digits === "" ? null : Number(digits);
                    }

                    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...patch } : u)));
                    await updateUser(id, patch);
                    refreshHeaderData?.();
                  }}
                  onDelete={async (id) => {
                    setUsers(prev => prev.filter(u => u.id !== id));
                    await deleteUser(id);
                    refreshHeaderData?.();
                  }}
                />
              )}

              {view === "policies" && (
                <PoliciesPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />
              )}
              {view === "notifications" && (
                <NotificationsPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />
              )}
              {view === "security" && (
                <SecurityPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />
              )}
              {view === "branding" && (
                <BrandingPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />
              )}
              {view === "checklists" && (
                <ChecklistsPane
                  companyId={companyId}
                  locations={locations}
                  users={users}
                  positionOptions={draft.company.positions}
                  onAddPosition={async (label) => {
                    const next = Array.from(new Set([...(draft.company.positions || []), label.trim()])).sort();
                    await updateCompany(companyId, { positions: next });
                    setDraft(prev => ({ ...prev, company: { ...prev.company, positions: next } }));
                    onReloadChecklists?.();
                  }}
                  onReloadChecklists={onReloadChecklists}
                />
              )}
              {view === "data" && (
                <DataPane
                  settings={draft}
                  submissions={submissions}
                  onImportSettings={(json) => setDraft(json)}
                  onSeedDemo={settings?.__seedDemo}
                  locations={locations}
                  users={users}
                />
              )}
            </div>
          </ScrollArea.Autosize>
        </Grid.Col>
      </Grid>

      {/* Mobile sidebar Drawer */}
      <Drawer
        opened={navOpened}
        onClose={closeNav}
        title="Admin Settings"
        padding="md"
        size="100%"
        hiddenFrom="sm"
      >
        <Stack gap="xs">
          <NavLink active={view === "company"} label="Company" onClick={() => { setView("company"); closeNav(); }} leftSection={<IconSettings size={16} />} />
          <NavLink active={view === "locations"} label="Locations" onClick={() => { setView("locations"); closeNav(); }} />
          <NavLink active={view === "users"} label="Users & Roles" onClick={() => { setView("users"); closeNav(); }} />
          <NavLink active={view === "checklists"} label="Checklists & Templates" onClick={() => { setView("checklists"); closeNav(); }} />
          <NavLink active={view === "policies"} label="Evidence & Compliance" onClick={() => { setView("policies"); closeNav(); }} />
          <NavLink active={view === "notifications"} label="Notifications" onClick={() => { setView("notifications"); closeNav(); }} />
          <NavLink active={view === "security"} label="Security & PIN" onClick={() => { setView("security"); closeNav(); }} />
          <NavLink active={view === "branding"} label="Branding & Theme" onClick={() => { setView("branding"); closeNav(); }} />
          <NavLink active={view === "data"} label="Data & Export" onClick={() => { setView("data"); closeNav(); }} />
        </Stack>
      </Drawer>
    </Stack>
  );
}


/* ---------- PANES ---------- */

// AdminView.jsx (replace your CompanyPane with this)
// AdminView.jsx
function CompanyPane({ companyId, initial, onUpdate }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    brandColor: initial?.brandColor || "#0ea5e9",
    timezone: initial?.timezone || "UTC",
    weekStart: initial?.weekStart || "Mon",
    locale: initial?.locale || "en-US",
    logo: initial?.logo || null,
  }));

  // NEW: local positions UI state (source of truth = DB; this is just for snappy UI)
  const [positions, setPositions] = useState(() => Array.isArray(initial?.positions) ? initial.positions : []);
  const [newPos, setNewPos] = useState("");

  // keep local form + positions in sync when `initial` changes
  useEffect(() => {
    setForm(f => {
      const next = {
        name: initial?.name || "",
        brandColor: initial?.brandColor || "#0ea5e9",
        timezone: initial?.timezone || "UTC",
        weekStart: initial?.weekStart || "Mon",
        locale: initial?.locale || "en-US",
        logo: initial?.logo || null,
      };
      const changed =
        f.name !== next.name ||
        f.brandColor !== next.brandColor ||
        f.timezone !== next.timezone ||
        f.weekStart !== next.weekStart ||
        f.locale !== next.locale ||
        f.logo !== next.logo;
      return changed ? next : f;
    });
    setPositions(Array.isArray(initial?.positions) ? initial.positions : []);
  }, [initial]);

  const [uploading, setUploading] = useState(false);
  const [savingPos, setSavingPos] = useState(false);

  const save = async () => {
    await onUpdate(companyId, {
      name: form.name,
      brand_color: form.brandColor,
      timezone: form.timezone,
      logo: form.logo ?? null,
    });
  };

  // helpers for positions
  const persistPositions = async (next) => {
    setSavingPos(true);
    try {
      // optimistic UI
      setPositions(next);
      await onUpdate(companyId, { positions: next });
    } finally {
      setSavingPos(false);
    }
  };

  const addPosition = async () => {
    const label = (newPos || "").trim();
    if (!label) return;
    const next = Array.from(new Set([...positions, label])).sort((a, b) => a.localeCompare(b));
    setNewPos("");
    await persistPositions(next);
  };

  const removePosition = async (label) => {
    const next = positions.filter(p => p !== label);
    await persistPositions(next);
  };

  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Company</Text>
      <Stack gap="sm">
        <Group align="center" gap="md">
          {form.logo ? (
            <img src={form.logo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 8, background: form.brandColor }} />
          )}
          <FileButton
            onChange={async (file) => {
              if (!file) return;
              try {
                setUploading(true);
                const url = await uploadCompanyLogo(companyId, file);
                setForm(f => ({ ...f, logo: url }));
              } finally {
                setUploading(false);
              }
            }}
            accept="image/*"
          >
            {(props) => <Button variant="default" leftSection={<IconUpload size={16} />} loading={uploading} {...props}>Upload logo</Button>}
          </FileButton>
        </Group>

        <TextInput
          label="Company name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
        />
        <ColorInput
          label="Brand color"
          value={form.brandColor}
          onChange={(v) => setForm((f) => ({ ...f, brandColor: v }))}
        />
        <Select
          label="Timezone"
          value={form.timezone}
          data={["America/Los_Angeles", "America/Vancouver", "America/New_York", "UTC"]}
          onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          comboboxProps={{ withinPortal: true }}
        />

        <Stack gap="xs">
          {/* Input to add a position */}
          <Group gap="xs" align="flex-end" wrap="wrap">
            <TextInput
              label="Add a position"
              placeholder='e.g. "Cook", "Cashier", "Supervisor"'
              value={newPos}
              onChange={(e) => setNewPos(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPosition();
                }
              }}
              style={{ minWidth: 260 }}
            />
            <Button leftSection={<IconPlus size={16} />} onClick={addPosition} loading={savingPos}>Add</Button>
          </Group>

          {/* Chips list with remove */}
          {positions?.length ? (
            <Group gap="xs" mt="xs">
              {positions.map((p) => (
                <Badge key={p} variant="light" rightSection={
                  <ActionIcon size="xs" color="red" variant="subtle" onClick={() => removePosition(p)} title="Remove">
                    <IconTrash size={12} />
                  </ActionIcon>
                }>
                  {p}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text c="dimmed" fz="sm">No positions yet. Add your first one above.</Text>
          )}
        </Stack>
        <Group justify="flex-end">
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={save} loading={uploading}>Save</Button>
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


      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add location" centered size="md">
        <Stack gap="md">
          <TextInput 
            label="Location Name" 
            placeholder="Main Store, Downtown Branch, etc."
            value={draft.name} 
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
          />
          <Select
            label="Timezone"
            value={draft.timezone}
            data={[
              { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
              { value: "America/Vancouver", label: "Pacific Time (Vancouver)" },
              { value: "America/New_York", label: "Eastern Time (New York)" },
              { value: "UTC", label: "UTC (Coordinated Universal Time)" }
            ]}
            onChange={(v) => setDraft({ ...draft, timezone: v })}
            comboboxProps={{ withinPortal: true, zIndex: 11000 }}
            required
          />

          <Group justify="flex-end" mt="lg">
            <Button 
              onClick={async () => { 
                if (!draft.name.trim()) {
                  alert("Location name is required.");
                  return;
                }
                await onAdd(draft); 
                setAddOpen(false); 
                setDraft({ name: "", timezone: "America/Los_Angeles", company_id: companyId }); 
              }}
              leftSection={<IconPlus size={16} />}
            >
              Add Location
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

function UsersPane({
  companyId,
  users,
  locations,
  onInvite,
  onUpdate,
  onDelete,
  positionOptions,         // ['Cook', 'Cashier', ...] from draft.company.positions
  onAddPosition,           // async (label) => { await updateCompany(...{positions}); setDraft(...); }
}) {
  // Create debounced version of onUpdate for text inputs
  const debouncedUpdate = useDebouncedUpdate(onUpdate, 800);
  const [addOpen, setAddOpen] = useState(false);

  // One shared search value is fine (only one combobox is open at a time)
  const [posSearch, setPosSearch] = useState("");
  const [posSearchAdd, setPosSearchAdd] = useState("");

  const roleOptions = ["Admin", "Manager", "Employee"];
  const locationOptions = locations.map((l) => ({ value: l.id, label: l.name }));

  const draftInit = {
    email: "",
    display_name: "",
    role: "Employee",
    location: locations[0]?.id || null,
    is_active: true,
    pin: "",
    position: "",
  };
  const [draft, setDraft] = useState(draftInit);
  const resetDraft = () => setDraft(draftInit);

  // helper: build options with "Create" at the bottom if search doesn't exist
  const buildPosOptions = (all, search) => {
    const base = (all || []).map((p) => ({ value: p, label: p }));
    const q = (search || "").trim();
    const exists = q && all?.some((p) => p.toLowerCase() === q.toLowerCase());
    return q && !exists
      ? [...base, { value: `__create__:${q}`, label: `Create "${q}"` }]
      : base;
  };

  const tablePosOptions = useMemo(
    () => buildPosOptions(positionOptions || [], posSearch),
    [positionOptions, posSearch]
  );

  const addPosOptions = useMemo(
    () => buildPosOptions(positionOptions || [], posSearchAdd),
    [positionOptions, posSearchAdd]
  );

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Users & Roles</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>
          Add user
        </Button>
      </Group>

      <ScrollArea.Autosize
        mah="calc(100dvh - 280px)"
        type="auto"
        scrollbarSize={8}
        offsetScrollbars
        styles={{ viewport: { overflowX: "auto" } }}
      >
        <Table
          highlightOnHover
          style={{
            minWidth: 1200,
            width: "max-content",
            tableLayout: "fixed",
            whiteSpace: "nowrap", // keep cells from wrapping weirdly
          }}
        >
          {/* IMPORTANT: build colgroup via array to avoid whitespace text nodes */}
          <colgroup>
            {[
              <col key="c-name" style={{ width: "22%" }} />,
              <col key="c-email" style={{ width: "24%" }} />,
              <col key="c-role" style={{ width: "14%" }} />,
              <col key="c-pos" style={{ width: "16%" }} />,
              <col key="c-loc" style={{ width: "24%" }} />,
              <col key="c-pin" style={{ width: "140px" }} />,   // wider so the value shows
              <col key="c-active" style={{ width: "80px" }} />,
              <col key="c-actions" style={{ width: "60px" }} />,
            ]}
          </colgroup>

          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Position</Table.Th>
              <Table.Th>Location</Table.Th>
              <Table.Th>PIN</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>
                  <TextInput
                    value={u.display_name ?? ""}
                    onChange={(e) => debouncedUpdate(u.id, { display_name: e.currentTarget.value })}
                    w="100%"
                  />
                </Table.Td>

                <Table.Td>
                  <TextInput
                    value={u.email ?? ""}
                    onChange={(e) => debouncedUpdate(u.id, { email: e.currentTarget.value })}
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
                    value={u.position ?? null}
                    data={tablePosOptions}
                    placeholder="Add/select"
                    searchable
                    clearable
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                    onChange={async (v) => {
                      if (!v) return onUpdate(u.id, { position: null });
                      if (v.startsWith("__create__:")) {
                        const label = v.replace("__create__:", "").trim();
                        if (!label) return;
                        await onAddPosition(label);
                        await onUpdate(u.id, { position: label });
                      } else {
                        onUpdate(u.id, { position: v });
                      }
                    }}
                  />
                </Table.Td>

                <Table.Td>
                  <Select
                    data={locations.map((l) => ({ value: l.id, label: l.name }))}
                    value={u.location ?? null}
                    onChange={(v) => onUpdate(u.id, { location: v })}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>

                <Table.Td>
                  <TextInput
                    value={(u.pin ?? "").toString()}
                    onChange={(e) => {
                      const next = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
                      debouncedUpdate(u.id, { pin: next });
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const text = (e.clipboardData.getData("text") || "")
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      debouncedUpdate(u.id, { pin: text });
                    }}
                    onBeforeInput={(e) => {
                      const target = e.currentTarget;
                      const selection = target.selectionEnd - target.selectionStart;
                      const len = target.value.length - selection;
                      if (len >= 6 && /\d/.test(e.data ?? "")) e.preventDefault();
                    }}
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    styles={{ input: { textAlign: "center", fontVariantNumeric: "tabular-nums" } }}
                    w={130}              // matches the col width, keeps it visible
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


      {/* Add user modal */}
      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add user" centered size="lg">
        <Stack gap="md">
          <Group grow>
            <TextInput
              label="Full Name"
              placeholder="John Doe"
              value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.currentTarget.value })}
              required
            />
            <TextInput
              label="Email Address"
              placeholder="person@company.com"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.currentTarget.value })}
              required
            />
          </Group>

          <Group grow>
            <Select
              label="Role"
              value={draft.role}
              onChange={(v) => setDraft({ ...draft, role: v })}
              data={roleOptions}
              comboboxProps={{ withinPortal: true, zIndex: 11000 }}
              required
            />
            <Select
              label="Location"
              data={locationOptions}
              value={draft.location}
              onChange={(v) => setDraft({ ...draft, location: v })}
              comboboxProps={{ withinPortal: true, zIndex: 11000 }}
              required
            />
          </Group>

          <Select
            label="Position"
            value={draft.position}
            data={addPosOptions}
            searchable
            clearable
            comboboxProps={{ withinPortal: true, zIndex: 11000 }}
            searchValue={posSearchAdd}
            onSearchChange={setPosSearchAdd}
            onChange={async (v) => {
              if (!v) return setDraft((d) => ({ ...d, position: "" }));
              if (v.startsWith("__create__:")) {
                const label = v.replace("__create__:", "").trim();
                if (!label) return;
                await onAddPosition(label);           // persists via updateCompany
                setDraft((d) => ({ ...d, position: label }));
                setPosSearchAdd("");
              } else {
                setDraft((d) => ({ ...d, position: v }));
              }
            }}
          />

          <Group grow>
            <TextInput
              label="PIN (for kiosk access)"
              placeholder="123456"
              value={draft.pin ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  pin: e.currentTarget.value.replace(/\D/g, "").slice(0, 6),
                }))
              }
              onPaste={(e) => {
                e.preventDefault();
                const text = (e.clipboardData.getData("text") || "")
                  .replace(/\D/g, "")
                  .slice(0, 6);
                setDraft((d) => ({ ...d, pin: text }));
              }}
              onBeforeInput={(e) => {
                const target = e.currentTarget;
                const selection = target.selectionEnd - target.selectionStart;
                const len = target.value.length - selection;
                if (len >= 6 && /\d/.test(e.data ?? "")) e.preventDefault();
              }}
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              required
            />
            <div style={{ display: 'flex', alignItems: 'end', paddingBottom: '4px' }}>
              <Switch
                label="Active user"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.currentTarget.checked })}
              />
            </div>
          </Group>

          <Group justify="flex-end" mt="lg">
            <Button
              onClick={async () => {
                if (!draft.email.trim() || !draft.display_name.trim() || !draft.pin.trim())
                  return alert("Name, email and PIN are required.");
                
                try {
                  await onInvite(draft);
                  resetDraft();
                  setAddOpen(false);
                } catch (error) {
                  console.error('Failed to create user:', error);
                  
                  // Check for specific database constraint violations
                  if (error?.code === '23505') {
                    // Unique constraint violation
                    if (error?.message?.includes('email') || error?.details?.includes('email')) {
                      alert('This email address is already in use. Please choose a different email.');
                    } else if (error?.message?.includes('pin') || error?.details?.includes('pin')) {
                      alert('This PIN is already in use. Please choose a different PIN.');
                    } else {
                      alert('This information conflicts with an existing user. Please check your input.');
                    }
                  } else if (error?.message?.includes('duplicate key value violates unique constraint')) {
                    alert('This email address is already in use. Please choose a different email.');
                  } else if (error?.message?.includes('violates check constraint')) {
                    alert('Invalid input. Please check your data and try again.');
                  } else {
                    alert('Failed to create user. Please try again.');
                  }
                }
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


function ChecklistsPane({
  companyId,
  locations,
  users,
  positionOptions = [],
  onAddPosition,            // async (label) => { await updateCompany(...); }
  onReloadChecklists,
}) {
  // Local state sourced from DB only
  const [tab, setTab] = useState("templates"); // "templates" | "timeblocks" | "adhoc"
  const [timeBlocks, setTimeBlocks] = useState([]);
  const [templates, setTemplates] = useState([]);

  // dialogs/drafts
  const [tbOpen, setTbOpen] = useState(false);
  const [tbDraft, setTbDraft] = useState(initTimeBlockDraft());

  const [createTplOpen, setCreateTplOpen] = useState(false);
  const [editTplOpen, setEditTplOpen] = useState(false);
  const [tplDraft, setTplDraft] = useState(initTemplateDraft());

  // search state for positions MultiSelect (template dialog)
  const [posSearchTpl, setPosSearchTpl] = useState("");

  // --- utils
  function initTimeBlockDraft() {
    return { id: "", name: "", start: "09:00", end: "17:00" };
  }
  function initTemplateDraft() {
    return {
      id: undefined,
      name: "",
      locationId: locations?.[0]?.id || "",
      timeBlockId: timeBlocks?.[0]?.id || "",
      recurrence: [0, 1, 2, 3, 4, 5, 6],
      positions: [],
      tasks: [],
    };
  }
  const isUUID = (v) =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

  const genUuid = () =>
    globalThis.crypto?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

  // --- load from DB
  const load = useCallback(async () => {
    const [tbs, tpls] = await Promise.all([
      listTimeBlocks(companyId),
      listTasklistTemplates(companyId),
    ]);
    setTimeBlocks(Array.isArray(tbs) ? tbs : []);
    setTemplates(Array.isArray(tpls) ? tpls : []);
    onReloadChecklists?.();
  }, [companyId, onReloadChecklists]);

  useEffect(() => { load(); }, [load]);

  // derived options
  const timeBlockOptions = timeBlocks.map(tb => ({
    value: tb.id,
    label: `${tb.name} (${tb.start}–${tb.end})`,
  }));
  const locationOptions = locations.map(l => ({ value: l.id, label: l.name }));

  // positions from company table with “Create …” synthetic option
  const buildPosOptions = (all, search) => {
    const base = (all || []).map((p) => ({ value: p, label: p }));
    const q = (search || "").trim();
    const exists = q && all?.some((p) => p.toLowerCase() === q.toLowerCase());
    return q && !exists
      ? [...base, { value: `__create__:${q}`, label: `Create "${q}"` }]
      : base;
  };
  const positionSelectOptions = useMemo(
    () => buildPosOptions(positionOptions, posSearchTpl),
    [positionOptions, posSearchTpl]
  );

  // --- DB mutations
  async function saveTimeBlock(tb) {
    await upsertTimeBlock(tb, companyId);
    await load();
  }
  async function removeTimeBlockDb(id) {
    await removeTimeBlock(id);
    await load();
  }

  async function saveTemplateToDb(tplUi, mode) {
    const isCreateOrDup = mode === "create" || mode === "duplicate" || !tplUi.id;
    // Normalize task IDs: ensure real UUIDs before writing to DB
    const tasksOut = (tplUi.tasks || []).map((t) => {
      const base = { ...t };
      base.id = isCreateOrDup ? genUuid() : (isUUID(t.id) ? t.id : genUuid());
      return base;
    });

    const payload = { ...tplUi, ...(isCreateOrDup ? { id: undefined } : {}), tasks: tasksOut };
    await upsertTasklistTemplateWithTasks(payload);
    await load();
  }
  async function removeTemplateDb(id) {
    await deleteTasklistTemplate(id);
    await load();
  }

  // --- task helpers (UI-only until saved)
  function makeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
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

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Checklists & Templates</Text>
        <Group gap="xs">
          <Button
            variant={tab === "timeblocks" ? "filled" : "default"}
            onClick={() => setTab("timeblocks")}
          >
            Time Blocks
          </Button>
          <Button
            variant={tab === "templates" ? "filled" : "default"}
            onClick={() => setTab("templates")}
          >
            Templates
          </Button>
          {/* If you don't have DB backing for ad-hoc yet, hide it or wire later */}
          {/* <Button variant={tab === "adhoc" ? "filled" : "default"} onClick={() => setTab("adhoc")}>Ad-hoc Tasks</Button> */}
        </Group>
      </Group>

      {/* --- Time Blocks --- */}
      {tab === "timeblocks" && (
        <Stack gap="sm">
          <Group>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => { setTbDraft(initTimeBlockDraft()); setTbOpen(true); }}
            >
              New time block
            </Button>
          </Group>

          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Start</Table.Th>
                <Table.Th>End</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {timeBlocks.map(tb => (
                <Table.Tr key={tb.id}>
                  <Table.Td><Badge variant="light">{tb.name}</Badge></Table.Td>
                  <Table.Td>{tb.start}</Table.Td>
                  <Table.Td>{tb.end}</Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <Button size="xs" variant="default" onClick={() => { setTbDraft(tb); setTbOpen(true); }}>
                        Edit
                      </Button>
                      <ActionIcon color="red" variant="subtle" onClick={() => removeTimeBlockDb(tb.id)} title="Delete">
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Modal opened={tbOpen} onClose={() => setTbOpen(false)} title="Time Block" centered size="md">
            <Stack gap="md">
              <TextInput 
                label="Time Block Name" 
                placeholder="Morning Shift, Evening Shift, etc."
                value={tbDraft.name} 
                onChange={(e) => setTbDraft({ ...tbDraft, name: e.target.value })}
                required
              />
              <Group grow>
                <TextInput 
                  label="Start Time" 
                  placeholder="09:00"
                  value={tbDraft.start} 
                  onChange={(e) => setTbDraft({ ...tbDraft, start: e.target.value })}
                  required
                />
                <TextInput 
                  label="End Time" 
                  placeholder="17:00"
                  value={tbDraft.end} 
                  onChange={(e) => setTbDraft({ ...tbDraft, end: e.target.value })}
                  required
                />
              </Group>
              <Group justify="flex-end" mt="lg">
                <Button 
                  onClick={() => { 
                    if (!tbDraft.name.trim() || !tbDraft.start.trim() || !tbDraft.end.trim()) {
                      alert("Name, start time, and end time are required.");
                      return;
                    }
                    saveTimeBlock(tbDraft); 
                    setTbOpen(false); 
                  }}
                  leftSection={<IconDeviceFloppy size={16} />}
                >
                  Save Time Block
                </Button>
              </Group>
            </Stack>
          </Modal>
        </Stack>
      )}

      {/* --- Templates --- */}
      {tab === "templates" && (
        <Stack gap="sm">
          <Group>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => { setTplDraft(initTemplateDraft()); setCreateTplOpen(true); }}
            >
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
                <Table.Th>Positions</Table.Th>
                <Table.Th>Tasks</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {templates.map(tpl => {
                const tb = timeBlocks.find(x => x.id === tpl.timeBlockId);
                const loc = locations.find(l => l.id === tpl.locationId);
                return (
                  <Table.Tr key={tpl.id}>
                    <Table.Td><Text fw={600}>{tpl.name}</Text></Table.Td>
                    <Table.Td>{loc?.name || "-"}</Table.Td>
                    <Table.Td>{tb ? `${tb.name} (${tb.start}–${tb.end})` : tpl.timeBlockId}</Table.Td>
                    <Table.Td>{tpl.recurrence.join(",")}</Table.Td>
                    <Table.Td>
                      {(tpl.positions || []).length
                        ? <Group gap={6} wrap="wrap">{tpl.positions.map((p) => <Badge key={p} variant="light">{p}</Badge>)}</Group>
                        : <Text c="dimmed">All</Text>}
                    </Table.Td>
                    <Table.Td>{(tpl.tasks || []).length}</Table.Td>
                    <Table.Td>
                      <Group justify="flex-end" gap="xs">
                        <Button size="xs" variant="default" onClick={() => { setTplDraft(tpl); setEditTplOpen(true); }}>
                          Edit
                        </Button>
                        <Button size="xs" variant="default" onClick={() => saveTemplateToDb(tpl, "duplicate")}>
                          Duplicate
                        </Button>
                        <ActionIcon color="red" variant="subtle" onClick={() => removeTemplateDb(tpl.id)} title="Delete">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          <Modal
            opened={createTplOpen || editTplOpen}
            onClose={() => { setCreateTplOpen(false); setEditTplOpen(false); }}
            title={createTplOpen ? "Create Template" : "Edit Template"}
            centered
            size="xl"
          >
            <Stack gap="md">
              <TextInput 
                label="Template Name" 
                placeholder="Opening Checklist, Closing Procedures, etc."
                value={tplDraft.name} 
                onChange={(e) => setTplDraft({ ...tplDraft, name: e.target.value })}
                required
              />
              
              <Group grow>
                <Select
                  label="Location"
                  value={tplDraft.locationId}
                  onChange={(v) => setTplDraft({ ...tplDraft, locationId: v })}
                  data={locationOptions}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                  required
                />
                <Select
                  label="Time Block"
                  value={tplDraft.timeBlockId}
                  onChange={(v) => setTplDraft({ ...tplDraft, timeBlockId: v })}
                  data={timeBlockOptions}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                  required
                />
              </Group>

              <Group grow>
                {/* Positions from company table + create support */}
                <MultiSelect
                  label="Positions (who should see this?)"
                  placeholder="Select positions or leave empty for all"
                  data={positionSelectOptions}
                  value={(tplDraft.positions || []).map(String)}
                  searchable
                  clearable
                  searchValue={posSearchTpl}
                  onSearchChange={setPosSearchTpl}
                  comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                  onChange={async (vals) => {
                    const last = vals[vals.length - 1];
                    if (last && last.startsWith("__create__:")) {
                      const label = last.replace("__create__:", "").trim();
                      if (label) {
                        await onAddPosition?.(label);      // persists to company.positions
                        const replaced = vals.filter(v => v !== last).concat(label);
                        setTplDraft((d) => ({ ...d, positions: replaced }));
                        setPosSearchTpl("");
                        return;
                      }
                    }
                    setTplDraft((d) => ({ ...d, positions: vals }));
                  }}
                />

                <MultiSelect
                  label="Days of Week"
                  placeholder="Select days"
                  data={[
                    { value: "0", label: "Sunday" },
                    { value: "1", label: "Monday" },
                    { value: "2", label: "Tuesday" },
                    { value: "3", label: "Wednesday" },
                    { value: "4", label: "Thursday" },
                    { value: "5", label: "Friday" },
                    { value: "6", label: "Saturday" }
                  ]}
                  value={tplDraft.recurrence.map(String)}
                  onChange={(arr) => setTplDraft({ ...tplDraft, recurrence: (arr || []).map(x => Number(x)) })}
                  required
                />
              </Group>

              <Divider label="Tasks" labelPosition="left" />
              
              <TaskEditor
                tasks={tplDraft.tasks}
                onAdd={(t) => addTaskToDraftTemplate(t)}
                onChange={(id, patch) => updateTaskInDraftTemplate(id, patch)}
                onRemove={(id) => removeTaskFromDraftTemplate(id)}
              />

              <Group justify="flex-end" mt="lg">
                <Button
                  onClick={() => {
                    if (!tplDraft.name.trim() || !tplDraft.locationId || !tplDraft.timeBlockId || tplDraft.recurrence.length === 0) {
                      alert("Template name, location, time block, and at least one day are required.");
                      return;
                    }
                    saveTemplateToDb(tplDraft, createTplOpen ? "create" : "update");
                    setCreateTplOpen(false);
                    setEditTplOpen(false);
                  }}
                  leftSection={<IconDeviceFloppy size={16} />}
                >
                  {createTplOpen ? "Create Template" : "Save Changes"}
                </Button>
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