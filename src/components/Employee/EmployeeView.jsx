import React from 'react';
import { Button, Card, Grid, Group, Text, Switch, Badge, TextInput, NumberInput, FileButton } from '@mantine/core';
import { IconCheck, IconUpload, IconPhoto } from '@tabler/icons-react';

export default function EmployeeView({
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

  function canTaskBeCompleted(task, state) {
    if (!state) return false;
    if (state.na) return true; // If the task is marked as "N/A", it's considered complete
  
    // Check if the task requires a photo and if it's provided
    if (task.photoRequired && (!state.photos || state.photos.length === 0)) return false;
  
    // Check if the task requires a note and if it's provided
    if (task.noteRequired && (!state.note || state.note.trim() === "")) return false;
  
    // Check for valid number input, if the task requires it
    if (task.inputType === "number") {
      const v = state.value;
      const isNum = typeof v === "number" && !Number.isNaN(v);
      if (!isNum) return false;
      if (typeof task.min === "number" && v < task.min) return false; // Min value check
      if (typeof task.max === "number" && v > task.max) return false; // Max value check
    }
  
    return true; // If all conditions are met, the task can be completed
  }
  

  return (
    <div>
      <Text fw={700} fz="lg">Today</Text>
      {tasklists.map((tl) => {
        const states = working[tl.id] || [];
        const total = tl.tasks.length;

        const done = states.filter((t) => t?.status === "Complete" || t?.na).length;
        const canSubmit = tl.tasks.every((t) => {
          const st = states.find((s) => s.taskId === t.id);
          if (!st) return false;
          return (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
        });

        return (
          <Card key={tl.id} withBorder radius="lg">
            <Group justify="space-between" align="center">
              <Text fw={600}>{tl.name}</Text>
              <Button onClick={() => signoff(tl)} disabled={!canSubmit}>Sign & Submit</Button>
            </Group>
            <div>
              {tl.tasks.map((task) => {
                const state = states.find((s) => s.taskId === task.id) || { status: "Incomplete", value: null };
                const isComplete = state.status === "Complete";
                const canComplete = canTaskBeCompleted(task, state);

                return (
                  <Card key={task.id} withBorder radius="md" style={{ borderColor: isComplete ? "green" : undefined }}>
                    <Grid>
                      <Grid.Col span={6}>
                        <Text>{task.title}</Text>
                        <Text c="dimmed">{task.category} • {task.inputType}</Text>
                      </Grid.Col>
                      <Grid.Col span={6}>
                        <Button onClick={() => handleComplete(tl, task)} disabled={!canComplete || isComplete}>
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
                          value={state.note || ""}
                          onChange={(e) => updateTaskState(tl.id, task.id, { note: e.target.value })}
                          disabled={isComplete}
                        />
                      </Grid.Col>
                    </Grid>
                    <EvidenceRow state={state} />
                  </Card>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

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
