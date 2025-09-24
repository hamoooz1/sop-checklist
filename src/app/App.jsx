import React, { useEffect, useState } from "react";
import { useLocations } from "../hooks/useLocations.js";
import { useTasklistsToday } from "../hooks/useTasklistsToday.js";
import AdminView from "../components/Admin/AdminView.jsx";
import EmployeeView from "../components/Employee/EmployeeView.jsx";
import {
  MantineProvider,
  createTheme,
  AppShell,
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
  Container,
  rem,
  Tabs,
} from "@mantine/core";
import { useMediaQuery, useLocalStorage } from "@mantine/hooks";
import { supabase } from "../lib/supabase.js";
import { IconSun, IconMoon, IconPhoto, IconCheck, IconUpload } from "@tabler/icons-react";
import { SettingsProvider, useSettings } from "../settings-store.jsx";

/** ---------------------- Utility Functions ---------------------- */
const todayISO = () => new Date().toISOString().slice(0, 10);
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
      className="u-btn"
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
          <Button variant="default" onClick={onClose} className="u-btn">Cancel</Button>
          <Button onClick={() => pin && onConfirm && onConfirm(pin)} className="u-btnPrimary">Confirm</Button>
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

/** ---------------------- Main App ---------------------- */
function AppInner() {
  const { settings } = useSettings();
  const [tasklistsToday, setTasklistsToday] = useState([]);
  const [locations, setLocations] = useState([]);
  const [activeLocationId, setActiveLocationId] = useLocalStorage({ key: "activeLocationId", defaultValue: "" });
  const [scheme, setScheme] = useLocalStorage({ key: "theme", defaultValue: "light" });
  const [currentEmployee, setCurrentEmployee] = useState("Employee A");
  const [pinModal, setPinModal] = useState({ open: false, onConfirm: null });

  // Fetch locations from settings or directly from DB
  // Fetch locations from the correct table
  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase.from('location').select('*'); // Correct table name: 'location'
      if (error) {
        console.error(error);
        return;
      }
      setLocations(data);
    };

    fetchLocations();
  }, []);


  // Ensure active location is set
  useEffect(() => {
    if (locations.length && !activeLocationId) {
      setActiveLocationId(locations[0].id); // Default to first location
    }
  }, [locations, activeLocationId, setActiveLocationId]);

  // Fetch today's tasklists based on location and settings
  // Fetch tasklists today with related tasks
  useEffect(() => {
    if (!activeLocationId) return;

    const fetchTasklists = async () => {
      const { data, error } = await supabase
        .from('tasklist_template')
        .select('id, name, time_block_id, recurrence, requires_approval, signoff_method, active, tasks:tasklist_task(id, title, category, input_type, min, max, photo_required, note_required, allow_na, priority)')
        .eq('location_id', activeLocationId)
        .eq('active', true);

      if (error) {
        console.error(error);
        return;
      }
      setTasklistsToday(data);
    };

    fetchTasklists();
  }, [activeLocationId]);


  // Theme setup
  useEffect(() => {
    document.documentElement.style.setProperty("--brand", settings.company.brandColor || "#0ea5e9");
  }, [settings.company.brandColor]);

  const isNarrow = useMediaQuery("(max-width: 720px)");

  // Helper functions to update task state
  const updateTaskState = async (tasklistId, taskId, patch) => {
    // Patch task state for tasklist and task
    const { error } = await supabase
      .from('tasklist_task')
      .update(patch)
      .eq('id', taskId)
      .eq('tasklist_id', tasklistId);
  
    if (error) {
      console.error(error);
      alert('Failed to update task state');
    }
  };
  

  const handleComplete = async (tasklist, task) => {
    const taskState = { status: "Complete", value: task.value || true };
    await updateTaskState(tasklist.id, task.id, taskState);  // Update in DB
  };
  

  const handleUpload = async (tasklist, task, file) => {
    // Upload to Supabase Storage or handle file storage
    const { error: uploadError } = await supabase.storage
      .from('task-evidence')
      .upload(`task_${task.id}/${file.name}`, file);
  
    if (uploadError) {
      console.error(uploadError);
      alert('Failed to upload file');
      return;
    }
  
    // After uploading, add evidence to task
    const fileUrl = `https://your-supabase-url/${file.name}`;  // Get the file URL after upload
    await updateTaskState(tasklist.id, task.id, { photos: [fileUrl] });  // Add photo evidence
  };
  

  const signoff = async (tasklist) => {
    setPinModal({
      open: true,
      onConfirm: async (pin) => {
        // Insert the tasklist submission and tasklist_task data into DB
        const submission = {
          tasklistId: tasklist.id,
          signedBy: pin,  // Assuming PIN is used as the identifier
          date: new Date().toISOString(),
          tasks: tasklist.tasks.map(task => ({
            taskId: task.id,
            status: 'Pending',
            value: task.value,
            photos: task.photos,
            note: task.note,
          })),
        };
  
        const { error: submissionError } = await supabase.from('submission').insert(submission);
        if (submissionError) {
          console.error(submissionError);
          alert('Failed to submit tasklist');
        }
        
        setPinModal({ open: false, onConfirm: null });  // Close PIN dialog after submit
      },
    });
  };
  

  return (
    <MantineProvider theme={{ colorScheme: scheme }}>
      <AppShell
        header={{
          height: isNarrow ? 120 : 64,
        }}
        padding="md"
        withBorder={false}
        styles={{ main: { minHeight: "100dvh", background: "var(--mantine-color-body)" } }}
      >
        <AppShell.Header style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}>
          <Group h={64} px="md" justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
            {/* Left */}
            <Group gap="sm">
              <div style={{ width: 28, height: 28, borderRadius: 8, background: settings.company.brandColor }} />
              <Text fw={700}>{settings.company.name}</Text>
            </Group>
            {/* Right */}
            <Group gap="xs" wrap="wrap">
              <SegmentedControl
                value="employee"
                onChange={() => { }}
                data={[{ value: "employee", label: "Employee" }, { value: "manager", label: "Manager" }, { value: "admin", label: "Admin" }]}
              />
              <Select value={currentEmployee} onChange={setCurrentEmployee} data={locations.map((l) => ({ value: l.id, label: l.name }))} w={220} placeholder="Select employee" />
              <Select value={activeLocationId || ""} onChange={(v) => setActiveLocationId(v)} data={locations.map(l => ({ value: l.id, label: l.name }))} w={200} placeholder="Select location" />
              <ThemeToggle scheme={scheme} setScheme={setScheme} />
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          <Container size="xl">
            {/* Employee View */}
            <EmployeeView
              tasklists={tasklistsToday}
              working={{}}
              updateTaskState={updateTaskState}
              handleComplete={handleComplete}
              handleUpload={handleUpload}
              signoff={signoff}
              submissions={[]}
              setSubmissions={() => { }}
              setWorking={() => { }}
              settings={settings}
              uploadEvidenceForTask={handleUpload}
            />
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
