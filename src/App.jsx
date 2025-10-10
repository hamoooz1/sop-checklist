import React, { useMemo, useState, useEffect, useCallback } from "react";
import AdminView from "./AdminView";
import {
  MantineProvider,
  createTheme,
  AppShell,
  Container,
  Group,
  Button,
  Select,
  Card,
  Text,
  Badge,
  Table,
  Grid,
  Stack,
  NumberInput,
  TextInput,
  Modal,
  ActionIcon,
  ScrollArea,
  FileButton,
  Switch,
  SegmentedControl,
  rem,
  Tabs,
  Center,
  Loader
} from "@mantine/core";

import { supabase } from "./lib/supabase.js";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

import { useLocalStorage } from "@mantine/hooks";
import { IconSun, IconMoon, IconPhoto, IconCheck, IconUpload } from "@tabler/icons-react";
import { getMyCompanyId } from "./lib/company"; // [COMPANY_SCOPE]
import fetchUsers, { fetchLocations, getCompany, listTimeBlocks, listTasklistTemplates } from "./queries.js";
import BugReport from "./components/BugReport.jsx";
import { IconBug } from "@tabler/icons-react";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** ---------------------- Utils ---------------------- */

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
function getTaskMeta(tasklistId, taskId) {
  const tl = getTasklistById(tasklistId);
  return tl?.tasks.find((x) => x.id === taskId) || { title: taskId, inputType: "checkbox" };
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


/**
 * settings: full settings from context
 * locationId: active location
 * dateISO: "YYYY-MM-DD"
 * returns array of tasklists for that date/location
 */
function resolveTasklistsForDay(settings, locationId, dateISO) {
  const cl = settings.checklists || { timeBlocks: [], templates: [], overrides: [] };
  const tz = settings.company?.timezone || "UTC";
  const dow = weekdayIndexFromISO(dateISO, tz);

  const tMap = Object.fromEntries((cl.timeBlocks || []).map(tb => [tb.id, tb]));

  const templates = (cl.templates || []).filter(tpl =>
    (tpl.active !== false) &&
    tpl.locationId === locationId &&
    Array.isArray(tpl.recurrence) &&
    tpl.recurrence.includes(dow)
  );

  const overrides = (cl.overrides || []).filter(ovr =>
    ovr.locationId === locationId &&
    ovr.date === dateISO
  );

  const byTB = {};
  for (const ovr of overrides) {
    if (!byTB[ovr.timeBlockId]) byTB[ovr.timeBlockId] = [];
    byTB[ovr.timeBlockId].push(...(ovr.tasks || []));
  }

  const tasklists = templates.map((tpl) => {
    const extra = byTB[tpl.timeBlockId] || [];
    const mergedTasks = [...(tpl.tasks || []), ...extra].map(t => ({
      id: t.id ?? `t_${Math.random().toString(36).slice(2, 8)}`,
      title: t.title || "Task",
      category: t.category || "",
      inputType: t.inputType || "checkbox",
      min: typeof t.min === "number" ? t.min : null,
      max: typeof t.max === "number" ? t.max : null,
      photoRequired: !!t.photoRequired,
      noteRequired: !!t.noteRequired,
      allowNA: t.allowNA !== false,
      priority: typeof t.priority === "number" ? t.priority : 3
    }));

    return {
      id: tpl.id,
      locationId: tpl.locationId,
      name: tpl.name,
      timeBlockId: tpl.timeBlockId,
      recurrence: tpl.recurrence || [],
      requiresApproval: tpl.requiresApproval !== false,    // default true
      signoffMethod: tpl.signoffMethod || "PIN",
      tasks: mergedTasks
    };
  });

  // Nice sorting by time block start time if available
  tasklists.sort((a, b) => {
    const A = tMap[a.timeBlockId]?.start || "00:00";
    const B = tMap[b.timeBlockId]?.start || "00:00";
    return A.localeCompare(B);
  });

  return tasklists;
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
  const [pin, setPin] = useState("");
  return (
    <Modal zIndex={1000} opened={opened} onClose={onClose} title="Enter PIN" centered withinPortal transitionProps={{ duration: 0 }} overlayProps={{ opacity: 0.25, blur: 2 }}>
      <Stack gap="sm">
        <TextInput type="password" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={() => pin && onConfirm && onConfirm(pin)}>Confirm</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** ---------------------- Evidence ---------------------- */
function EvidenceRow({ state }) {
  if (!state) return null;
  return (
    <Group gap="xs" mt="xs" wrap="wrap">
      {(state.photos || []).map((p, i) => (
        <Badge key={i} variant="light" leftSection={<IconPhoto size={14} />}>{p}</Badge>
      ))}
      {state.note ? <Badge variant="light">Note: {state.note}</Badge> : null}
      {state.value !== null && state.value !== undefined ? <Badge variant="light">Value: {state.value}</Badge> : null}
      {state.na ? <Badge variant="light" color="gray">N/A</Badge> : null}
    </Group>
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
  checklists
}) {
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

        return (
          <Card key={tl.id} withBorder radius="lg" shadow="sm">
            <Group justify="space-between" align="center">
              <div>
                <Text fw={600}>{tl.name}</Text>
                <Text c="dimmed" fz="sm">
                  {getTimeBlockLabelFromLists(checklists.timeBlocks, tl.timeBlockId)}
                </Text>
                <Badge mt={6} variant="light">
                  Progress: {done}/{total} ({pct(done, total)}%)
                </Badge>
              </div>
              <Button onClick={() => signoff(tl)} disabled={!canSubmit}>Sign & Submit</Button>
            </Group>

            <Stack gap="sm" mt="md">
              {tl.tasks.map((task) => {
                const state = states.find((s) => s.taskId === task.id);
                const isComplete = state.status === "Complete";
                const canComplete = canTaskBeCompleted(task, state);
                return (
                  <Card
                    key={task.id}
                    withBorder
                    radius="md"
                    style={{
                      borderColor: isComplete ? "var(--mantine-color-green-6)" : undefined,
                      background: isComplete ? "color-mix(in oklab, var(--mantine-color-green-6) 9%, var(--mantine-color-body))" : undefined,
                    }}
                  >
                    <Grid align="center">
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <Group gap="sm">
                          <Badge
                            radius="xl"
                            variant="outline"
                            color={isComplete ? "green" : "gray"}
                            leftSection={isComplete ? <IconCheck size={14} /> : null}
                          >
                            {isComplete ? "Completed" : "Task"}
                          </Badge>
                          <div>
                            <Text fw={600} c={isComplete ? "green.9" : undefined}>{task.title}</Text>
                            <Text c={isComplete ? "green.9" : "dimmed"} fz="sm">
                              {task.category} • {task.inputType}
                              {task.photoRequired ? " • Photo required" : ""}
                              {task.noteRequired ? " • Note required" : ""}
                            </Text>
                            {state.reviewStatus && (
                              <Badge
                                mt={6}
                                variant="outline"
                                color={
                                  state.reviewStatus === "Approved"
                                    ? "green"
                                    : state.reviewStatus === "Rework"
                                      ? "yellow"
                                      : "gray"
                                }
                              >
                                {state.reviewStatus}
                              </Badge>
                            )}
                          </div>
                        </Group>
                      </Grid.Col>

                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <Group gap="xs" wrap="wrap" justify="flex-end">
                          {task.inputType === "number" && (
                            <NumberInput
                              placeholder={`${task.min ?? ""}-${task.max ?? ""}`}
                              value={state.value ?? ""}
                              onChange={(v) => updateTaskState(tl.id, task.id, { value: Number(v) })}
                              disabled={isComplete}
                              style={{ minWidth: rem(92) }}
                            />
                          )}

                          <Button
                            variant={isComplete ? "outline" : "default"}
                            color={isComplete ? "green" : undefined}
                            onClick={() => handleComplete(tl, task)}
                            disabled={!canComplete || isComplete}
                          >
                            {isComplete ? "Completed ✓" : "Mark Complete"}
                          </Button>

                          <FileButton onChange={(file) => file && handleUpload(tl, task, file)} accept="image/*" disabled={isComplete}>
                            {(props) => (
                              <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
                                Upload Photo
                              </Button>
                            )}
                          </FileButton>

                          <TextInput
                            placeholder="Add note"
                            value={state.note}
                            onChange={(e) => updateTaskState(tl.id, task.id, { note: e.target.value })}
                            disabled={isComplete && !task.noteRequired}
                            style={{ minWidth: rem(180) }}
                          />

                          <Switch
                            checked={!!state.na}
                            onChange={(e) => updateTaskState(tl.id, task.id, { na: e.currentTarget.checked })}
                            disabled={isComplete}
                            label="N/A"
                          />
                        </Group>
                      </Grid.Col>
                    </Grid>

                    <EvidenceRow state={state} />
                  </Card>
                );
              })}
            </Stack>
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



function EmployeeReworkCard({ s, setSubmissions, setWorking, getTaskMeta }) {
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
                        onChange={(file) => file && updateSubmissionTask(s.id, t.taskId, (prev) => ({ photos: [...(prev.photos || []), file.name] }))}
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
  getTaskMeta,
  settings,
  locations
}) {
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
    Array.from(
      new Set(submissions.map((s) => s.submittedBy || s.signedBy || "Unknown"))
    ).map((e) => ({ value: e, label: e }))
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
      const who = s.submittedBy || s.signedBy || "Unknown";
      if (who !== filters.employee) return false;
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
  function applyReview(subId, review, note) {
    setSubmissions((prev) =>
      prev.map((s) => {
        if (s.id !== subId) return s;

        // If nothing selected, treat as "all" (used by Approve ALL button)
        const sel = selection[s.id] || new Set(s.tasks.map(t => t.taskId));

        const tasks = s.tasks.map((t) => {
          if (!sel.has(t.taskId)) return t;

          // Update review status in-place; do NOT create any new task rows
          const base = {
            ...t,
            reviewStatus: review,
            // stamp/append a rework reason (keep last for quick view, keep history for audit)
            reviewNote: review === "Rework" ? (note || t.reviewNote || "") : t.reviewNote,
            reworkHistory: Array.isArray(t.reworkHistory) ? t.reworkHistory : [],
          };

          if (review === "Rework") {
            const count = (t.reworkCount ?? 0) + 1;
            base.reworkCount = count;
            base.wasReworked = true;
            base.reworkHistory = [
              ...base.reworkHistory,
              { at: new Date().toISOString(), note: note || "" }
            ];
            // employee must fix; keep employee status as-is (Complete/Incomplete) until they resubmit
          }

          if (review === "Approved") {
            // final approval – still the SAME task instance
            // (no extra bookkeeping needed here)
          }

          return base;
        });

        // recompute submission holistically
        const hasRework = tasks.some((t) => t.reviewStatus === "Rework");
        const allApproved = tasks.length > 0 && tasks.every((t) => t.reviewStatus === "Approved");
        const status = hasRework ? "Rework" : (allApproved ? "Approved" : "Pending");

        // mirror back into "working" so the employee sees state
        setWorking((prevW) => {
          const list = prevW[s.tasklistId];
          if (!list) return prevW;
          const nextList = list.map((wt) => {
            if (!sel.has(wt.taskId)) return wt;
            if (review === "Approved") return { ...wt, status: "Complete", reviewStatus: "Approved" };
            if (review === "Rework") return { ...wt, status: "Incomplete", reviewStatus: "Rework" };
            return { ...wt, reviewStatus: review };
          });
          return { ...prevW, [s.tasklistId]: nextList };
        });

        return { ...s, tasks, status };
      })
    );

    setSelection((prev) => ({ ...prev, [subId]: new Set() }));
  }


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
                    {s.date} • {locations.find((l) => String(l.id) === String(s.locationId))?.name || s.locationId} • By: {s.submittedBy || s.signedBy}
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
                          <Table.Td><Text fw={600}>{meta?.title || t.taskId}</Text></Table.Td>
                          <Table.Td className="hide-sm">{t.value ?? "-"}</Table.Td>
                          <Table.Td className="hide-sm">{t.note || "-"}</Table.Td>
                          <Table.Td className="hide-sm">
                            {(t.photos || []).length ? (
                              <Group gap="xs" wrap="wrap">
                                {(t.photos || []).map((p, j) => (
                                  <Badge key={j} variant="light" leftSection={<IconPhoto size={14} />}>{p}</Badge>
                                ))}
                              </Group>
                            ) : "-"}
                          </Table.Td>
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
                <Button variant="default" onClick={() => applyReview(s.id, "Rework")}>Rework Selected</Button>
                <Button onClick={() => applyReview(s.id, "Approved")}>Approve Selected</Button>
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
  const [company, setCompany] = useState({ id: "", name: "", brandColor: "#0ea5e9", logo: null, timezone: "UTC" });
  const [checklists, setChecklists] = useState({ timeBlocks: [], templates: [], overrides: [] });


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

  // Today’s tasklists (from admin templates + ad-hoc)
  const tasklistsToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return resolveTasklistsForDayFromLists(checklists, activeLocationId, today, company.timezone);
  }, [checklists, activeLocationId, company.timezone]);

  function getTaskMetaToday(tasklistId, taskId) {
    const tl = tasklistsToday.find((x) => x.id === tasklistId);
    return tl?.tasks.find((t) => t.id === taskId) || { title: taskId, inputType: "checkbox" };
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

  function updateTaskState(tlId, taskId, patch) {
    setWorking((prev) => {
      const next = { ...prev };
      next[tlId] = next[tlId].map((ti) => (ti.taskId === taskId ? { ...ti, ...(typeof patch === "function" ? patch(ti) : patch) } : ti));
      return next;
    });
  }
  const handleComplete = async (tasklist, task) => {
    const st = working?.[tasklist.id]?.find((s) => s.taskId === task.id) ?? {};
    const taskState = { status: "Complete", value: st.value ?? task.value ?? true };

    if (!canTaskBeCompleted(task, st)) {
      alert("Finish required inputs first (photo/note/number in range).");
      return;
    }
    const { error } = await supabase
      .from("tasklist_task")
      .update(taskState)
      .eq("id", task.id)
      .eq("tasklist_id", tasklist.id);

    if (error) {
      console.error(error);
      alert("Failed to complete task");
    } else {
      setWorking((prev) => ({
        ...prev,
        [tasklist.id]: (prev[tasklist.id] ?? []).map((ti) =>
          ti.taskId === task.id ? { ...ti, status: "Complete" } : ti
        ),
      }));
    }
  };

  const handleUpload = async (tasklist, task, file) => {
    // Upload file to Supabase Storage
    const cid = await getMyCompanyId();

    const { data, error } = await supabase.storage
      .from('evidence')
      .upload(`company/${cid}/task/${tasklist.id}/${task.id}/${Date.now()}_${file.name}`, file);

    if (error) {
      console.error(error);
      alert('Failed to upload file');
      return;
    }

    // Get the file URL
    const { data: pub } = supabase.storage.from("evidence").getPublicUrl(data.path);
    const fileUrl = pub.publicUrl;

    // Update task with the uploaded photo link
    const { error: updateError } = await supabase
      .from('tasks')  // Replace with your actual table name
      .update({ photos: [fileUrl] })
      .eq('id', task.id)
      .eq('tasklist_id', tasklist.id);

    if (updateError) {
      console.error(updateError);
      alert('Failed to update task with file');
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
        header={{ height: 120 }}   // NEW: allow extra height when wrapping
        padding="md"
        withBorder={false}
        styles={{ main: { minHeight: "100dvh", background: "var(--mantine-color-body)" } }}
      >
        <AppShell.Header style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          <Group h={64} px="md" justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
            {/* left */}
            <Group gap="sm">
              {company.logo ? (
                <img
                  src={company.logo}
                  alt="Logo"
                  style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }}
                />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: 8, background: company.brandColor }} />
              )}
              <Text fw={700}>{company.name}</Text>
            </Group>
            {/* right */}
            <Group gap="xs" wrap="wrap">
              <SegmentedControl
                value={mode}
                onChange={setMode}
                data={[
                  { value: "employee", label: "Employee" },
                  { value: "manager", label: "Manager" },
                  { value: "admin", label: "Admin" },
                ]}
              />
              <Select
                value={currentEmployee}
                onChange={(u) => setCurrentEmployee(u)}
                data={employees.map((l) => ({ value: String(l.id), label: l.display_name }))}
                w={220}
                placeholder="Select employee"
              />
              <Select
                value={activeLocationId}
                onChange={(v) => setActiveLocationId(v)}
                data={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                w={200}
              />
              <BugReport companyId={companyId} employeeId={currentEmployee} />
              <Button onClick={async () => {
                await supabase.auth.signOut();
              }}>
                Logout
              </Button>
              <ThemeToggle scheme={scheme} setScheme={setScheme} />
            </Group>
          </Group>
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
                />
              )}
              {mode === "manager" && (
                <ManagerView
                  submissions={submissions}
                  checklists={checklists}
                  locations={locations}
                  setSubmissions={setSubmissions}
                  setWorking={setWorking}
                  getTaskMeta={getTaskMetaToday}
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
