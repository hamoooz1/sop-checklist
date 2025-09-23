import React, { useMemo, useState, useEffect } from "react";
import { useLocations } from "./useLocations";
import { useTasklistsToday } from "./useTasklistsToday";
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
} from "@mantine/core";
import { useMediaQuery, useLocalStorage } from "@mantine/hooks";
import { supabase } from "./lib/supabase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { IconSun, IconMoon, IconPhoto, IconCheck, IconUpload } from "@tabler/icons-react";
import { SettingsProvider, useSettings } from "./settings-store.jsx";

/** ---------------------- Mock Data (UI only) ---------------------- */

const MOCK_TASKLISTS = [
  {
    id: "tl_001",
    locationId: "loc_001",
    name: "Open — FOH",
    timeBlockId: "open",
    recurrence: [0, 1, 2, 3, 4, 5, 6],
    requiresApproval: true,
    signoffMethod: "PIN",
    tasks: [
      { id: "t_1", title: "Sanitize host stand", category: "Cleaning", inputType: "checkbox", photoRequired: true, noteRequired: false, allowNA: true, priority: 2 },
      { id: "t_2", title: "Temp log: walk-in cooler", category: "Food Safety", inputType: "number", min: 32, max: 40, photoRequired: false, noteRequired: true, allowNA: false, priority: 1 },
      { id: "t_3", title: "Stock napkins & menus", category: "Prep", inputType: "checkbox", photoRequired: false, noteRequired: false, allowNA: true, priority: 3 },
    ],
  },
  {
    id: "tl_002",
    locationId: "loc_001",
    name: "Close — BOH",
    timeBlockId: "close",
    recurrence: [0, 1, 2, 3, 4, 5, 6],
    requiresApproval: true,
    signoffMethod: "PIN",
    tasks: [
      { id: "t_4", title: "Deep clean fryers", category: "Cleaning", inputType: "checkbox", photoRequired: true, noteRequired: true, allowNA: false, priority: 1 },
      { id: "t_5", title: "Label/date all prep", category: "Food Safety", inputType: "checkbox", photoRequired: false, noteRequired: true, allowNA: false, priority: 2 },
    ],
  },
];

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
function weekdayIndexFromISO(dateISO, tz) {
  try {
    const parts = dateISO.split("-");
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
    if (tz) {
      const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz });
      const wk = fmt.format(d);
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wk);
    }
    return d.getUTCDay();
  } catch { return new Date().getDay(); }
}
function getTimeBlockLabelFromSettings(settings, id) {
  const blocks = (settings?.checklists?.timeBlocks ?? []);
  const block = blocks.find((b) => b.id === id);
  return block ? `${block.name} (${block.start}–${block.end})` : id;
}
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
  const overrides = (cl.overrides || []).filter(ovr => ovr.locationId === locationId && ovr.date === dateISO);
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
      requiresApproval: tpl.requiresApproval !== false,
      signoffMethod: tpl.signoffMethod || "PIN",
      tasks: mergedTasks,
    };
  });
  tasklists.sort((a, b) => {
    const A = tMap[a.timeBlockId]?.start || "00:00";
    const B = tMap[b.timeBlockId]?.start || "00:00";
    return A.localeCompare(B);
  });
  return tasklists;
}

/** ---------------------- Theme toggle ---------------------- */
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

/**----------------------- Error Handling --------------------- */
function SectionBoundary({ children }) {
  const [err, setErr] = useState(null);
  if (err) {
    return <Card withBorder><Text c="red">Something went wrong: {String(err)}</Text></Card>;
  }
  return (
    <ErrorBoundary onError={setErr}>
      {children}
    </ErrorBoundary>
  );
}

// quick/inline error boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // optional: send to logging service
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card withBorder radius="md">
          <Text fw={700}>Something went wrong in {this.props.label ?? "this section"}.</Text>
          <Text c="dimmed" mt="xs">{String(this.state.error)}</Text>
          <Button mt="sm" onClick={() => this.setState({ hasError: false, error: null })}>
            Retry render
          </Button>
        </Card>
      );
    }
    return this.props.children;
  }
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
  settings,
  uploadEvidenceForTask
}) {
  return (
    <Stack gap="md">
      <Text fw={700} fz="lg">Today</Text>

      {tasklists.map((tl) => {
        const states = working[tl.id] || [];
        const total = tl.tasks.length;

        // SAFE: don't read properties from undefined
        const done = states.filter((t) => t?.status === "Complete" || t?.na).length;

        const canSubmit = tl.tasks.every((t) => {
          const st = states.find((s) => s.taskId === t.id);
          if (!st) return false;
          return (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
        });

        return (
          <Card key={tl.id} withBorder radius="lg" shadow="sm">
            <Group justify="space-between" align="center">
              <div>
                <Text fw={600}>{tl.name}</Text>
                <Text c="dimmed" fz="sm">{getTimeBlockLabelFromSettings(settings, tl.timeBlockId)}</Text>
                <Badge mt={6} variant="light">Progress: {done}/{total} ({pct(done, total)}%)</Badge>
              </div>
              <Button onClick={() => signoff(tl)} disabled={!canSubmit}>Sign & Submit</Button>
            </Group>
            <Stack gap="sm" mt="md">
              {tl.tasks.map((task) => {
                // give the UI a safe fallback so it never explodes
                const state =
                  states.find((s) => s.taskId === task.id) ||
                  { status: "Incomplete", value: null, note: "", photos: [], na: false, reviewStatus: "Pending" };

                const isComplete = state.status === "Complete";
                const canComplete = canTaskBeCompleted(task, state);

                return (
                  <Card key={task.id} withBorder radius="md" style={{
                    borderColor: isComplete ? "var(--mantine-color-green-6)" : undefined,
                    background: isComplete ? "color-mix(in oklab, var(--mantine-color-green-6) 9%, var(--mantine-color-body))" : undefined,
                  }}>
                    <Grid align="center">
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <Group gap="sm">
                          <Badge radius="xl" variant="outline" color={isComplete ? "green" : "gray"}
                            leftSection={isComplete ? <IconCheck size={14} /> : null}>
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
                              <Badge mt={6} variant="outline"
                                color={state.reviewStatus === "Approved" ? "green"
                                  : state.reviewStatus === "Rework" ? "yellow" : "gray"}>
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

                          <FileButton onChange={(file) => file && handleUpload(tl, task, file)}
                            accept="image/*" disabled={isComplete}>
                            {(props) => (
                              <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
                                Upload Photo
                              </Button>
                            )}
                          </FileButton>

                          <TextInput
                            placeholder="Add note"
                            value={state.note ?? ""}
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
                uploadEvidenceForTask={uploadEvidenceForTask}
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

function EmployeeReworkCard({ s, setSubmissions, setWorking, getTaskMeta, uploadEvidenceForTask }) {
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
                            const path = await uploadEvidenceForTask({
                              file,
                              locationId: s.location,
                              tlId: s.tasklistId,
                              taskId: t.taskId,
                            });
                            updateSubmissionTask(s.id, t.taskId, (prev) => ({ photos: [...(prev.photos || []), path] }));
                          } catch (e) {
                            console.error(e);
                            alert(`Upload Failed: ${e.message}`);
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
          onClick={async () => {
            try {
              // Persist each reworked task (value/note/photos/status + review_status='Pending')+       
              for (const t of s.tasks) {

                if (t.reviewStatus !== "Rework") continue;
                const meta = getTaskMeta(s.tasklistId, t.taskId);

                if (!canTaskBeCompleted(meta, t)) continue;

                const patch = {
                  status: t.status,                // 'Complete' or 'Incomplete'
                  na: !!t.na,
                  value: t.value == null ? null : String(t.value),
                  note: t.note || null,
                  photos: t.photos ?? [],
                  review_status: 'Pending',
                };

                const { error } = await supabase
                  .from('submission_task')
                  .update(patch).eq('submission_id', s.id)
                  .eq('task_id', t.taskId);
                if (error) throw error;
              }

              // Update parent submission status on the server
              const { error: rpcErr } = await supabase.rpc('recompute_submission_status', { p_submission_id: s.id });
              if (rpcErr) throw rpcErr;

              // Local mirror (what you already had)
              batchUpdateSubmissionTasks(s.id, (task, meta) => {
                if (task.reviewStatus === "Rework" && task.status === "Complete" && canTaskBeCompleted(meta, task)) {
                  return { reviewStatus: "Pending" };
                }
                return null;
              });
              recomputeSubmissionStatus(s.id);
              alert("Resubmitted fixes for review.");
            } catch (e) {
              console.error(e);
              alert(`Could not resubmit: ${e.message}`);
            }
          }}
        >
          Resubmit for Review
        </Button>
      </Group>
    </Card >
  );
}

/** ---------------------- Manager View ---------------------- */
function ManagerView({
  submissions,
  setSubmissions,
  setWorking,
  getTaskMeta,
  settings,
  locations,

}) {
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    locationId: "",
    employee: "",
    category: "",
    status: "",
  });

  const locationOptions = [{ value: "", label: "All locations" }].concat(
    locations.map((l) => ({ value: l.id, label: l.name }))
  );
  const employeeOptions = [{ value: "", label: "All employees" }].concat(
    Array.from(new Set(submissions.map((s) => s.submittedBy || s.signedBy || "Unknown"))).map((e) => ({ value: e, label: e }))
  );
  const categoryOptions = [{ value: "", label: "All categories" }].concat(
    Array.from(
      new Set(
        submissions.flatMap((s) => s.tasks.map((t) => (getTaskMeta(s.tasklistId, t.taskId)?.category || "").trim()))
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

  // Metrics (client-side read model)
  const totals = filtered.reduce(
    (acc, s) => {
      for (const t of s.tasks) {
        const approved = t.reviewStatus === "Approved";
        const isNA = !!t.na;
        if (approved || isNA) acc.totalTasksCompleted += 1;
        if (t.reviewStatus === "Rework") acc.totalRework += 1;
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
      if (t.wasReworked) row.reworked = (row.reworked || 0) + 1;
    }
  }
  const byEmployee = Array.from(byEmployeeMap.values()).sort((a, b) => b.completed - a.completed);

  // Selection
  const [selection, setSelection] = useState({});
  function toggle(subId, taskId) {
    setSelection((prev) => {
      const cur = new Set(prev[subId] || []);
      cur.has(taskId) ? cur.delete(taskId) : cur.add(taskId);
      return { ...prev, [subId]: cur };
    });
  }

  // Apply review — DB write + local mirror
  async function applyReview(subId, review, note) {
    // selected or all
    const ids = Array.from(selection[subId] || []);
    if (ids.length === 0) {
      const submission = submissions.find((s) => s.id === subId);
      if (submission) ids.push(...submission.tasks.map((t) => t.taskId));
    }

    try {
      // 1) Update submission_task rows
      const patch = review === "Rework"
        ? { review_status: "Rework", review_note: note || null }
        : { review_status: "Approved", review_note: null };

      const { error: upErr } = await supabase
        .from("submission_task")
        .update(patch)
        .in("task_id", ids)
        .eq("submission_id", subId);

      if (upErr) throw upErr;

      // 2) Recompute parent submission.status (requires SQL function from earlier step)
      const { error: rpcErr } = await supabase.rpc("recompute_submission_status", { p_submission_id: subId });
      if (rpcErr) throw rpcErr;

      // 3) Local UI mirror
      setSubmissions((prev) =>
        prev.map((s) => {
          if (s.id !== subId) return s;
          const sel = new Set(ids);
          const tasks = s.tasks.map((t) => {
            if (!sel.has(t.taskId)) return t;
            const base = {
              ...t,
              reviewStatus: review,
              reviewNote: review === "Rework" ? (note || t.reviewNote || "") : null,
              reworkHistory: Array.isArray(t.reworkHistory) ? t.reworkHistory : [],
            };
            if (review === "Rework") {
              const count = (t.reworkCount ?? 0) + 1;
              base.reworkCount = count;
              base.wasReworked = true;
              base.reworkHistory = [
                ...base.reworkHistory,
                { at: new Date().toISOString(), note: note || "" },
              ];
            }
            if (review === "Approved") {
              // keep as same task instance
            }
            return base;
          });
          const hasRework = tasks.some((t) => t.reviewStatus === "Rework");
          const allApproved = tasks.length > 0 && tasks.every((t) => t.reviewStatus === "Approved");
          const status = hasRework ? "Rework" : allApproved ? "Approved" : "Pending";

          // mirror to employee working state (optional)
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
    } catch (e) {
      console.error(e);
      alert(`Could not update review: ${e.message}`);
    }
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
                <TextInput label="From" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput label="To" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label="Location" data={locationOptions} value={filters.locationId} onChange={(v) => setFilters({ ...filters, locationId: v || "" })} comboboxProps={{ withinPortal: true }} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label="Employee" data={employeeOptions} value={filters.employee} onChange={(v) => setFilters({ ...filters, employee: v || "" })} searchable comboboxProps={{ withinPortal: true }} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Select label="Category" data={categoryOptions} value={filters.category} onChange={(v) => setFilters({ ...filters, category: v || "" })} searchable comboboxProps={{ withinPortal: true }} />
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

          {filtered.length === 0 ? <Text c="dimmed" fz="sm">No submissions match your filters.</Text> : null}

          {filtered.map((s) => (
            <Card key={s.id} withBorder radius="lg" shadow="sm" mb="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{s.tasklistName}</Text>
                  <Text c="dimmed" fz="sm">
                    {s.date} • {(locations.find((l) => l.id === s.locationId))
                      ?.name || s.locationId} • By: {s.submittedBy || s.signedBy}
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
  // ---------- Supabase helpers ----------
  const EVIDENCE_BUCKET = "evidence";

  async function uploadEvidenceForTask({ file, locationId, tlId, taskId }) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${locationId || 'loc'}/${tlId}/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    return path; // storage path to save in photos[]
  }

  const companyId = /* optional: settings.company?.id */ undefined;
  const { locations, loading: locLoading } = useLocations(companyId);

  // keep the chosen location around, but ensure it's a real UUID from DB
  const [activeLocationId, setActiveLocationId] = useLocalStorage({
    key: "activeLocationId",
    defaultValue: "",
  });

  useEffect(() => {
    if (!locations.length) return;
    const exists = locations.some(l => l.id === activeLocationId);
    if (!exists) setActiveLocationId(locations[0].id);
  }, [locations, activeLocationId, setActiveLocationId]);

  async function persistSubmissionToDB({ tl, pin, activeLocationId, currentEmployee, working }) {
    const { data: sub, error: subErr } = await supabase
      .from("submission")
      .insert({
        tasklist_id: tl.id,
        location_id: activeLocationId,                 // UUID from DB
        date: new Date().toISOString().slice(0, 10),   // 'YYYY-MM-DD'
        status: "Pending",
        signed_by: `PIN-${pin}`,
        submitted_by: currentEmployee,
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (subErr) throw subErr;

    const rows = (working[tl.id] || []).map((t) => ({
      submission_id: sub.id,
      task_id: t.taskId,
      status: t.status,
      na: !!t.na,
      value: t.value == null ? null : String(t.value),
      note: t.note || null,
      photos: t.photos ?? [],
      review_status: "Pending",
    }));

    const { error: tasksErr } = await supabase.from("submission_task").insert(rows);
    if (tasksErr) throw tasksErr;

    return sub.id;
  }

  const { settings } = useSettings();
  const [currentEmployee, setCurrentEmployee] = useState("Employee A");
  const employeeOptions = ["Employee A", "Employee B", "Employee C", ...settings.users.map((u) => u.email || u.id)];
  const isNarrow = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", settings.company.brandColor || "#0ea5e9");
  }, [settings.company.brandColor]);

  const [scheme, setScheme] = useLocalStorage({ key: "theme", defaultValue: "light" });
  const [mode, setMode] = useState("employee");


  // ADD: DB-driven tasklists for today
  const [tasklistsToday, setTasklistsToday] = useState([]);
  const tz = settings.company?.timezone || "UTC";

  useEffect(() => {
    let isCancelled = false;
    (async () => {
      if (!activeLocationId) { setTasklistsToday([]); return; }

      const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
      // Example query shape — adjust table/columns to yours:
      // tasklist_template (id uuid, location_id uuid, name text, time_block_id text, recurrence int[])
      // tasklist_task (id uuid, tasklist_id uuid, title text, category text, input_type text, min numeric, max numeric, photo_required bool, note_required bool, allow_na bool, priority int)
      const { data, error } = await supabase
        .from("tasklist_template")
        .select(`
        id,
        location_id,
        name,
        time_block_id,
        recurrence,
        requires_approval,
        signoff_method,
        tasks:tasklist_task (
          id,
          title,
          category,
          input_type,
          min,
          max,
          photo_required,
          note_required,
          allow_na,
          priority
        )
      `)
        .eq("location_id", activeLocationId)
        .eq("active", true); // if you have an 'active' flag

      if (error) { console.error(error); if (!isCancelled) setTasklistsToday([]); return; }
      if (isCancelled) return;

      // Filter by weekday (client side) if you store recurrence as int[] 0..6
      const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz })
        .format(new Date(today + "T12:00:00Z")); // noon UTC avoids DST edges
      const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow);

      const lists = (data || [])
        .filter(tpl => Array.isArray(tpl.recurrence) ? tpl.recurrence.includes(idx) : true)
        .map(tpl => ({
          id: tpl.id,
          locationId: tpl.location_id,
          name: tpl.name,
          timeBlockId: tpl.time_block_id,
          recurrence: tpl.recurrence || [],
          requiresApproval: tpl.requires_approval ?? true,
          signoffMethod: tpl.signoff_method || "PIN",
          tasks: (tpl.tasks || []).map(t => ({
            id: t.id,
            title: t.title,
            category: t.category || "",
            inputType: t.input_type || "checkbox",
            min: typeof t.min === "number" ? t.min : null,
            max: typeof t.max === "number" ? t.max : null,
            photoRequired: !!t.photo_required,
            noteRequired: !!t.note_required,
            allowNA: t.allow_na !== false,
            priority: typeof t.priority === "number" ? t.priority : 3,
          })),
        }));

      // Optional: sort by time block (if you have a table 'time_block')
      // Otherwise skip this
      // const { data: blocks } = await supabase.from("time_block").select("id,start");
      // const startMap = Object.fromEntries((blocks||[]).map(b => [b.id, b.start || "00:00"]));
      // lists.sort((a,b) => (startMap[a.timeBlockId]||"00:00").localeCompare(startMap[b.timeBlockId]||"00:00"));

      setTasklistsToday(lists);
    })();
    return () => { isCancelled = true; };
  }, [activeLocationId, tz, settings.company?.timezone]);


  function getTaskMetaToday(tasklistId, taskId) {
    const tl = tasklistsToday.find((x) => x.id === tasklistId);
    return tl?.tasks.find((t) => t.id === taskId) || { title: taskId, inputType: "checkbox" };
  }

  // Seed demo (local only)
  function seedDemoSubmissions({ days = 45, perDay = [0, 3], employees = [] } = {}) {
    const names = employees.length ? employees : ["Employee A", "Employee B", "Employee C"];
    const all = [];
    const today = new Date();
    const baseLists = tasklistsToday.length ? tasklistsToday : [];
    if (!baseLists.length) { alert("No templates/time blocks to seed from."); return; }
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const dayISO = (d) => new Date(d).toISOString().slice(0, 10);

    for (let i = 0; i < days; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const n = randInt(perDay[0], perDay[1]);
      for (let j = 0; j < n; j++) {
        const tl = baseLists[randInt(0, baseLists.length - 1)];
        const tasks = tl.tasks.map(t => {
          const complete = Math.random() > 0.2;
          const reviewStatus = complete ? (Math.random() > 0.15 ? "Approved" : "Rework") : "Pending";
          const base = {
            taskId: t.id,
            status: complete ? "Complete" : "Incomplete",
            na: false,
            photos: [],
            note: (Math.random() > 0.7 ? "Checked" : ""),
            reviewStatus
          };
          base.value = t.inputType === "number"
            ? randInt(typeof t.min === "number" ? t.min : 0, typeof t.max === "number" ? t.max : 10)
            : (complete ? true : null);
          return base;
        });
        const signed = names[randInt(0, names.length - 1)];
        all.push({
          id: `ci_${Date.now()}_${i}_${j}_${Math.random().toString(36).slice(2, 6)}`,
          tasklistId: tl.id,
          tasklistName: tl.name,
          locationId: activeLocationId || tl.locationId,
          date: dayISO(d),
          status: tasks.every(t => t.reviewStatus === "Approved") ? "Approved"
            : tasks.some(t => t.reviewStatus === "Rework") ? "Rework" : "Pending",
          signedBy: `PIN-${randInt(1000, 9999)}`,
          submittedBy: signed,
          signedAt: new Date(d).toISOString(),
          tasks
        });
      }
    }
    setSubmissions(prev => [...all, ...prev]);
    alert(`Seeded ${all.length} submissions over ${days} days.`);
  }

  // Working state is derived strictly from DB tasklists
  const [working, setWorking] = useState({});

  useEffect(() => {
    // Build fresh working state for the loaded tasklists
    const next = {};
    for (const tl of tasklistsToday) {
      next[tl.id] = tl.tasks.map(t => ({
        taskId: t.id,
        status: "Incomplete",
        value: null,
        note: "",
        photos: [],
        na: false,
        reviewStatus: "Pending",
      }));
    }
    setWorking(next);
  }, [tasklistsToday]);

  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!activeLocationId) { setSubmissions([]); return; }
      const today = new Date().toISOString().slice(0, 10);

      // Bring down recent submissions; include tasks
      const { data, error } = await supabase
        .from("submission")
        .select(`
        id,
        tasklist_id,
        location_id,
        date,
        status,
        signed_by,
        submitted_by,
        signed_at,
        tasks:submission_task (
          task_id,
          status,
          na,
          value,
          note,
          photos,
          review_status,
          review_note,
          rework_count
        )
      `)
        .eq("location_id", activeLocationId)
        .gte("date", today)          // tweak your time window
        .order("signed_at", { ascending: false });

      if (error) { console.error(error); if (!cancel) setSubmissions([]); return; }

      // Transform to your UI shape
      const mapped = (data || []).map(s => ({
        id: s.id,
        tasklistId: s.tasklist_id,
        tasklistName: (tasklistsToday.find(tl => tl.id === s.tasklist_id)?.name) || s.tasklist_id,
        locationId: s.location_id,
        date: s.date,
        status: s.status,
        signedBy: s.signed_by,
        submittedBy: s.submitted_by,
        signedAt: s.signed_at,
        tasks: (s.tasks || []).map(t => ({
          taskId: t.task_id,
          status: t.status,
          na: t.na,
          value: (t.value == null ? null : (Number.isNaN(Number(t.value)) ? t.value : Number(t.value))),
          note: t.note || "",
          photos: t.photos || [],
          reviewStatus: t.review_status || "Pending",
          reviewNote: t.review_note || null,
          reworkCount: t.rework_count || 0,
        })),
      }));

      if (!cancel) setSubmissions(mapped);
    })();
    return () => { cancel = true; };
  }, [activeLocationId, tasklistsToday.length]);

  const [pinModal, setPinModal] = useState({ open: false, onConfirm: null });

  useEffect(() => {
    setWorking((prev) => {
      const next = { ...prev };
      tasklistsToday.forEach((tl) => {
        if (!next[tl.id]) {
          next[tl.id] = tl.tasks.map((t) => ({ taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false, reviewStatus: "Pending" }));
        }
      });
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

  function handleComplete(tl, task) {
    const list = working[tl.id] || [];
    const state = list.find((s) => s.taskId === task.id) || {
      status: "Incomplete", value: null, note: "", photos: [], na: false, reviewStatus: "Pending",
    };
    if (!canTaskBeCompleted(task, state)) { alert("Finish required inputs first."); return; }
    updateTaskState(tl.id, task.id, { status: "Complete", value: state.value ?? true });
  }
  



  async function handleUpload(tl, task, file) {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${activeLocationId || "loc"}/${tl.id}/${task.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      updateTaskState(tl.id, task.id, (ti) => ({ photos: [...(ti.photos || []), path] }));
    } catch (e) {
      console.error(e);
      alert(`Upload failed: ${e.message}`);
    }
  }

  function canSubmitTasklist(tl) {
    const states = working[tl.id] || [];
    for (const t of tl.tasks) {
      const st = states.find((s) => s.taskId === t.id);
      if (!st) return false;
      const ok = (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
      if (!ok) return false;
    }
    return true;
  }


  async function signoff(tl) {
    if (!canSubmitTasklist(tl)) { alert("Please complete all required tasks first."); return; }
    setPinModal({
      open: true,
      onConfirm: async (pin) => {
        try {
          const realId = await persistSubmissionToDB({ tl, pin, activeLocationId, currentEmployee, working });
          // optional: re-fetch submissions instead of keeping any local cache
          // trigger reload:
          // setReloadKey(k => k+1) or call the fetch function again
          alert("Submitted for manager review.");
        } catch (err) {
          console.error(err);
          alert(err.message || "Could not submit to the server.");
        } finally {
          setPinModal({ open: false, onConfirm: null });
        }
      },
    });
  }
  

  useEffect(() => {
    settings.__seedDemo = () =>
      seedDemoSubmissions({ days: 45, perDay: [0, 4], employees: ["Employee A", "Employee B", "Employee C", ...settings.users.map(u => u.email || u.id)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, tasklistsToday, activeLocationId]);

  return (
    <MantineProvider theme={baseTheme} forceColorScheme={scheme}>
      <AppShell
        header={{ height: isNarrow ? 120 : 64 }}
        padding="md"
        withBorder={false}
        styles={{ main: { minHeight: "100dvh", background: "var(--mantine-color-body)" } }}
      >
        <AppShell.Header style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          <Group h={64} px="md" justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
            {/* left */}
            <Group gap="sm">
              {settings.company.logo ? (
                <img
                  src={settings.company.logo}
                  alt="Logo"
                  style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }}
                />
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: 8, background: settings.company.brandColor }} />
              )}
              <Text fw={700}>{settings.company.name}</Text>
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
                onChange={setCurrentEmployee}
                data={employeeOptions}
                w={220}
                placeholder="Select employee"
              />

              <Select
                value={activeLocationId}
                onChange={(v) => v && setActiveLocationId(v)}
                data={locations.map((l) => ({ value: l.id, label: l.name }))}
                w={200}
                placeholder={locLoading ? "Loading…" : "Select location"}
                disabled={locLoading || locations.length === 0}
              />
              <ThemeToggle scheme={scheme} setScheme={setScheme} />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          <Container size="xl">
            {mode === "employee" && (
              <ErrorBoundary label="Employee">
                <EmployeeView
                  tasklists={tasklistsToday}
                  working={working}
                  updateTaskState={updateTaskState}
                  handleComplete={handleComplete}
                  handleUpload={handleUpload}
                  signoff={signoff}
                  submissions={submissions}
                  setSubmissions={setSubmissions}
                  setWorking={setWorking}
                  settings={settings}
                  uploadEvidenceForTask={uploadEvidenceForTask}
                />
              </ErrorBoundary>
            )}

            {mode === "manager" && (
              <ErrorBoundary label="Manager">
                <ManagerView
                  submissions={submissions}
                  setSubmissions={setSubmissions}
                  setWorking={setWorking}
                  getTaskMeta={getTaskMetaToday}
                  settings={settings}
                  locations={locations}  // make sure you pass this
                />
              </ErrorBoundary>
            )}

            {mode === "admin" && (
              <ErrorBoundary label="Admin">
                <div style={{ paddingInline: "1px", paddingTop: 0, paddingBottom: "16px" }}>
                  <AdminView tasklists={MOCK_TASKLISTS} submissions={submissions} onBrandColorChange={() => { }} />
                </div>
              </ErrorBoundary>
            )}
          </Container>
        </AppShell.Main>


        <PinDialog opened={pinModal.open} onClose={() => setPinModal({ open: false, onConfirm: null })} onConfirm={pinModal.onConfirm} />
      </AppShell>
    </MantineProvider>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}
