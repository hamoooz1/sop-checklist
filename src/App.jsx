import '@mantine/core/styles.css';
import React, { useMemo, useState, useEffect } from "react";
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
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconSun, IconMoon, IconPhoto, IconCheck, IconUpload } from "@tabler/icons-react";

/** ---------------------- Mock Data ---------------------- */
const MOCK_COMPANY = { id: "co_001", name: "Saba Foods", brand: { primary: "#0ea5e9" } };
const MOCK_LOCATIONS = [
  { id: "loc_001", companyId: "co_001", name: "Main St Diner", timezone: "America/Los_Angeles" },
  { id: "loc_002", companyId: "co_001", name: "Granville", timezone: "America/Los_Angeles" },
];
const TIME_BLOCKS = [
  { id: "open", name: "Open", start: "05:00", end: "10:00" },
  { id: "mid", name: "Mid-Shift", start: "11:00", end: "16:00" },
  { id: "close", name: "Close", start: "20:00", end: "23:59" },
];
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
function getTimeBlockLabel(id) {
  const tb = TIME_BLOCKS.find((t) => t.id === id);
  return tb ? `${tb.name} (${tb.start}–${tb.end})` : id;
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
function getTasklistById(id) { return MOCK_TASKLISTS.find((tl) => tl.id === id); }
function getTaskMeta(tasklistId, taskId) {
  const tl = getTasklistById(tasklistId);
  return tl?.tasks.find((x) => x.id === taskId) || { title: taskId, inputType: "checkbox" };
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
    <Modal opened={opened} onClose={onClose} title="Enter PIN" centered>
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
function EmployeeView({ tasklists, working, updateTaskState, handleComplete, handleUpload, signoff, submissions, setSubmissions, setWorking }) {
  return (
    <Stack gap="md">
      <Text fw={700} fz="lg">Today</Text>

      {tasklists.map((tl) => {
        const states = working[tl.id];
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
                <Text c="dimmed" fz="sm">{getTimeBlockLabel(tl.timeBlockId)}</Text>
                <Badge mt={6} variant="light">Progress: {done}/{total} ({pct(done, total)}%)</Badge>
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
                          <Badge radius="xl" variant="outline" color={isComplete ? "green" : "gray"} leftSection={isComplete ? <IconCheck size={14} /> : null}>
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
                              <Badge mt={6} variant="outline" color={state.reviewStatus === "Approved" ? "green" : state.reviewStatus === "Rework" ? "yellow" : "gray"}>
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

      {/* Review Queue (Rework) */}
      <Card withBorder radius="lg" shadow="sm">
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
              />
            ))
        )}
      </Card>
    </Stack>
  );
}

function EmployeeReworkCard({ s, setSubmissions, setWorking }) {
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
        const tl = getTasklistById(sx.tasklistId);
        const tasks = sx.tasks.map((t) => {
          const meta = tl.tasks.find((x) => x.id === t.taskId) || {};
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
function ManagerView({ submissions, setSubmissions, setWorking }) {
  const [selection, setSelection] = useState({});

  function toggle(subId, taskId) {
    setSelection((prev) => {
      const cur = new Set(prev[subId] || []);
      cur.has(taskId) ? cur.delete(taskId) : cur.add(taskId);
      return { ...prev, [subId]: cur };
    });
  }

  function applyReview(subId, review) {
    setSubmissions((prev) =>
      prev.map((s) => {
        if (s.id !== subId) return s;
        const sel = selection[subId] || new Set();
        const tasks = s.tasks.map((t) => (sel.has(t.taskId) ? { ...t, reviewStatus: review } : t));
        const hasRework = tasks.some((t) => t.reviewStatus === "Rework");
        const allApproved = tasks.length > 0 && tasks.every((t) => t.reviewStatus === "Approved");
        const status = hasRework ? "Rework" : allApproved ? "Approved" : "Pending";

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
      <Text fw={700} fz="lg">Manager Review</Text>
      {submissions.length === 0 ? <Text c="dimmed" fz="sm">No submissions yet.</Text> : null}

      {submissions.map((s) => (
        <Card key={s.id} withBorder radius="lg" shadow="sm">
          <Group justify="space-between">
            <div>
              <Text fw={600}>{s.tasklistName}</Text>
              <Text c="dimmed" fz="sm">{s.date} • Signed: {s.signedBy}</Text>
            </div>
            <Badge variant="light" color={s.status === "Approved" ? "green" : s.status === "Rework" ? "yellow" : "gray"}>{s.status}</Badge>
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
                        <input type="checkbox" checked={selection[s.id]?.has(t.taskId) || false} onChange={() => toggle(s.id, t.taskId)} />
                      </Table.Td>
                      <Table.Td><Text fw={600}>{meta.title}</Text></Table.Td>
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
                        <Badge variant="outline" color={t.status === "Complete" ? "green" : "gray"}>{t.na ? "N/A" : t.status}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="outline" color={t.reviewStatus === "Approved" ? "green" : t.reviewStatus === "Rework" ? "yellow" : "gray"}>
                          {t.reviewStatus}
                        </Badge>
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
    </Stack>
  );
}

/** ---------------------- Admin View ---------------------- */
function AdminView({ tasklists, submissions }) {
  const byBlock = useMemo(() => {
    const acc = {};
    tasklists.forEach((tl) => {
      const k = tl.timeBlockId;
      if (!acc[k]) acc[k] = { name: getTimeBlockLabel(k), total: 0, approved: 0 };
      const totalSubs = submissions.filter((s) => s.tasklistId === tl.id);
      acc[k].total += totalSubs.length;
      acc[k].approved += totalSubs.filter((s) => s.status === "Approved").length;
    });
    return Object.values(acc).map((r) => ({ name: r.name, completion: r.total ? Math.round((r.approved / r.total) * 100) : 0 }));
  }, [tasklists, submissions]);

  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Card withBorder radius="lg" shadow="sm">
          <Text fw={600} mb="xs">Completion by Time Block</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Time Block</Table.Th>
                <Table.Th>Completion</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {byBlock.map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{r.name}</Table.Td>
                  <Table.Td>{r.completion}%</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 6 }}>
        <Card withBorder radius="lg" shadow="sm">
          <Text fw={600} mb="xs">Tasklists</Text>
          <Stack gap="xs">
            {tasklists.map((tl) => (
              <div key={tl.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
                <Text fw={500}>{tl.name}</Text>
                <Text c="dimmed" fz="sm">{getTimeBlockLabel(tl.timeBlockId)} • {tl.tasks.length} tasks</Text>
              </div>
            ))}
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}

/** ---------------------- Main App (v7 Provider setup) ---------------------- */
const theme = createTheme({});

export default function App() {
  // Persisted scheme
  const [scheme, setScheme] = useLocalStorage({
    key: "theme",
    defaultValue: "light", // 'light' | 'dark'
  });

  const [mode, setMode] = useState("employee");
  const [activeLocationId, setActiveLocationId] = useState("loc_001");

  // Today’s tasklists
  const tasklistsToday = useMemo(() => {
    const dow = new Date().getDay();
    return MOCK_TASKLISTS.filter((tl) => tl.locationId === activeLocationId && tl.recurrence.includes(dow));
  }, [activeLocationId]);

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
    const state = working[tl.id].find((s) => s.taskId === task.id);
    if (!canTaskBeCompleted(task, state)) {
      alert("Finish required inputs first (photo/note/number in range).");
      return;
    }
    updateTaskState(tl.id, task.id, { status: "Complete", value: state.value ?? true });
  }
  function handleUpload(tl, task, file) {
    updateTaskState(tl.id, task.id, (ti) => ({ photos: [...(ti.photos || []), file.name] }));
  }
  function canSubmitTasklist(tl) {
    const states = working[tl.id];
    for (const t of tl.tasks) {
      const st = states.find((s) => s.taskId === t.id);
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
        const payload = working[tl.id].map((t) => ({ ...t, reviewStatus: "Pending" }));
        const submission = {
          id: `ci_${Date.now()}`,
          tasklistId: tl.id,
          tasklistName: tl.name,
          locationId: tl.locationId,
          date: todayISO(),
          status: "Pending",
          signedBy: `PIN-${pin}`,
          signedAt: new Date().toISOString(),
          tasks: payload,
        };
        setSubmissions((prev) => [submission, ...prev]);
        setWorking((prev) => ({ ...prev, [tl.id]: prev[tl.id].map((t) => ({ ...t, reviewStatus: "Pending" })) }));
        setPinModal({ open: false, onConfirm: null });
        alert("Submitted for manager review.");
      },
    });
  }

  return (
    <MantineProvider theme={theme} forceColorScheme={scheme}>
      <AppShell
        header={{ height: 64 }}
        padding="md"
        withBorder={false}
        styles={{ main: { minHeight: "100dvh", background: "var(--mantine-color-body)" } }}
      >
        <AppShell.Header style={{borderBottom: "1px solid var(--mantine-color-gray-3)"}}>
          <Group h={64} px="md" justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
            {/* left */}
            <Group gap="sm">
              <div style={{ width: 28, height: 28, borderRadius: 8, background: MOCK_COMPANY.brand.primary }} />
              <Text fw={700}>{MOCK_COMPANY.name}</Text>
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
                value={activeLocationId}
                onChange={(v) => setActiveLocationId(v)}
                data={MOCK_LOCATIONS.map((l) => ({ value: l.id, label: l.name }))}
                w={200}
              />
              <ThemeToggle scheme={scheme} setScheme={setScheme} />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          <Container size="xl">
            {mode === "employee" && (
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
              />
            )}
            {mode === "manager" && (
              <ManagerView submissions={submissions} setSubmissions={setSubmissions} setWorking={setWorking} />
            )}
            {mode === "admin" && <AdminView tasklists={MOCK_TASKLISTS} submissions={submissions} />}
          </Container>
        </AppShell.Main>

        <PinDialog opened={pinModal.open} onClose={() => setPinModal({ open: false, onConfirm: null })} onConfirm={pinModal.onConfirm} />
      </AppShell>
    </MantineProvider>
  );
}
