import React, { useEffect, useMemo, useState } from "react";
import {
  Card, Stack, Group, Text, Button, TextInput, ColorInput, Select, MultiSelect,
  NumberInput, Switch, FileButton, Badge, Table, ScrollArea, Divider,
  NavLink, Grid, Modal, ActionIcon, rem,
} from "@mantine/core";
import { IconUpload, IconDeviceFloppy, IconTrash, IconPlus, IconSettings } from "@tabler/icons-react";
import { supabase } from "./lib/supabase";
import { useSettings } from "./settings-store.jsx";
/* -------------------------------------------------------
   Small helpers
------------------------------------------------------- */
const TZ_OPTS = ["America/Los_Angeles", "America/Vancouver", "America/New_York", "UTC"];
const DOW_OPTS = ["0", "1", "2", "3", "4", "5", "6"].map(x => ({ value: x, label: x }));

function toIntArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map(v => Number(v)).filter(v => Number.isInteger(v));
}

/* -------------------------------------------------------
   DATA HOOKS: Locations, Time blocks, Templates(+Tasks)
------------------------------------------------------- */

// LOCATIONS
function useDbLocations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("location")
      .select("id,name,timezone")
      .order("name", { ascending: true });
    setLoading(false);
    if (error) { console.error(error); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { refresh(); }, []);
  return { rows, loading, refresh };
}

// TIME BLOCKS
function useDbTimeBlocks() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("time_block")
      .select("id,name,start_time,end_time")
      .order("start_time", { ascending: true });
    setLoading(false);
    if (error) { console.error(error); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { refresh(); }, []);
  return { rows, loading, refresh };
}

// TEMPLATES (+ nested tasks)
function useDbTemplates() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasklist_template")
      .select(`
        id, location_id, name, time_block_id, recurrence, requires_approval, signoff_method, active,
        tasks:tasklist_task (
          id, title, category, input_type, min, max, photo_required, note_required, allow_na, priority
        )
      `)
      .order("name", { ascending: true });
    setLoading(false);
    if (error) { console.error(error); setRows([]); return; }
    setRows((data || []).map(t => ({ ...t, tasks: t.tasks || [] })));
  };

  useEffect(() => { refresh(); }, []);
  return { rows, loading, refresh };
}

/* -------------------------------------------------------
   AdminView
------------------------------------------------------- */
export default function AdminView() {
  const [view, setView] = useState("company");
  const { settings, updateSettings } = useSettings(); // keep this for company/theme panes

  // DB data
  const loc = useDbLocations();
  const tb = useDbTimeBlocks();
  const tpl = useDbTemplates();

  // Draft settings (only for Company/Branding/etc which remain client-side config)
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const saveDraftToApp = () => { updateSettings(draft); alert("Settings saved"); };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(240px, 280px) 1fr",
        gap: 16,
        alignItems: "start",
        minHeight: "calc(100dvh - 64px - 16px)",
      }}
    >
      <Card withBorder radius="md" style={{ position: "sticky", height: "fit-content", zIndex: 1, top: 80 }}>
        <Text fw={700} mb="xs">Admin Settings</Text>
        <Stack gap={2}>
          <NavLink active={view === "company"} label="Company" onClick={() => setView("company")} leftSection={<IconSettings size={16} />} />
          <NavLink active={view === "locations"} label="Locations" onClick={() => setView("locations")} />
          <NavLink active={view === "users"} label="Users & Roles" onClick={() => setView("users")} />
          <NavLink active={view === "timeblocks"} label="Time Blocks" onClick={() => setView("timeblocks")} />
          <NavLink active={view === "templates"} label="Checklists & Templates" onClick={() => setView("templates")} />
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
          {view === "company" && <CompanyPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />}
          {view === "branding" && <BrandingPane settings={draft} setSettings={setDraft} onSave={saveDraftToApp} />}
          {view === "users" && <UsersPaneDB />}
          {view === "locations" && <LocationsPaneDB loc={loc} />}
          {view === "timeblocks" && <TimeBlocksPaneDB tb={tb} />}
          {view === "templates" && <TemplatesPaneDB tpl={tpl} loc={loc} tb={tb} />}
          {view === "data" && <DataPaneSimple />}
        </div>
      </ScrollArea.Autosize>
    </div>
  );
}

/* -------------------------------------------------------
   COMPANY / BRANDING (client settings as before)
------------------------------------------------------- */
function CompanyPane({ settings, setSettings, onSave }) {
  const s = settings.company || {};
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Company</Text>
      <Stack gap="sm">
        <TextInput label="Company name" value={s.name || ""} onChange={(e) => setSettings({ ...settings, company: { ...s, name: e.target.value } })} />
        <ColorInput label="Brand color" value={s.brandColor || "#0ea5e9"} onChange={(v) => setSettings({ ...settings, company: { ...s, brandColor: v } })} />
        <Select label="Timezone" value={s.timezone || "UTC"} onChange={(v) => setSettings({ ...settings, company: { ...s, timezone: v } })} data={TZ_OPTS} comboboxProps={{ withinPortal: true }} />
        <Divider />
        <Group justify="flex-end">
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave}>Save</Button>
        </Group>
      </Stack>
    </Card>
  );
}

function BrandingPane({ settings, setSettings, onSave }) {
  const t = settings.theme || {};
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Branding & Theme</Text>
      <Stack gap="sm">
        <Select
          label="Default color scheme"
          value={t.defaultScheme || "auto"}
          onChange={(v) => setSettings({ ...settings, theme: { ...t, defaultScheme: v } })}
          data={[{ value: "auto", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
          comboboxProps={{ withinPortal: true }}
        />
        <ColorInput label="Accent color" value={t.accent || "#0ea5e9"} onChange={(v) => setSettings({ ...settings, theme: { ...t, accent: v } })} />
        <Group justify="flex-end"><Button onClick={onSave}>Save</Button></Group>
      </Stack>
    </Card>
  );
}

/* -------------------------------------------------------
   DB-PANE: LOCATIONS
------------------------------------------------------- */
function LocationsPaneDB({ loc }) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", timezone: "UTC" });

  const createLocation = async () => {
    if (!draft.name.trim()) return;
    const { error } = await supabase.from("location").insert({ name: draft.name.trim(), timezone: draft.timezone || "UTC" });
    if (error) return alert(error.message);
    setAddOpen(false); setDraft({ name: "", timezone: "UTC" });
    loc.refresh();
  };

  const updateLocation = async (id, patch) => {
    const { error } = await supabase.from("location").update(patch).eq("id", id);
    if (error) return alert(error.message);
    loc.refresh();
  };

  const removeLocation = async (id) => {
    if (!confirm("Delete this location? (Templates at this location will also be removed)")) return;
    const { error } = await supabase.from("location").delete().eq("id", id);
    if (error) return alert(error.message);
    loc.refresh();
  };

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Locations</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>Add location</Button>
      </Group>

      <ScrollArea.Autosize mah={360} type="auto" scrollbarSize={8} styles={{ viewport: { overflowX: "hidden" } }}>
        <Table highlightOnHover withColumnBorders={false} style={{ tableLayout: "fixed", width: "100%" }}>
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
            {(loc.rows || []).map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>
                  <TextInput
                    defaultValue={l.name || ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (l.name || "")) updateLocation(l.id, { name: v });
                    }}
                  />

                </Table.Td>
                <Table.Td>
                  <Select
                    value={l.timezone || "UTC"}
                    onChange={(v) => updateLocation(l.id, { timezone: v })}
                    data={TZ_OPTS}
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

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add location" centered>
        <Stack>
          <TextInput label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Select label="Timezone" value={draft.timezone} onChange={(v) => setDraft({ ...draft, timezone: v })} data={TZ_OPTS} comboboxProps={{ withinPortal: true, zIndex: 11000 }} />
          <Group justify="flex-end"><Button onClick={createLocation}>Add</Button></Group>
        </Stack>
      </Modal>
    </Card>
  );
}

/* -------------------------------------------------------
   DB-PANE: TIME BLOCKS
------------------------------------------------------- */
function TimeBlocksPaneDB({ tb }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ id: "", name: "", start_time: "09:00", end_time: "17:00" });

  const save = async () => {
    if (!draft.id.trim() || !draft.name.trim()) return;
    // upsert by id (text PK)
    const { error } = await supabase.from("time_block").upsert({
      id: draft.id.trim(),
      name: draft.name.trim(),
      start_time: draft.start_time,
      end_time: draft.end_time,
    });
    if (error) return alert(error.message);
    setOpen(false);
    tb.refresh();
  };

  const remove = async (id) => {
    if (!confirm("Delete this time block?")) return;
    const { error } = await supabase.from("time_block").delete().eq("id", id);
    if (error) return alert(error.message);
    tb.refresh();
  };

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Time Blocks</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => { setDraft({ id: "", name: "", start_time: "09:00", end_time: "17:00" }); setOpen(true); }}>
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
          {(tb.rows || []).map(b => (
            <Table.Tr key={b.id}>
              <Table.Td><Badge variant="light">{b.id}</Badge></Table.Td>
              <Table.Td>{b.name}</Table.Td>
              <Table.Td>{b.start_time}</Table.Td>
              <Table.Td>{b.end_time}</Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Button size="xs" variant="default" onClick={() => { setDraft(b); setOpen(true); }}>Edit</Button>
                  <ActionIcon color="red" variant="subtle" onClick={() => remove(b.id)} title="Delete"><IconTrash size={16} /></ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={open} onClose={() => setOpen(false)} title="Time block" centered>
        <Stack>
          <TextInput label="ID (e.g., open, mid, close)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
          <TextInput label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Group grow>
            <TextInput label="Start (HH:MM)" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
            <TextInput label="End (HH:MM)" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
          </Group>
          <Group justify="flex-end"><Button onClick={save}>Save</Button></Group>
        </Stack>
      </Modal>
    </Card>
  );
}

/* -------------------------------------------------------
   DB-PANE: TEMPLATES (+TASKS)
------------------------------------------------------- */
function TemplatesPaneDB({ tpl, loc, tb }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initTplDraft());
  const locationOptions = (loc.rows || []).map(l => ({ value: l.id, label: l.name }));
  const tbOptions = (tb.rows || []).map(b => ({ value: b.id, label: `${b.name} (${b.start_time}–${b.end_time})` }));

  function initTplDraft() {
    return {
      id: null, // null => create
      name: "",
      location_id: loc.rows?.[0]?.id || null,
      time_block_id: tb.rows?.[0]?.id || "open",
      recurrence: [0, 1, 2, 3, 4, 5, 6],
      requires_approval: true,
      signoff_method: "PIN",
      active: true,
      tasks: []
    };
  }

  const resetAndOpenCreate = () => { setDraft(initTplDraft()); setOpen(true); };
  const openEdit = (row) => { setDraft({ ...row, recurrence: row.recurrence || [], tasks: row.tasks || [] }); setOpen(true); };

  const saveTemplate = async () => {
    if (!draft.name.trim() || !draft.location_id || !draft.time_block_id) return;

    if (!draft.id) {
      // CREATE template, then create tasks
      const { data, error } = await supabase.from("tasklist_template").insert({
        location_id: draft.location_id,
        name: draft.name.trim(),
        time_block_id: draft.time_block_id,
        recurrence: draft.recurrence,
        requires_approval: !!draft.requires_approval,
        signoff_method: draft.signoff_method || "PIN",
        active: !!draft.active
      }).select("id").single();

      if (error) return alert(error.message);
      const newId = data.id;

      // Insert tasks
      if (draft.tasks.length) {
        const rows = draft.tasks.map(t => ({
          tasklist_id: newId,
          title: t.title || "Task",
          category: t.category || "",
          input_type: t.input_type || "checkbox",
          min: t.min ?? null,
          max: t.max ?? null,
          photo_required: !!t.photo_required,
          note_required: !!t.note_required,
          allow_na: t.allow_na !== false,
          priority: typeof t.priority === "number" ? t.priority : 3,
        }));
        const { error: terr } = await supabase.from("tasklist_task").insert(rows);
        if (terr) return alert(terr.message);
      }

    } else {
      // UPDATE template
      const { error } = await supabase.from("tasklist_template").update({
        location_id: draft.location_id,
        name: draft.name.trim(),
        time_block_id: draft.time_block_id,
        recurrence: draft.recurrence,
        requires_approval: !!draft.requires_approval,
        signoff_method: draft.signoff_method || "PIN",
        active: !!draft.active
      }).eq("id", draft.id);
      if (error) return alert(error.message);

      // Sync tasks: upsert by id; delete removed
      const existingIds = new Set((draft.tasks || []).filter(t => t.id).map(t => t.id));

      // Delete tasks that no longer exist
      const server = tpl.rows.find(t => t.id === draft.id) || { tasks: [] };
      const toDelete = (server.tasks || []).filter(st => !existingIds.has(st.id));
      if (toDelete.length) {
        const { error: delErr } = await supabase.from("tasklist_task")
          .delete()
          .in("id", toDelete.map(x => x.id));
        if (delErr) return alert(delErr.message);
      }

      // Upsert tasks (insert new, update existing)
      for (const t of draft.tasks) {
        if (t.id) {
          const { error: uErr } = await supabase.from("tasklist_task").update({
            title: t.title || "Task",
            category: t.category || "",
            input_type: t.input_type || "checkbox",
            min: t.min ?? null,
            max: t.max ?? null,
            photo_required: !!t.photo_required,
            note_required: !!t.note_required,
            allow_na: t.allow_na !== false,
            priority: typeof t.priority === "number" ? t.priority : 3,
          }).eq("id", t.id);
          if (uErr) return alert(uErr.message);
        } else {
          const { error: iErr } = await supabase.from("tasklist_task").insert({
            tasklist_id: draft.id,
            title: t.title || "Task",
            category: t.category || "",
            input_type: t.input_type || "checkbox",
            min: t.min ?? null,
            max: t.max ?? null,
            photo_required: !!t.photo_required,
            note_required: !!t.note_required,
            allow_na: t.allow_na !== false,
            priority: typeof t.priority === "number" ? t.priority : 3,
          });
          if (iErr) return alert(iErr.message);
        }
      }
    }

    setOpen(false);
    await tpl.refresh();
  };

  const deleteTemplate = async (id) => {
    if (!confirm("Delete this template (and its tasks)?")) return;
    const { error } = await supabase.from("tasklist_template").delete().eq("id", id);
    if (error) return alert(error.message);
    tpl.refresh();
  };

  // Task editor handlers (shape uses DB field names)
  const addTaskToDraft = () => {
    setDraft(prev => ({
      ...prev,
      tasks: [...(prev.tasks || []), {
        id: null, title: "", category: "", input_type: "checkbox",
        min: null, max: null, photo_required: false, note_required: false,
        allow_na: true, priority: 3
      }]
    }));
  };
  const updateTaskInDraft = (idx, patch) => {
    setDraft(prev => {
      const copy = [...(prev.tasks || [])];
      copy[idx] = { ...copy[idx], ...patch };
      return { ...prev, tasks: copy };
    });
  };
  const removeTaskInDraft = (idx) => {
    setDraft(prev => {
      const copy = [...(prev.tasks || [])];
      copy.splice(idx, 1);
      return { ...prev, tasks: copy };
    });
  };

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Checklists & Templates</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={resetAndOpenCreate}>New template</Button>
      </Group>

      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Location</Table.Th>
            <Table.Th>Time block</Table.Th>
            <Table.Th>Days</Table.Th>
            <Table.Th>Tasks</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(tpl.rows || []).map(t => {
            const tbRow = (tb.rows || []).find(x => x.id === t.time_block_id);
            const locRow = (loc.rows || []).find(x => x.id === t.location_id);
            return (
              <Table.Tr key={t.id}>
                <Table.Td><Text fw={600}>{t.name}</Text></Table.Td>
                <Table.Td>{locRow?.name || t.location_id}</Table.Td>
                <Table.Td>{tbRow ? `${tbRow.name} (${tbRow.start_time}–${tbRow.end_time})` : t.time_block_id}</Table.Td>
                <Table.Td>{(t.recurrence || []).join(",")}</Table.Td>
                <Table.Td>{t.tasks?.length || 0}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={t.active ? "green" : "gray"}>{t.active ? "Active" : "Inactive"}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="default" onClick={() => openEdit(t)}>Edit</Button>
                    <ActionIcon color="red" variant="subtle" onClick={() => deleteTemplate(t.id)} title="Delete"><IconTrash size={16} /></ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <Modal opened={open} onClose={() => setOpen(false)} title="Template" centered size="lg">
        <Stack gap="sm">
          <TextInput label="Template name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Group grow wrap="nowrap">
            <Select label="Location" value={draft.location_id} onChange={(v) => setDraft({ ...draft, location_id: v })} data={locationOptions} comboboxProps={{ withinPortal: true, zIndex: 11000 }} />
            <Select label="Time block" value={draft.time_block_id} onChange={(v) => setDraft({ ...draft, time_block_id: v })} data={tbOptions} comboboxProps={{ withinPortal: true, zIndex: 11000 }} />
          </Group>
          <MultiSelect
            label="Days of week (0=Sun...6=Sat)"
            data={DOW_OPTS}
            value={(draft.recurrence || []).map(String)}
            onChange={(arr) => setDraft({ ...draft, recurrence: toIntArray(arr) })}
            searchable
            comboboxProps={{ withinPortal: true, zIndex: 11000 }}
          />
          <Group>
            <Switch label="Requires approval" checked={!!draft.requires_approval} onChange={(e) => setDraft({ ...draft, requires_approval: e.currentTarget.checked })} />
            <Switch label="Active" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.currentTarget.checked })} />
            <Select label="Signoff method" value={draft.signoff_method} onChange={(v) => setDraft({ ...draft, signoff_method: v })} data={["PIN"]} />
          </Group>

          {/* Task editor (DB field names) */}
          <Card withBorder radius="md">
            <Group justify="space-between" mb="xs"><Text fw={600}>Tasks</Text><Button size="xs" onClick={addTaskToDraft}>Add task</Button></Group>
            <Table highlightOnHover>
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
                {(draft.tasks || []).map((t, i) => (
                  <Table.Tr key={i}>
                    <Table.Td><TextInput value={t.title} onChange={(e) => updateTaskInDraft(i, { title: e.target.value })} /></Table.Td>
                    <Table.Td className="hide-sm"><TextInput value={t.category || ""} onChange={(e) => updateTaskInDraft(i, { category: e.target.value })} /></Table.Td>
                    <Table.Td>
                      <Select
                        value={t.input_type || "checkbox"}
                        onChange={(v) => updateTaskInDraft(i, { input_type: v })}
                        data={["checkbox", "number"].map(x => ({ value: x, label: x }))}
                        comboboxProps={{ withinPortal: true, zIndex: 11000 }}
                      />
                    </Table.Td>
                    <Table.Td className="hide-sm">
                      <Group gap="xs" wrap="nowrap">
                        <NumberInput placeholder="min" value={t.min ?? ""} onChange={(v) => updateTaskInDraft(i, { min: v === "" ? null : Number(v) })} style={{ width: rem(90) }} />
                        <NumberInput placeholder="max" value={t.max ?? ""} onChange={(v) => updateTaskInDraft(i, { max: v === "" ? null : Number(v) })} style={{ width: rem(90) }} />
                      </Group>
                    </Table.Td>
                    <Table.Td className="hide-sm">
                      <Group gap="xs">
                        <Switch label="Photo" checked={!!t.photo_required} onChange={(e) => updateTaskInDraft(i, { photo_required: e.currentTarget.checked })} />
                        <Switch label="Note" checked={!!t.note_required} onChange={(e) => updateTaskInDraft(i, { note_required: e.currentTarget.checked })} />
                        <Switch label="N/A" checked={t.allow_na !== false} onChange={(e) => updateTaskInDraft(i, { allow_na: e.currentTarget.checked })} />
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <NumberInput min={1} max={5} value={t.priority ?? 3} onChange={(v) => updateTaskInDraft(i, { priority: Number(v) || 3 })} style={{ width: rem(80) }} />
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon color="red" variant="subtle" onClick={() => removeTaskInDraft(i)} title="Remove"><IconTrash size={16} /></ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>

          <Group justify="flex-end"><Button onClick={saveTemplate}>Save template</Button></Group>
        </Stack>
      </Modal>
    </Card>
  );
}

/* -------------------------------------------------------
   Data Pane (simple export of DB rows, handy for QA)
------------------------------------------------------- */

function UsersPaneDB() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);

  const [invite, setInvite] = useState({ email: "", role: "Employee", locations: [] });
  const [pinModal, setPinModal] = useState({ open: false, userId: null, email: "", pin: "" });

  async function refresh() {
    setLoading(true);
    const [u, l, ul] = await Promise.all([
      supabase.from("user_profile").select("*").order("created_at", { ascending: false }),
      supabase.from("location").select("id,name").order("name", { ascending: true }),
      supabase.from("user_location").select("*"),
    ]);
    setLoading(false);

    if (u.error || l.error || ul.error) {
      if (u.error)  console.error(u.error);
      if (l.error)  console.error(l.error);
      if (ul.error) console.error(ul.error);
      setRows([]); setLocations([]);
      return;
    }

    const locMap = new Map((l.data || []).map(x => [x.id, x.name]));
    const byUser = new Map();
    for (const r of (ul.data || [])) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      byUser.get(r.user_id).push(r.location_id);
    }

    const joined = (u.data || []).map(x => ({
      ...x,
      locations: byUser.get(x.id) || [],
    }));

    setRows(joined);
    setLocations(l.data || []);
  }

  useEffect(() => { refresh(); }, []);

  async function addUser() {
    if (!invite.email.trim()) return;
    const { data, error } = await supabase
      .from("user_profile")
      .insert({ email: invite.email.trim(), role: invite.role })
      .select("id")
      .single();
    if (error) return alert(error.message);

    if ((invite.locations || []).length) {
      const pairs = invite.locations.map(lid => ({ user_id: data.id, location_id: lid }));
      const { error: e2 } = await supabase.from("user_location").insert(pairs);
      if (e2) return alert(e2.message);
    }

    setInvite({ email: "", role: "Employee", locations: [] });
    refresh();
  }

  async function updateRole(userId, role) {
    const { error } = await supabase.from("user_profile").update({ role }).eq("id", userId);
    if (error) return alert(error.message);
    refresh();
  }

  async function updateLocations(userId, locList) {
    // replace all assignments (simple approach)
    const { error: delErr } = await supabase.from("user_location").delete().eq("user_id", userId);
    if (delErr) return alert(delErr.message);
    if (locList.length) {
      const rows = locList.map(lid => ({ user_id: userId, location_id: lid }));
      const { error: insErr } = await supabase.from("user_location").insert(rows);
      if (insErr) return alert(insErr.message);
    }
    refresh();
  }

  async function deleteUser(userId) {
    if (!confirm("Remove this user?")) return;
    const { error } = await supabase.from("user_profile").delete().eq("id", userId);
    if (error) return alert(error.message);
    refresh();
  }

  async function savePin() {
    try {
      if (!pinModal.userId || !pinModal.pin) return;
      const { error } = await supabase.rpc("set_user_pin", {
        p_user_id: pinModal.userId,
        p_pin: pinModal.pin,
      });
      if (error) throw error;
      setPinModal({ open: false, userId: null, email: "", pin: "" });
      refresh();
      alert("PIN updated.");
    } catch (e) {
      alert(e.message);
    }
  }

  const locOptions = locations.map(l => ({ value: l.id, label: l.name }));

  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Users & Roles</Text>

      <Stack gap="sm" mb="md">
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
            data={["Admin","Manager","Employee"]}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
        <MultiSelect
          label="Assign to locations"
          placeholder="Pick one or more"
          data={locOptions}
          value={invite.locations}
          onChange={(vals) => setInvite({ ...invite, locations: vals })}
          searchable
          comboboxProps={{ withinPortal: true }}
        />
        <Group justify="flex-end">
          <Button leftSection={<IconPlus size={16} />} onClick={addUser} disabled={loading}>Add user</Button>
        </Group>
      </Stack>

      <ScrollArea.Autosize mah={420} type="auto" scrollbarSize={8} styles={{ viewport: { overflowX: "hidden" } }}>
        <Table highlightOnHover style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "36%" }} />
            <col style={{ width: "20%" }} />
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
            {rows.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</Table.Td>
                <Table.Td>
                  <Select
                    value={u.role}
                    onChange={(v) => updateRole(u.id, v)}
                    data={["Admin","Manager","Employee"]}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <MultiSelect
                    data={locOptions}
                    value={u.locations}
                    onChange={(vals) => updateLocations(u.id, vals)}
                    searchable
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="default" onClick={() => setPinModal({ open: true, userId: u.id, email: u.email, pin: "" })}>
                      Set PIN
                    </Button>
                    <ActionIcon color="red" variant="subtle" onClick={() => deleteUser(u.id)} title="Remove">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Modal opened={pinModal.open} onClose={() => setPinModal({ open: false, userId: null, email: "", pin: "" })} title={`Set PIN for ${pinModal.email}`} centered>
        <Stack>
          <TextInput
            type="password"
            label="New PIN (4–8 digits)"
            value={pinModal.pin}
            onChange={(e) => setPinModal({ ...pinModal, pin: e.target.value })}
          />
          <Group justify="flex-end">
            <Button onClick={savePin}>Save PIN</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}


function DataPaneSimple() {
  const [dump, setDump] = useState(null);

  async function grab() {
    const out = {};
    const a = await supabase.from("location").select("*").order("name");
    const b = await supabase.from("time_block").select("*").order("start_time");
    const c = await supabase.from("tasklist_template").select("*").order("name");
    const d = await supabase.from("tasklist_task").select("*").order("title");
    out.location = a.data || [];
    out.time_block = b.data || [];
    out.tasklist_template = c.data || [];
    out.tasklist_task = d.data || [];
    setDump(out);
  }

  const download = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Data & Export</Text>
      <Stack gap="sm">
        <Group>
          <Button onClick={grab}>Fetch current DB snapshot</Button>
          <Button variant="default" onClick={() => dump && download("db-snapshot.json", dump)} disabled={!dump}>
            Export snapshot
          </Button>
        </Group>
        <Text c="dimmed" fz="sm">Grab a quick JSON snapshot of your core tables for debugging or migration.</Text>
        {dump && <Text fz="xs" c="dimmed">Rows: loc {dump.location.length}, tb {dump.time_block.length}, tpl {dump.tasklist_template.length}, task {dump.tasklist_task.length}</Text>}
      </Stack>
    </Card>
  );
}

