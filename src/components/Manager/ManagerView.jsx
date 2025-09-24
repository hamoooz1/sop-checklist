export default function ManagerView({
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