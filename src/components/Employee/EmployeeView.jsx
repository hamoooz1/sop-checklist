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
                              onChange={async (v) => {
                                const val = Number(v);
                                updateTaskState(tl.id, task.id, { value: val }); // optimistic UI
                                try {
                                  const subId = await ensureDraftSubmissionId({
                                    tlId: tl.id, locationId: activeLocationId, employee: currentEmployee
                                  });
                                  await saveTaskPatch({
                                    submissionId: subId,
                                    taskId: task.id,
                                    patch: { value: String(val) }
                                  });
                                } catch (e) { console.error(e); }
                              }}
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
                            onChange={async (e) => {
                              const note = e.target.value;
                              updateTaskState(tl.id, task.id, { note });
                              try {
                                const subId = await ensureDraftSubmissionId({
                                  tlId: tl.id, locationId: activeLocationId, employee: currentEmployee
                                });
                                await saveTaskPatch({
                                  submissionId: subId,
                                  taskId: task.id,
                                  patch: { note }
                                });
                              } catch (e) { console.error(e); }
                            }}
                            disabled={isComplete && !task.noteRequired}
                            style={{ minWidth: rem(180) }}
                          />


                          <Switch
                            checked={!!state.na}
                            onChange={async (e) => {
                              const na = e.currentTarget.checked;
                              updateTaskState(tl.id, task.id, { na });
                              try {
                                const subId = await ensureDraftSubmissionId({
                                  tlId: tl.id, locationId: activeLocationId, employee: currentEmployee
                                });
                                await saveTaskPatch({
                                  submissionId: subId,
                                  taskId: task.id,
                                  patch: { na }
                                });
                              } catch (e) { console.error(e); }
                            }}
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