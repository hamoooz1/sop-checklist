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