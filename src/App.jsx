import React, { useMemo, useState, useEffect, useCallback } from "react";
import AdminView from "./AdminView";
import { MantineProvider, createTheme, AppShell, Container, Group, Button, Select, Card, Text, Badge, Table, Grid, Stack, NumberInput, TextInput, Modal, ActionIcon, ScrollArea, FileButton, Switch, SegmentedControl, rem, Tabs, Center, Loader, Drawer, Burger, Divider, Collapse } from "@mantine/core";

import { supabase } from "./lib/supabase.js";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  fetchSubmissionAndTasks,
  validatePin,
  findOrCreateSubmission,
  upsertSubmissionTask,
  todayISOInTz,
  uploadEvidence,
  toPublicUrl,         // <-- add
} from './lib/submissions';
import { useLocalStorage, useDisclosure } from "@mantine/hooks";
import { IconSun, IconMoon, IconPhoto, IconCheck, IconUpload, IconMapPin, IconUser, IconLayoutGrid, IconLayoutList, IconBug, IconLogout, IconShieldHalf, IconFilter, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { getMyCompanyId } from "./lib/company"; // [COMPANY_SCOPE]
import fetchUsers, { fetchLocations, getCompany, listTimeBlocks, listTasklistTemplates } from "./lib/queries.js";
import BugReport from "./components/BugReport.jsx";
import { listRestockRequests, createRestockRequest, completeRestockRequest } from "./lib/queries.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** ---------------------- Utils ---------------------- */

function PhotoThumbs({ urls = [], size = 64, title = "Photo" }) {
  const [open, setOpen] = React.useState(false);
  const [src, setSrc] = React.useState(null);

  return (
    <>
      <Group gap="xs" wrap="wrap">
        {urls.map((u, i) => (
          <img
            key={i}
            src={u}
            alt={`evidence-${i}`}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.opacity = '0.35';
              e.currentTarget.title = `Failed to load\n${u}`;
            }}
            style={{
              width: size, height: size, objectFit: 'cover',
              borderRadius: 6, border: '1px solid var(--mantine-color-gray-3)',
              cursor: 'pointer'
            }}
            loading="lazy"
            onClick={() => { setSrc(u); setOpen(true); }}
          />
        ))}
      </Group>

      <Modal opened={open} onClose={() => setOpen(false)} title={title} centered size="auto" styles={{ body: { padding: 0 } }}>
        {src && (
          <img
            src={src}
            alt="evidence-full"
            style={{ maxWidth: '90vw', maxHeight: '80vh', display: 'block' }}
          />
        )}
      </Modal>
    </>
  );
}

function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function canTaskBeCompleted(task, state) {
  if (!state) return false;
  if (state.na) return true;
  if (task.photoRequired && (!state.photos || state.photos.length === 0)) return false;
  if (task.noteRequired && (!state.note || state.note.trim() === "")) return false;
  if (task.inputType === "number") {
    const v = state.value;
    const isNum = typeof v === "number" && !Number.isNaN(v);
    if (!isNum) return false;
    if (typeof task.min === "number" && v < task.min) return false;
    if (typeof task.max === "number" && v > task.max) return false;
  }
  return true;
}

// --------- Checklist resolution (templates + ad-hoc) ----------
function weekdayIndexFromISO(dateISO, tz) {
  try {
    const parts = dateISO.split("-");
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
    if (tz) {
      // Get weekday in target timezone using Intl
      const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz });
      const wk = fmt.format(d); // Sun, Mon, ...
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wk);
    }
    return d.getUTCDay();
  } catch {
    return new Date().getDay();
  }
}

function getTimeBlockLabelFromLists(blocks, id) {
  const b = (blocks || []).find(tb => tb.id === id);
  return b ? `${b.name} (${b.start}–${b.end})` : id;
}

/** ---------------------- Theme toggle (prop-driven) ---------------------- */
function ThemeToggle({ scheme, setScheme }) {
  const next = scheme === "dark" ? "light" : "dark";
  return (
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
  );
}

/** ---------------------- Pin Modal ---------------------- */
function PinDialog({ opened, onClose, onConfirm }) {
  const [pin, setPin] = useState('');

  // Clear when the modal opens
  useEffect(() => {
    if (opened) setPin('');
  }, [opened]);

  const handleClose = () => {
    setPin('');
    onClose?.();
  };

  const handleConfirm = () => {
    const p = pin;
    setPin('');              // clear immediately so it never “sticks”
    onConfirm?.(p);
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Enter PIN" centered>
      <Stack gap="sm">
        <TextInput
          type="password"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.currentTarget.value)}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** ---------------------- Evidence ---------------------- */
function EvidenceRow({ state }) {
  if (!state) return null;
  const paths = Array.isArray(state.photos) ? state.photos : [];
  const urls = paths
    .filter(p => typeof p === 'string' && p.includes('/')) // guard against "file.name"
    .map(p => toPublicUrl(supabase, 'evidence', p));
  return (
    <Stack gap="xs" mt="xs">
      {urls.length > 0 && <PhotoThumbs urls={urls} size={56} title="Evidence" />}

      <Group gap="xs" wrap="wrap">
        {state.note ? <Badge variant="light">Note: {state.note}</Badge> : null}
        {(state.value ?? null) !== null ? <Badge variant="light">Value: {state.value}</Badge> : null}
        {state.na ? <Badge variant="light" color="gray">N/A</Badge> : null}
      </Group>
    </Stack>
  );
}

/** ---------------------- Employee View ---------------------- */
function EmployeeView({
  tasklists,
  working,
  updateTaskState,
  handleComplete,
  handleUpload,
  signoff,
  submissions,
  setSubmissions,
  setWorking,
  checklists,
  company
}) {
  const [openLists, setOpenLists] = React.useState({});
  const [openTasks, setOpenTasks] = React.useState({});

  const isTaskOpen = (tlId, taskId) => !!openTasks[`${tlId}:${taskId}`];
  const toggleTaskOpen = (tlId, taskId) =>
    setOpenTasks((prev) => {
      const k = `${tlId}:${taskId}`;
      return { ...prev, [k]: !prev[k] };
    });

  return (
    <Stack gap="md">
      <Text fw={700} fz="lg">Today</Text>

      {tasklists.map((tl) => {
        const states =
          working?.[tl.id] ??
          tl.tasks.map((t) => ({
            taskId: t.id,
            status: "Incomplete",
            value: null,
            note: "",
            photos: [],
            na: false,
            reviewStatus: "Pending",
          }));
        const total = tl.tasks.length;
        const done = states.filter((t) => t.status === "Complete" || t.na).length;
        const canSubmit = tl.tasks.every((t) => {
          const st = states.find((s) => s.taskId === t.id);
          return (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
        });

        const isOpen = openLists[tl.id] ?? true;
        return (
          <Card key={tl.id} withBorder radius="lg" shadow="sm">
            <Group justify="space-between" align="center">
              <div>
                <Group gap={6} align="center">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setOpenLists(prev => ({ ...prev, [tl.id]: !(prev[tl.id] ?? true) }))}
                    aria-label="Toggle checklist"
                  >
                    {(isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />)}
                  </ActionIcon>
                  <Text fw={600}>{tl.name}</Text>
                </Group>
                <Text c="dimmed" fz="sm">
                  {getTimeBlockLabelFromLists(checklists.timeBlocks, tl.timeBlockId)}
                </Text>
                <Badge mt={6} variant="light">
                  Progress: {done}/{total} ({pct(done, total)}%)
                </Badge>
              </div>
              <Button onClick={() => signoff(tl)} disabled={!canSubmit}>Sign & Submit</Button>
            </Group>

            <Collapse in={isOpen}>
            <Stack gap="xs" mt="md">
              {tl.tasks.map((task) => {
                const state = states.find((s) => s.taskId === task.id);
                const isComplete = state.status === "Complete";
                const canComplete = canTaskBeCompleted(task, state);
                const opened = isTaskOpen(tl.id, task.id);
                return (
                  <Card
                    key={task.id}
                    withBorder
                    radius="md"
                    style={{
                      borderColor: isComplete ? "var(--mantine-color-green-6)" : undefined,
                      background: isComplete ? "color-mix(in oklab, var(--mantine-color-green-6) 8%, var(--mantine-color-body))" : undefined,
                    }}
                  >
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <ActionIcon variant="subtle" onClick={() => toggleTaskOpen(tl.id, task.id)} aria-label="Toggle details">
                          {opened ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                        </ActionIcon>
                        <div style={{ minWidth: 0 }}>
                          <Group gap={6} wrap="wrap">
                            <Text fw={600} truncate c={isComplete ? "green.9" : undefined}>{task.title}</Text>
                            {state.reviewStatus && (
                              <Badge
                                variant="outline"
                                color={state.reviewStatus === "Approved" ? "green" : state.reviewStatus === "Rework" ? "yellow" : "gray"}
                              >
                                {state.reviewStatus}
                              </Badge>
                            )}
                            {isComplete && (
                              <Badge color="green" variant="light" leftSection={<IconCheck size={14} />}>Completed</Badge>
                            )}
                          </Group>
                          <Text c="dimmed" fz="sm" mt={2}>
                            {task.category} • {task.inputType}
                            {task.photoRequired ? " • Photo required" : ""}
                            {task.noteRequired ? " • Note required" : ""}
                          </Text>
                        </div>
                      </Group>

                      <Group gap="xs" wrap="wrap" justify="flex-end" style={{ flexShrink: 0 }}>
                        {task.inputType === "number" && (
                          <NumberInput
                            placeholder={`${task.min ?? ""}-${task.max ?? ""}`}
                            value={state.value ?? ""}
                            onChange={(v) => updateTaskState(tl.id, task.id, { value: Number(v) })}
                            disabled={isComplete}
                            style={{ width: rem(96) }}
                          />
                        )}

                        <TextInput
                          placeholder="Add note"
                          value={state.note}
                          onChange={(e) => updateTaskState(tl.id, task.id, { note: e.target.value })}
                          disabled={isComplete && !task.noteRequired}
                          style={{ width: rem(180) }}
                          visibleFrom="sm"
                        />

                        <FileButton onChange={(file) => file && handleUpload(tl, task, file)} accept="image/*" disabled={isComplete}>
                          {(props) => (
                            <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
                              Photo
                            </Button>
                          )}
                        </FileButton>

                        <Button
                          variant={isComplete ? "outline" : "default"}
                          color={isComplete ? "green" : undefined}
                          onClick={() => handleComplete(tl, task)}
                          disabled={!canComplete || isComplete}
                        >
                          {isComplete ? "Completed ✓" : "Complete"}
                        </Button>

                        <Switch
                          checked={!!state.na}
                          onChange={(e) => updateTaskState(tl.id, task.id, { na: e.currentTarget.checked })}
                          disabled={isComplete}
                          label="N/A"
                        />
                      </Group>
                    </Group>

                    <Collapse in={opened}>
                      <Divider my={"sm"} />
                      <Stack gap="xs">
                        <TextInput
                          placeholder="Add note"
                          value={state.note}
                          onChange={(e) => updateTaskState(tl.id, task.id, { note: e.target.value })}
                          disabled={isComplete && !task.noteRequired}
                          style={{ width: "100%" }}
                          hiddenFrom="sm"
                        />
                        <EvidenceRow state={state} />
                      </Stack>
                    </Collapse>
                  </Card>
                );
              })}
            </Stack>
            </Collapse>
          </Card>
        );
      })}

      <Card withBorder radius="md" style={{ position: "sticky", zIndex: 1, top: 90 }}>
        <Text fw={600} fz="lg" mb="xs">Review Queue (Rework Needed)</Text>
        {submissions.filter((s) => s.status === "Rework").length === 0 ? (
          <Text c="dimmed" fz="sm">No rework requested.</Text>
        ) : (
          submissions
            .filter((s) => s.status === "Rework")
            .map((s) => (
              <EmployeeReworkCard
                key={s.id}
                s={s}
                setSubmissions={setSubmissions}
                setWorking={setWorking}
                getTaskMeta={(tasklistId, taskId) => {
                  const tl = tasklists.find((x) => x.id === tasklistId);
                  return tl?.tasks.find((t) => t.id === taskId) || { title: taskId, inputType: "checkbox" };
                }}
                company={company}
              />
            ))
        )}
      </Card>
    </Stack>
  );
}

function resolveTasklistsForDayFromLists({ timeBlocks, templates }, locationId, dateISO, tz = "UTC") {
  const dow = weekdayIndexFromISO(dateISO, tz);
  const tMap = Object.fromEntries((timeBlocks || []).map(tb => [tb.id, tb]));
  const todays = (templates || []).filter(t =>
    (t.active !== false) &&
    t.locationId === locationId &&
    Array.isArray(t.recurrence) &&
    t.recurrence.includes(dow)
  );
  const list = todays.map(tpl => ({
    id: tpl.id,
    locationId: tpl.locationId,
    name: tpl.name,
    timeBlockId: tpl.timeBlockId,
    recurrence: tpl.recurrence || [],
    requiresApproval: tpl.requiresApproval !== false,
    signoffMethod: tpl.signoffMethod || "PIN",
    tasks: (tpl.tasks || []).map(t => ({
      id: t.id, title: t.title, category: t.category || "",
      inputType: t.inputType || "checkbox",
      min: t.min ?? null, max: t.max ?? null,
      photoRequired: !!t.photoRequired,
      noteRequired: !!t.noteRequired,
      allowNA: t.allowNA !== false,
      priority: typeof t.priority === "number" ? t.priority : 3
    }))
  }));
  list.sort((a, b) => (tMap[a.timeBlockId]?.start || "00:00").localeCompare(tMap[b.timeBlockId]?.start || "00:00"));
  return list;
}



function EmployeeReworkCard({ s, setSubmissions, setWorking, getTaskMeta, company }) {
  function updateSubmissionTask(submissionId, taskId, patch) {
    setSubmissions((prev) =>
      prev.map((sx) => {
        if (sx.id !== submissionId) return sx;
        const tasks = sx.tasks.map((t) => {
          if (t.taskId !== taskId) return t;
          const p = typeof patch === "function" ? patch(t) : patch;
          return { ...t, ...p };
        });
        return { ...sx, tasks };
      })
    );
  }
  function batchUpdateSubmissionTasks(submissionId, decidePatch) {
    setSubmissions((prev) =>
      prev.map((sx) => {
        if (sx.id !== submissionId) return sx;
        const tasks = sx.tasks.map((t) => {
          const meta = getTaskMeta(sx.tasklistId, t.taskId);
          const p = decidePatch(t, meta);
          return p ? { ...t, ...p } : t;
        });
        return { ...sx, tasks };
      })
    );
  }

  function recomputeSubmissionStatus(submissionId) {
    setSubmissions((prev) =>
      prev.map((sx) => {
        if (sx.id !== submissionId) return sx;
        const statuses = sx.tasks.map((t) => t.reviewStatus);
        const hasRework = statuses.includes("Rework");
        const allApproved = sx.tasks.length > 0 && sx.tasks.every((t) => t.reviewStatus === "Approved");
        const status = hasRework ? "Rework" : allApproved ? "Approved" : "Pending";
        return { ...sx, status };
      })
    );
  }

  return (
    <Card withBorder radius="md" mt="sm">
      <Group justify="space-between">
        <div>
          <Text fw={600}>{s.tasklistName}</Text>
          <Text c="dimmed" fz="sm">{s.date} • Signed: {s.signedBy}</Text>
        </div>
        <Badge color="yellow" variant="light">Rework</Badge>
      </Group>

      <ScrollArea mt="sm">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Task</Table.Th>
              <Table.Th>Value / Note</Table.Th>
              <Table.Th className="hide-sm">Photos</Table.Th>
              <Table.Th>Fix</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {s.tasks.filter((t) => t.reviewStatus === "Rework").map((t, i) => {
              const meta = getTaskMeta(s.tasklistId, t.taskId);
              const isComplete = t.status === "Complete";
              const canComplete = canTaskBeCompleted(meta, t);
              return (
                <Table.Tr key={i}>
                  <Table.Td><Text fw={600}>{meta.title}</Text></Table.Td>
                  <Table.Td>
                    <Group wrap="wrap" gap="xs">
                      {meta.inputType === "number" && (
                        <NumberInput
                          placeholder={`${meta.min ?? ""}-${meta.max ?? ""}`}
                          value={t.value ?? ""}
                          onChange={(v) => updateSubmissionTask(s.id, t.taskId, { value: Number(v) })}
                          style={{ width: rem(110) }}
                        />
                      )}
                      <TextInput
                        placeholder="Add note"
                        value={t.note ?? ""}
                        onChange={(e) => updateSubmissionTask(s.id, t.taskId, { note: e.target.value })}
                        style={{ minWidth: rem(160) }}
                      />
                    </Group>
                  </Table.Td>
                  <Table.Td className="hide-sm">
                    <Group gap="xs" wrap="wrap">
                      <FileButton
                        onChange={async (file) => {
                          if (!file) return;
                          try {
                            const path = await uploadEvidence({
                              supabase,
                              bucket: 'evidence',
                              companyId: s.companyId ?? company.id,     // ensure you pass company.id somehow
                              tasklistId: s.tasklistId,
                              taskId: t.taskId,
                              file
                            });
                            // persist to DB (merge existing row safely)
                            const { data: row } = await supabase
                              .from('submission_task')
                              .select('status, review_status, na, value, note, photos')
                              .eq('submission_id', s.id)
                              .eq('task_id', t.taskId)
                              .maybeSingle();
                            await upsertSubmissionTask({
                              supabase,
                              submissionId: s.id,
                              taskId: t.taskId,
                              payload: {
                                status: row?.status ?? 'Incomplete',
                                review_status: row?.review_status ?? 'Pending',
                                na: !!row?.na,
                                value: row?.value ?? null,
                                note: row?.note ?? null,
                                photos: [...(row?.photos || []), path],
                              },
                            });
                            // local mirror
                            updateSubmissionTask(s.id, t.taskId, (prev) => ({ photos: [...(prev.photos || []), path] }));
                          } catch (e) {
                            console.error(e);
                            alert('Upload failed');
                          }
                        }}
                        accept="image/*"
                      >
                        {(props) => <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>Upload</Button>}
                      </FileButton>
                      <Group gap="xs">
                        {(t.photos || []).map((p, j) => (
                          <Badge key={j} variant="light" leftSection={<IconPhoto size={14} />}>{p}</Badge>
                        ))}
                      </Group>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      variant={isComplete ? "outline" : "default"}
                      color={isComplete ? "green" : undefined}
                      disabled={isComplete || !canComplete}
                      onClick={() => updateSubmissionTask(s.id, t.taskId, { status: "Complete" })}
                    >
                      {isComplete ? "Completed ✓" : "Mark Complete"}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Group justify="flex-end" mt="sm">
        <Button
          onClick={() => {
            batchUpdateSubmissionTasks(s.id, (task, meta) => {
              if (task.reviewStatus === "Rework" && task.status === "Complete" && canTaskBeCompleted(meta, task)) {
                return { reviewStatus: "Pending" };
              }
              return null;
            });
            recomputeSubmissionStatus(s.id);
            alert("Resubmitted fixes for review.");
          }}
        >
          Resubmit for Review
        </Button>
      </Group>
    </Card>
  );
}

/** ---------------------- Manager View ---------------------- */
function ManagerView({
  submissions,
  setSubmissions,
  setWorking,
  company,
  locations,
  employees,
  getTaskMeta
}) {
  async function fetchManagerSubmissions({ supabase, companyId, from, to, locationId }) {
    let q = supabase
      .from('submission')
      .select(`
        id, tasklist_id, location_id, date, status, signed_by, submitted_by,
         submission_task:submission_task (
   task_id, status, review_status, na, value, note, photos, rework_count, review_note, submitted_by
 )
      `)
      .eq('company_id', companyId)
      .gte('date', from)
      .lte('date', to);

    if (locationId) q = q.eq('location_id', locationId);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  const [reworkNote, setReworkNote] = useState("");

  const userById = useMemo(() => {
    const m = new Map();
    (employees || []).forEach(u => m.set(String(u.id), u));
    return m;
  }, [employees]);

  const nameForUserId = (uid) => {
    const u = uid ? userById.get(String(uid)) : null;
    return u?.display_name || uid || "—";
  };


  // ---------- Filters ----------
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    locationId: "",
    employee: "",
    category: "",
    status: "", // Pending | Approved | Rework
  });

  const locationOptions = [{ value: "", label: "All locations" }].concat(
    locations.map((l) => ({ value: String(l.id), label: l.name }))
  );
  const employeeOptions = [{ value: "", label: "All employees" }].concat(
    (employees || []).map(u => ({ value: String(u.id), label: u.display_name }))
  );
  const categoryOptions = [{ value: "", label: "All categories" }].concat(
    Array.from(
      new Set(
        submissions.flatMap((s) =>
          s.tasks.map((t) => (getTaskMeta(s.tasklistId, t.taskId)?.category || "").trim())
        )
      )
    )
      .filter(Boolean)
      .map((c) => ({ value: c, label: c }))
  );

  function matchesFilters(s) {
    if (filters.locationId && s.locationId !== filters.locationId) return false;
    if (filters.employee) {
      const submissionSubmitterOk = String(s.submittedBy || "") === String(filters.employee);
      const anyTaskSubmitterOk = s.tasks?.some(t => String(t.submittedBy || "") === String(filters.employee));
      if (!submissionSubmitterOk && !anyTaskSubmitterOk) return false;
    }
    if (filters.status && s.status !== filters.status) return false;
    if (filters.from && s.date < filters.from) return false;
    if (filters.to && s.date > filters.to) return false;
    if (filters.category) {
      const any = s.tasks.some(
        (t) => (getTaskMeta(s.tasklistId, t.taskId)?.category || "").trim() === filters.category
      );
      if (!any) return false;
    }
    return true;
  }

  const filtered = submissions.filter(matchesFilters);

  // ---------- Metrics ----------
  const totals = filtered.reduce(
    (acc, s) => {
      for (const t of s.tasks) {
        const approved = t.reviewStatus === "Approved";
        const isNA = !!t.na;

        // Count a task as complete ONLY once when finally approved (or N/A)
        if (approved || isNA) acc.totalTasksCompleted += 1;

        // Current rework queue count = tasks currently marked Rework
        if (t.reviewStatus === "Rework") acc.totalRework += 1;

        // Tasks that went through rework at any point (for reporting)
        if (t.wasReworked) acc.totalReworkedHistorical += 1;
      }
      return acc;
    },
    { totalTasksCompleted: 0, totalRework: 0, totalReworkedHistorical: 0 }
  );


  const byEmployeeMap = new Map();
  for (const s of filtered) {
    const emp = s.submittedBy || s.signedBy || "Unknown";
    if (!byEmployeeMap.has(emp)) byEmployeeMap.set(emp, { employee: emp, completed: 0 });
    const row = byEmployeeMap.get(emp);
    for (const t of s.tasks) {
      if (t.na || t.reviewStatus === "Approved") row.completed += 1;
      if (t.wasReworked) row.reworked += 1; // optional, if you want to visualize it later
    }
  }
  const byEmployee = Array.from(byEmployeeMap.values()).sort(
    (a, b) => b.completed - a.completed
  );

  // ---------- Approvals (existing behavior) ----------
  const [selection, setSelection] = useState({});
  function toggle(subId, taskId) {
    setSelection((prev) => {
      const cur = new Set(prev[subId] || []);
      cur.has(taskId) ? cur.delete(taskId) : cur.add(taskId);
      return { ...prev, [subId]: cur };
    });
  }

  async function markTasksRework({ supabase, submissionId, taskIds, note }) {
    const { error } = await supabase.rpc('mark_rework', {
      p_submission_id: submissionId,
      p_task_ids: taskIds,
      p_note: note ?? null
    });
    if (error) throw error;
  }

  async function markTasksApproved({ supabase, submissionId, taskIds }) {
    const { error } = await supabase
      .from('submission_task')
      .update({ review_status: 'Approved' })
      .eq('submission_id', submissionId)
      .in('task_id', taskIds);
    if (error) throw error;
  }

  async function applyReview(subId, review, note) {
    // 1) Resolve which tasks are selected (default to all tasks in the submission)
    const sel = selection[subId];
    const sub = submissions.find(x => x.id === subId);
    if (!sub) return;

    const taskIds = (sel && sel.size > 0)
      ? Array.from(sel)
      : sub.tasks.map(t => t.taskId);

    if (!taskIds.length) return;

    try {
      // 2) Persist to DB first
      if (review === 'Rework') {
        await markTasksRework({ supabase, submissionId: subId, taskIds, note });
      } else if (review === 'Approved') {
        await markTasksApproved({ supabase, submissionId: subId, taskIds });
      } else {
        throw new Error('Unsupported review value');
      }

      // 3) Local mirror (keeps UI snappy)
      setSubmissions(prev =>
        prev.map(s => {
          if (s.id !== subId) return s;

          const tasks = s.tasks.map(t => {
            if (!taskIds.includes(t.taskId)) return t;

            if (review === 'Rework') {
              return {
                ...t,
                reviewStatus: 'Rework',
                reviewNote: note || t.reviewNote || '',
                reworkCount: (t.reworkCount ?? 0) + 1,
                wasReworked: true,
              };
            }
            // Approved
            return { ...t, reviewStatus: 'Approved' };
          });

          // Recompute submission aggregate status
          const hasRework = tasks.some(t => t.reviewStatus === 'Rework');
          const allApproved = tasks.length > 0 && tasks.every(t => t.reviewStatus === 'Approved');
          const status = hasRework ? 'Rework' : (allApproved ? 'Approved' : 'Pending');

          // Reflect to employee working state so they see up-to-date review chips
          setWorking(prevW => {
            const list = prevW[s.tasklistId];
            if (!list) return prevW;

            const nextList = list.map(wt => {
              if (!taskIds.includes(wt.taskId)) return wt;
              if (review === 'Approved') return { ...wt, status: 'Complete', reviewStatus: 'Approved' };
              if (review === 'Rework') return { ...wt, status: 'Incomplete', reviewStatus: 'Rework' };
              return { ...wt, reviewStatus: review };
            });

            return { ...prevW, [s.tasklistId]: nextList };
          });

          return { ...s, tasks, status };
        })
      );

      // 4) Clear selection for this submission card
      setSelection(prev => ({ ...prev, [subId]: new Set() }));

      // 5) (Optional) Re-fetch from DB if you prefer authoritative state
      const fresh = await fetchManagerSubmissions({
        supabase,
        companyId: company.id,
        from: filters.from || todayISOInTz(company.timezone || 'UTC'),
        to: filters.to || todayISOInTz(company.timezone || 'UTC'),
        locationId: filters.locationId || null
      });
      // setSubmissions(fresh.map(/* map to view model */));
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to update review status');
    }
  }

  useEffect(() => {
    if (!company?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const list = await fetchManagerSubmissions({
          supabase,
          companyId: company.id,
          from: filters.from || todayISOInTz(company.timezone || 'UTC'),
          to: filters.to || todayISOInTz(company.timezone || 'UTC'),
          locationId: filters.locationId || null
        });
        if (!cancelled) setSubmissions(list.map(s => ({
          id: s.id,
          tasklistId: s.tasklist_id,
          locationId: s.location_id,
          date: s.date,
          status: s.status,
          signedBy: s.signed_by,
          submittedBy: s.submitted_by,
          tasks: (s.submission_task || []).map(t => ({
            taskId: t.task_id,
            status: t.status,
            reviewStatus: t.review_status,
            na: t.na,
            value: t.value,
            note: t.note,
            photos: t.photos || [],
            reworkCount: t.rework_count,
            reviewNote: t.review_note,
            submittedBy: t.submitted_by,
          })),
        })));
      } catch (e) {
        console.error(e);
        // show a toast if you want
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, company.id, company.timezone, filters.from, filters.to, filters.locationId]);

  return (
    <Stack gap="md">
      <Tabs defaultValue="approve" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="approve">Approve</Tabs.Tab>
          <Tabs.Tab value="dashboard">Dashboard</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="approve" pt="md">
          <Card withBorder radius="md" mb="sm">
            <Grid>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput
                  label="From"
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput
                  label="To"
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select
                  label="Location"
                  data={locationOptions}
                  value={filters.locationId}
                  onChange={(v) => setFilters({ ...filters, locationId: v || "" })}
                  comboboxProps={{ withinPortal: true }}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select
                  label="Employee"
                  data={employeeOptions}
                  value={filters.employee}
                  onChange={(v) => setFilters({ ...filters, employee: v || "" })}
                  searchable
                  comboboxProps={{ withinPortal: true }}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select
                  label="Category"
                  data={categoryOptions}
                  value={filters.category}
                  onChange={(v) => setFilters({ ...filters, category: v || "" })}
                  searchable
                  comboboxProps={{ withinPortal: true }}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select
                  label="Status"
                  data={[
                    { value: "", label: "All" },
                    { value: "Pending", label: "Pending" },
                    { value: "Approved", label: "Approved" },
                    { value: "Rework", label: "Rework" },
                  ]}
                  value={filters.status}
                  onChange={(v) => setFilters({ ...filters, status: v || "" })}
                  comboboxProps={{ withinPortal: true }}
                />
              </Grid.Col>
            </Grid>
          </Card>

          {filtered.length === 0 ? (
            <Text c="dimmed" fz="sm">No submissions match your filters.</Text>
          ) : null}

          {filtered.map((s) => (
            <Card key={s.id} withBorder radius="lg" shadow="sm" mb="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{s.tasklistName}</Text>
                  <Text c="dimmed" fz="sm">
                    {s.date} • {locations.find((l) => String(l.id) === String(s.locationId))?.name || s.locationId} • By: {nameForUserId(s.submittedBy) || s.signedBy || "—"}
                  </Text>
                </div>
                <Badge variant="light" color={s.status === "Approved" ? "green" : s.status === "Rework" ? "yellow" : "gray"}>
                  {s.status}
                </Badge>
              </Group>

              <ScrollArea mt="sm">
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>
                        <input
                          type="checkbox"
                          checked={(selection[s.id]?.size || 0) === s.tasks.length}
                          onChange={(e) => {
                            const all = new Set(e.currentTarget.checked ? s.tasks.map((t) => t.taskId) : []);
                            setSelection((prev) => ({ ...prev, [s.id]: all }));
                          }}
                        />
                      </Table.Th>
                      <Table.Th>Task</Table.Th>
                      <Table.Th className="hide-sm">Value</Table.Th>
                      <Table.Th className="hide-sm">Note</Table.Th>
                      <Table.Th className="hide-sm">Photos</Table.Th>
                      <Table.Th className="hide-sm">Submitted By</Table.Th>
                      <Table.Th>Emp Status</Table.Th>
                      <Table.Th>Review</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {s.tasks.map((t, i) => {
                      const meta = getTaskMeta(s.tasklistId, t.taskId);
                      return (
                        <Table.Tr key={i}>
                          <Table.Td>
                            <input
                              type="checkbox"
                              checked={selection[s.id]?.has(t.taskId) || false}
                              onChange={() => toggle(s.id, t.taskId)}
                            />
                          </Table.Td>
                          <Table.Td><Text fw={600}>{getTaskMeta(s.tasklistId, t.taskId)?.title || t.taskId}</Text></Table.Td>
                          <Table.Td className="hide-sm">{t.value ?? "-"}</Table.Td>
                          <Table.Td className="hide-sm">{t.note || "-"}</Table.Td>
                          <Table.Td className="hide-sm">
                            {(t.photos || []).length ? (
                              <PhotoThumbs
                                urls={(t.photos || [])
                                  .filter(p => typeof p === 'string' && p.includes('/'))
                                  .map(p => toPublicUrl(supabase, 'evidence', p))}
                                size={56}
                                title="Evidence"
                              />
                            ) : "-"}
                          </Table.Td>
                          <Table.Td>{nameForUserId(t.submittedBy)}</Table.Td>
                          <Table.Td>
                            <Badge variant="outline" color={t.status === "Complete" ? "green" : "gray"}>
                              {t.na ? "N/A" : t.status}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              variant="outline"
                              color={t.reviewStatus === "Approved" ? "green" : t.reviewStatus === "Rework" ? "yellow" : "gray"}
                            >
                              {t.reviewStatus}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              variant="outline"
                              color={t.reviewStatus === "Approved" ? "green" : t.reviewStatus === "Rework" ? "yellow" : "gray"}
                            >
                              {t.reviewStatus}
                            </Badge>
                            {(t.reworkCount ?? 0) > 0 && (
                              <Text c="dimmed" fz="xs" mt={4}>
                                Reworked ×{t.reworkCount}{t.reviewNote ? ` — ${t.reviewNote}` : ""}
                              </Text>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>

              <Group justify="flex-end" mt="sm">
                <TextInput
                  label="Rework reason"
                  placeholder="What needs to be fixed?"
                  value={reworkNote}
                  onChange={(e) => setReworkNote(e.target.value)}
                  maw={480}
                />
                <Button
                  variant="default"
                  onClick={() => applyReview(s.id, "Rework", reworkNote /* from your TextInput */)}
                >
                  Rework Selected
                </Button>
                <Button onClick={() => applyReview(s.id, "Approved")}>
                  Approve Selected
                </Button>
              </Group>
            </Card>
          ))}
        </Tabs.Panel>

        <Tabs.Panel value="dashboard" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Card withBorder radius="md">
                <Text c="dimmed" fz="sm">Total tasks completed</Text>
                <Text fw={700} fz="xl">{totals.totalTasksCompleted}</Text>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Card withBorder radius="md">
                <Text c="dimmed" fz="sm">Total in rework queue</Text>
                <Text fw={700} fz="xl">{totals.totalRework}</Text>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Card withBorder radius="md">
                <Text c="dimmed" fz="sm">Tasks ever reworked</Text>
                <Text fw={700} fz="xl">{totals.totalReworkedHistorical}</Text>
              </Card>
            </Grid.Col>

          </Grid>

          <Card withBorder radius="md" mt="md" p="md" style={{ height: 360 }}>
            <Text fw={600} mb="xs">Tasks completed by employee</Text>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byEmployee} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="employee" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="completed" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}


/** ---------------------- Main App ---------------------- */
const baseTheme = createTheme({
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"",
  headings: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"",
  },
  components: {
    Modal: {
      defaultProps: {
        withinPortal: true,
        zIndex: 10000,
        transitionProps: { duration: 0 },
        overlayProps: { opacity: 0.25, blur: 2 },
      },
    },
  },
});

function AppInner() {
  const [companyId, setCompanyId] = useState(null);

  useEffect(() => {
    (async () => {
      const cid = await getMyCompanyId();
      setCompanyId(cid);
    })();
  }, []);

  const [mode, setMode] = useState("employee");
  const [activeLocationId, setActiveLocationId] = useState("");
  const [locations, setLocations] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState("");
  const [employees, setEmployees] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [positionFilter, setPositionFilter] = useState("");
  const [company, setCompany] = useState({ id: "", name: "", brandColor: "#0ea5e9", logo: null, timezone: "UTC" });
  const [checklists, setChecklists] = useState({ timeBlocks: [], templates: [], overrides: [] });
  const ModeTabsText = [
    { value: "employee", label: "Employee", icon: <IconUser size={14} /> },
    { value: "manager", label: "Manager", icon: <IconShieldHalf size={14} /> },
    { value: "admin", label: "Admin", icon: <IconLayoutGrid size={14} /> },
  ];
  const ModeTabsIcons = ModeTabsText.map(({ value, icon }) => ({ value, label: icon }));

  // GET Company from DB
  const loadCompany = useCallback(async () => {
    // [COMPANY_SCOPE]
    const c = await getCompany(companyId);
    setCompany({
      id: c.id, name: c.name ?? "",
      brandColor: c.brand_color ?? "#0ea5e9",
      logo: c.logo ?? null,
      timezone: c.timezone ?? "UTC",
    });
  }, [companyId]);

  // load once on mount
  const refreshHeaderData = useCallback(async () => {
    // [COMPANY_SCOPE]
    const [users, locs] = await Promise.all([fetchUsers(companyId), fetchLocations(companyId)]);
    setEmployees(users);
    setLocations(locs);
    setCurrentEmployee((cur) => users.find(u => String(u.id) === String(cur)) ? cur : (users[0] ? String(users[0].id) : ""));
    setActiveLocationId((cur) => locs.find(l => String(l.id) === String(cur)) ? cur : (locs[0] ? String(locs[0].id) : ""));
  }, [companyId]);

  const refreshCompanySettings = loadCompany;

  // initial load
  useEffect(() => { refreshHeaderData(); loadCompany(); }, [refreshHeaderData, loadCompany]);

  // live updates when Admin creates/edits/deletes
  // realtime for header lists (scoped)
  useEffect(() => {
    // [COMPANY_SCOPE]
    if (!companyId) return;
    const ch = supabase
      .channel(`header-sync:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "location", filter: `company_id=eq.${companyId}` }, refreshHeaderData)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_user", filter: `company_id=eq.${companyId}` }, refreshHeaderData)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "company", filter: `id=eq.${companyId}` }, loadCompany)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, refreshHeaderData, loadCompany]);

  // checklists data (time blocks + templates)
  const loadChecklists = useCallback(async () => {
    if (!companyId) return;
    const [tbs, tpls] = await Promise.all([
      listTimeBlocks(companyId),               // make sure your query is scoped
      listTasklistTemplates(companyId)         // and returns tasks inside
    ]);
    setChecklists({ timeBlocks: tbs, templates: tpls, overrides: [] });
  }, [companyId]);

  useEffect(() => { loadChecklists(); }, [loadChecklists]);

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`checklists-sync:${companyId}`) // [COMPANY_SCOPE]
      .on("postgres_changes", { event: "*", schema: "public", table: "time_block", filter: `company_id=eq.${companyId}` }, loadChecklists)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasklist_template", filter: `company_id=eq.${companyId}` }, loadChecklists)
      // If task rows don’t have company_id, add a trigger/column or skip this filter.
      .on("postgres_changes", {
        event: "*", schema: "public", table: "tasklist_task",
        filter: `company_id=eq.${companyId}`
      }, loadChecklists)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, loadChecklists]);

  // Sets the brand color to whatever the DB has it as
  useEffect(() => {
    document.documentElement.style.setProperty("--brand", company.brandColor || "#0ea5e9");
  }, [company.brandColor]);

  // Persisted scheme (UI preference)
  const [scheme, setScheme] = useLocalStorage({
    key: "theme",
    defaultValue: "light",
  });

  // Keep activeLocation valid when Admin edits locations
  useEffect(() => {
    if (!locations.find((l) => String(l.id) === String(activeLocationId))) {
      setActiveLocationId(locations[0]?.id ? String(locations[0].id) : "");
    }
  }, [locations, activeLocationId]);

  // Keep currentEmployee valid when Admin edits Users
  useEffect(() => {
    if (!employees.find((u) => String(u.id) === String(currentEmployee))) {
      setCurrentEmployee(employees[0]?.id ? String(employees[0].id) : "");
    }
  }, [employees, currentEmployee]);
  // Get today's date in the given timezone
  function todayISOInTz(tz) {
    // 'en-CA' -> 'YYYY-MM-DD'
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }


  const [todayTz, setTodayTz] = useState(() => todayISOInTz(company.timezone || 'UTC'));

  useEffect(() => {
    // re-evaluate immediately when timezone changes
    setTodayTz(todayISOInTz(company.timezone || 'UTC'));

    // tick every minute to catch midnight rollover in that tz
    const id = setInterval(() => {
      const d = todayISOInTz(company.timezone || 'UTC');
      setTodayTz(prev => (prev === d ? prev : d));
    }, 60_000);

    return () => clearInterval(id);
  }, [company.timezone]);

  // Today’s tasklists (from admin templates + ad-hoc)
  const tasklistsToday = useMemo(() => {
    const today = todayISOInTz(company.timezone || 'UTC');
    const all = resolveTasklistsForDayFromLists(checklists, activeLocationId, today, company.timezone);
    if (!positionFilter) return all;
    // Filter templates by positions
    const pf = String(positionFilter).trim();
    return all.filter((tl) => {
      // find template meta to check positions
      const tpl = (checklists.templates || []).find((t) => t.id === tl.id);
      const positions = Array.isArray(tpl?.positions) ? tpl.positions : [];
      if (!pf) return true;
      // match if template has position equal to selection
      return positions.map(String).includes(pf);
    });
  }, [checklists, activeLocationId, company.timezone, positionFilter]);

  useEffect(() => {
    if (!company.id || !activeLocationId || tasklistsToday.length === 0) return;

    let cancelled = false;

    (async () => {
      const dateISO = todayISOInTz(company.timezone || 'UTC');

      // fetch all current tasklists’ server state in parallel
      const results = await Promise.all(
        tasklistsToday.map(tl =>
          fetchSubmissionAndTasks({
            supabase,
            companyId: company.id,
            tasklistId: tl.id,
            locationId: tl.locationId,
            dateISO
          }).then(r => ({ tl, ...r }))
        )
      );

      if (cancelled) return;

      // Build a fresh working map from server rows, falling back to defaults
      const nextWorking = {};
      for (const { tl, tasks } of results) {
        const byId = new Map(tasks.map(r => [r.task_id, r]));
        nextWorking[tl.id] = tl.tasks.map(t => {
          const row = byId.get(t.id);
          return row
            ? {
              taskId: t.id,
              status: row.status,                         // 'Complete' | 'Incomplete'
              reviewStatus: row.review_status,            // 'Pending' | 'Approved' | 'Rework'
              na: !!row.na,
              // map value text back to UI type
              value: t.inputType === 'number'
                ? (row.value !== null && row.value !== '' ? Number(row.value) : null)
                : t.inputType === 'text'
                  ? (row.value ?? '')
                  : row.value,
              note: row.note ?? '',
              photos: Array.isArray(row.photos) ? row.photos : [],
            }
            : {
              taskId: t.id,
              status: 'Incomplete',
              reviewStatus: 'Pending',
              na: false,
              value: null,
              note: '',
              photos: [],
            };
        });
      }

      setWorking(nextWorking);
    })();

    return () => { cancelled = true; };
  }, [supabase, company.id, company.timezone, tasklistsToday]);

  function getTaskMetaToday(tasklistId, taskId) {
    const tl = tasklistsToday.find((x) => x.id === tasklistId);
    return tl?.tasks.find((t) => t.id === taskId) || { title: taskId, inputType: "checkbox" };
  }

  function getTaskMetaForManagers(tasklistId, taskId) {
    // 1) today's resolved tasklists (depends on activeLocation/time)
    const tlToday = tasklistsToday.find(x => x.id === tasklistId);
    const metaToday = tlToday?.tasks?.find(t => t.id === taskId);
    if (metaToday) return metaToday;

    // 2) any template in company (independent of location/recurrence)
    const tlAny = (checklists.templates || []).find(x => x.id === tasklistId);
    const metaAny = tlAny?.tasks?.find(t => t.id === taskId);
    if (metaAny) return metaAny;

    // 3) fallback
    return { id: taskId, title: taskId, inputType: "checkbox" };
  }

  // Working state (per tasklist)
  const [working, setWorking] = useState(() =>
    tasklistsToday.reduce((acc, tl) => {
      acc[tl.id] = tl.tasks.map((t) => ({
        taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false, reviewStatus: "Pending",
      }));
      return acc;
    }, {})
  );
  const [submissions, setSubmissions] = useState([]);
  const [pinModal, setPinModal] = useState({ open: false, onConfirm: null });

  useEffect(() => {
    setWorking((prev) => {
      const next = { ...prev };

      tasklistsToday.forEach((tl) => {
        const existing = next[tl.id] ?? [];
        const byId = new Map(existing.map((s) => [s.taskId, s]));

        // ensure there's a state row for every current task
        const merged = tl.tasks.map((t) =>
          byId.get(t.id) ?? {
            taskId: t.id,
            status: "Incomplete",
            value: null,
            note: "",
            photos: [],
            na: false,
            reviewStatus: "Pending",
          }
        );

        next[tl.id] = merged;
      });

      // drop tasklists that no longer exist today
      Object.keys(next).forEach((k) => {
        if (!tasklistsToday.find((tl) => tl.id === k)) delete next[k];
      });

      return next;
    });
  }, [tasklistsToday]);

  // Manager submissions filtered by position (to reflect the same filter globally)
  const submissionsFilteredByPosition = useMemo(() => {
    if (!positionFilter) return submissions;
    const pf = String(positionFilter).trim();
    const byId = new Map((checklists.templates || []).map(t => [t.id, t]));
    return submissions.filter((s) => {
      const tpl = byId.get(s.tasklistId);
      const positions = Array.isArray(tpl?.positions) ? tpl.positions.map(String) : [];
      return positions.includes(pf);
    });
  }, [submissions, checklists.templates, positionFilter]);

  function updateTaskState(tlId, taskId, patch) {
    setWorking((prev) => {
      const next = { ...prev };
      next[tlId] = next[tlId].map((ti) => (ti.taskId === taskId ? { ...ti, ...(typeof patch === "function" ? patch(ti) : patch) } : ti));
      return next;
    });
  }
  const handleComplete = async (tasklist, task) => {
    const st = working?.[tasklist.id]?.find((s) => s.taskId === task.id) ?? {};
    if (!canTaskBeCompleted(task, st)) {
      alert('Finish required inputs first (photo/note/number in range).');
      return;
    }

    setPinModal({
      open: true,
      onConfirm: async (pin) => {
        try {
          // 1) Validate PIN *per company* every time
          const user = await validatePin({ supabase, companyId: company.id, pin });
          if (!user) { alert('Wrong PIN'); return; }

          // 2) Find/create submission for today
          const dateISO = todayISOInTz(company.timezone || 'UTC');
          const submissionId = await findOrCreateSubmission({
            supabase,
            companyId: company.id,
            tasklistId: tasklist.id,
            locationId: tasklist.locationId,
            dateISO,
          });

          // 3) Map input to text (checkbox/number/text)
          const valueText =
            task.inputType === 'number' ? String(st.value ?? '')
              : task.inputType === 'text' ? String(st.note ?? '')
                : 'true';

          // 4) Upsert and stamp submitted_by = PIN user.id (UUID)
          await upsertSubmissionTask({
            supabase,
            submissionId,
            taskId: task.id,
            payload: {
              status: 'Complete',
              review_status: 'Pending',
              na: !!st.na,
              value: valueText || null,
              note: st.note ?? null,
              photos: Array.isArray(st.photos) ? st.photos : [],
              submitted_by: user.id,       // <<<<<<<<<< IMPORTANT
            },
          });

          // (optional) also stamp the parent submission with the same user if you add a matching column
          await supabase.from('submission')
            .update({ submitted_by: user.id })
            .eq('id', submissionId)
            .eq('company_id', company.id);

          // keep the rest of your refresh/optimistic UI as-is ...
          try {
            const { tasks } = await fetchSubmissionAndTasks({
              supabase,
              companyId: company.id,
              tasklistId: tasklist.id,
              locationId: tasklist.locationId,
              dateISO
            });
            const byId = new Map(tasks.map(r => [r.task_id, r]));
            setWorking(prev => ({
              ...prev,
              [tasklist.id]: tasklist.tasks.map(t => {
                const row = byId.get(t.id);
                return row ? {
                  taskId: t.id,
                  status: row.status,
                  reviewStatus: row.review_status,
                  na: !!row.na,
                  value: task.inputType === 'number'
                    ? (row.value !== null && row.value !== '' ? Number(row.value) : null)
                    : task.inputType === 'text'
                      ? (row.value ?? '')
                      : row.value,
                  note: row.note ?? '',
                  photos: Array.isArray(row.photos) ? row.photos : [],
                } : (prev[tasklist.id]?.find(x => x.taskId === t.id) ?? {
                  taskId: t.id, status: 'Incomplete', reviewStatus: 'Pending', na: false, value: null, note: '', photos: []
                });
              })
            }));
          } catch { }

          setWorking(prev => ({
            ...prev,
            [tasklist.id]: (prev[tasklist.id] ?? []).map(ti =>
              ti.taskId === task.id ? { ...ti, status: 'Complete', reviewStatus: 'Pending' } : ti
            ),
          }));
        } catch (e) {
          console.error(e);
          alert(e.message || 'Failed to complete task');
        } finally {
          setPinModal({ open: false, onConfirm: null });
        }
      },
    });
  };

  const handleUpload = async (tasklist, task, file) => {
    try {
      const path = await uploadEvidence({
        supabase,
        bucket: 'evidence',
        companyId: company.id,
        tasklistId: tasklist.id,
        taskId: task.id,
        file
      });

      const dateISO = todayISOInTz(company.timezone || 'UTC');
      const submissionId = await findOrCreateSubmission({
        supabase, companyId: company.id, tasklistId: tasklist.id, locationId: tasklist.locationId, dateISO
      });

      // Read current server photos for this task (optional; or trust client state)
      const { data: row } = await supabase
        .from('submission_task')
        .select('status, review_status, na, value, note, photos')
        .eq('submission_id', submissionId)
        .eq('task_id', task.id)
        .maybeSingle();
      const serverPhotos = Array.isArray(row?.photos) ? row.photos : [];

      await upsertSubmissionTask({
        supabase,
        submissionId,
        taskId: task.id,
        payload: {
          status: row ? row.status : 'Incomplete',
          review_status: row ? row.review_status : 'Pending',
          photos: [...serverPhotos, path],
          na: row ? row.na : false,
          value: row?.value ?? null,
          note: row?.note ?? null,
        },
      });

      // also mirror to UI
      setWorking(prev => ({
        ...prev,
        [tasklist.id]: (prev[tasklist.id] ?? []).map(ti =>
          ti.taskId === task.id ? { ...ti, photos: [...(ti.photos || []), path] } : ti
        )
      }));
    } catch (e) {
      console.error(e);
      alert('Failed to upload photo');
    }
  };


  function canSubmitTasklist(tl) {
    const states = working[tl.id] ?? [];
    for (const t of tl.tasks) {
      const st = states.find((s) => s.taskId === t.id) || {};
      const ok = (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
      if (!ok) return false;
    }
    return true;
  }


  function signoff(tl) {
    if (!canSubmitTasklist(tl)) {
      alert("Please complete all required tasks first.");
      return;
    }
    setPinModal({
      open: true,
      onConfirm: (pin) => {
        const payload = (working[tl.id] ?? []).map((t) => ({ ...t, reviewStatus: "Pending" }));
        const submission = {
          id: `ci_${Date.now()}`,
          tasklistId: tl.id,
          tasklistName: tl.name,
          locationId: tl.locationId,
          date: todayISO(),
          status: "Pending",
          signedBy: `PIN-${pin}`,
          submittedBy: currentEmployee,
          signedAt: new Date().toISOString(),
          tasks: payload,
        };
        setSubmissions((prev) => [submission, ...prev]);
        setWorking((prev) => ({
          ...prev,
          [tl.id]: (prev[tl.id] ?? []).map((t) => ({ ...t, reviewStatus: "Pending" })),
        }));
        setPinModal({ open: false, onConfirm: null });
        alert("Submitted for manager review.");
      },
    });
  }

  // before the return, right after hooks:

  return (
    <MantineProvider theme={baseTheme} forceColorScheme={scheme}>
      <AppShell
        header={{ height: filtersOpen ? 156 : 100 }}   // expand when filters open
        padding="md"
        withBorder={false}
        styles={{ main: { minHeight: "100dvh", background: "var(--mantine-color-body)" } }}
      >
        <AppShell.Header style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          {/** Mobile/Tablet Drawer state */}
          {(() => {
            const [opened, { open, close, toggle }] = useDisclosure(false);
            return (
              <>
                {/* Top bar */}
                <Group h={56} px="sm" justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
                  {/* Left: brand */}
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Burger opened={opened} onClick={toggle} aria-label="Open menu" hiddenFrom="sm" />
                    {company.logo ? (
                      <img src={company.logo} alt="Logo" style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: company.brandColor }} />
                    )}
                    {/* Hide long name on phones, show on ≥sm */}
                    <Text fw={700} truncate visibleFrom="sm">{company.name}</Text>
                  </Group>

                  {/* Right: compact controls */}
                  <Group gap="xs" wrap="nowrap">
                    {/* Mode tabs: icons on mobile, text on ≥md */}
                    <SegmentedControl
                      value={mode}
                      onChange={setMode}
                      data={ModeTabsIcons}
                      hiddenFrom="sm"
                    />
                    <SegmentedControl
                      value={mode}
                      onChange={setMode}
                      data={ModeTabsText}
                      visibleFrom="sm"
                      styles={{ root: { maxWidth: 360 } }}
                    />

                    {/* Employee + Location quick buttons (open drawer on mobile) */}
                    <ActionIcon variant="default" title="Employee / Location" onClick={open} hiddenFrom="sm">
                      <IconUser size={16} />
                    </ActionIcon>
                    <ActionIcon variant="default" title="Filters" onClick={() => setFiltersOpen((v) => !v)}>
                      <IconFilter size={16} />
                    </ActionIcon>
                    <ActionIcon variant="default" title="Theme" onClick={() => setScheme(scheme === "dark" ? "light" : "dark")} hiddenFrom="sm">
                      {scheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
                    </ActionIcon>

                    {/* Full controls on ≥sm */}
                    <Group gap="xs" visibleFrom="sm" wrap="nowrap">
                      <Select
                        value={currentEmployee}
                        onChange={setCurrentEmployee}
                        data={employees.map((l) => ({ value: String(l.id), label: l.display_name }))}
                        w={200}
                        leftSection={<IconUser size={14} />}
                        comboboxProps={{ withinPortal: true }}
                        placeholder="Employee"
                        searchable
                      />
                      <Select
                        value={activeLocationId}
                        onChange={setActiveLocationId}
                        data={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                        w={180}
                        leftSection={<IconMapPin size={14} />}
                        comboboxProps={{ withinPortal: true }}
                        placeholder="Location"
                        searchable
                      />
                      <BugReport companyId={companyId} employeeId={currentEmployee} />
                      <Button
                        onClick={async () => { await supabase.auth.signOut(); }}
                        leftSection={<IconLogout size={16} />}
                        variant="default"
                      >
                        Logout
                      </Button>
                      <ActionIcon variant="default" title="Filters" onClick={() => setFiltersOpen((v) => !v)}>
                        <IconFilter size={16} />
                      </ActionIcon>
                      <ThemeToggle scheme={scheme} setScheme={setScheme} />
                    </Group>
                  </Group>
                </Group>

                {/* Drawer for mobile controls */}
                <Drawer opened={opened} onClose={close} title={company.name || "Menu"} padding="md" size="100%" hiddenFrom="sm">
                  <Stack gap="md">
                    <SegmentedControl value={mode} onChange={setMode} data={ModeTabsText} />
                    <Divider label="Context" />
                    <Select
                      label="Employee"
                      value={currentEmployee}
                      onChange={setCurrentEmployee}
                      data={employees.map((l) => ({ value: String(l.id), label: l.display_name }))}
                      leftSection={<IconUser size={14} />}
                      searchable
                      comboboxProps={{ withinPortal: true }}
                    />
                    <Select
                      label="Location"
                      value={activeLocationId}
                      onChange={setActiveLocationId}
                      data={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                      leftSection={<IconMapPin size={14} />}
                      searchable
                      comboboxProps={{ withinPortal: true }}
                    />
                    <Divider />
                    <Group justify="space-between">
                      <BugReport companyId={companyId} employeeId={currentEmployee} />
                      <Group>
                        <ActionIcon
                          variant="default"
                          onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}
                          title="Toggle theme"
                        >
                          {scheme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
                        </ActionIcon>
                        <Button leftSection={<IconLogout size={16} />} variant="light"
                          onClick={async () => { await supabase.auth.signOut(); }}>
                          Logout
                        </Button>
                      </Group>
                    </Group>
                  </Stack>
                </Drawer>
              </>
            );
          })()}
          {filtersOpen && (
            <div style={{ borderTop: "1px solid var(--mantine-color-gray-3)", background: "var(--mantine-color-body)" }}>
              <Container size="xl">
                <Group py="sm" gap="sm" wrap="wrap" justify="space-between">
                  <Group gap="sm" wrap="wrap">
                    <Select
                      label="Position"
                      placeholder="All positions"
                      value={positionFilter}
                      onChange={(v) => setPositionFilter(v || "")}
                      data={Array.from(new Set((checklists.templates || []).flatMap(t => Array.isArray(t.positions) ? t.positions.map(String) : [])))
                        .filter(Boolean)
                        .map((p) => ({ value: p, label: p }))}
                      clearable
                      searchable
                      comboboxProps={{ withinPortal: true }}
                      maw={260}
                    />
                  </Group>
                  <Group gap="xs">
                    <Button variant="light" onClick={() => setPositionFilter("")}>Clear</Button>
                  </Group>
                </Group>
              </Container>
            </div>
          )}
        </AppShell.Header>


        

        <AppShell.Main>
          {!companyId ? (
            <Center mih="60dvh"><Loader /></Center>
          ) : (
            <Container size="xl">
              {mode === "employee" && (
                <EmployeeView
                  tasklists={tasklistsToday}
                  checklists={checklists}
                  timezone={company.timezone}
                  working={working}
                  updateTaskState={updateTaskState}
                  handleComplete={handleComplete}
                  handleUpload={handleUpload}
                  signoff={signoff}
                  submissions={submissions}
                  setSubmissions={setSubmissions}
                  setWorking={setWorking}
                  company={company}
                />
              )}
              {mode === "manager" && (
                <ManagerView
                  submissions={submissionsFilteredByPosition}
                  company={company}
                  checklists={checklists}
                  locations={locations}
                  setSubmissions={setSubmissions}
                  setWorking={setWorking}
                  getTaskMeta={getTaskMetaForManagers}
                  employees={employees}
                />
              )}

              {mode === "admin" && (
                <div style={{ paddingInline: "1px", paddingTop: 0, paddingBottom: "16px" }}>
                  <AdminView
                    companyId={company.id}
                    tasklists={tasklistsToday}
                    onReloadChecklists={loadChecklists}
                    submissions={submissions}
                    onBrandColorChange={() => { }}
                    locations={locations}
                    refreshHeaderData={refreshHeaderData}
                    refreshCompanySettings={refreshCompanySettings}
                    users={employees}
                  />
                </div>
              )}

            </Container>
          )}
        </AppShell.Main>

        <PinDialog opened={pinModal.open} onClose={() => setPinModal({ open: false, onConfirm: null })} onConfirm={pinModal.onConfirm} />
      </AppShell>
    </MantineProvider>
  );
}


export default function App() {
  // Fully in the app
  return (
    <MantineProvider>
      <AppInner />
    </MantineProvider>
  );
}
