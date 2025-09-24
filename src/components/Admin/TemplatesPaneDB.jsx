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