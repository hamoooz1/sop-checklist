function LocationsPaneDB({ loc }) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", timezone: "UTC" });

  const createLocation = async () => {
    if (!draft.name.trim()) return;
    const { error } = await supabase.from("location").insert({ name: draft.name.trim(), timezone: draft.timezone || "UTC" });
    if (error) return alert(error.message);
    setAddOpen(false); setDraft({ name: "", timezone: "UTC" });
    loc.refresh();
  };

  const updateLocation = async (id, patch) => {
    const { error } = await supabase.from("location").update(patch).eq("id", id);
    if (error) return alert(error.message);
    loc.refresh();
  };

  const removeLocation = async (id) => {
    if (!confirm("Delete this location? (Templates at this location will also be removed)")) return;
    const { error } = await supabase.from("location").delete().eq("id", id);
    if (error) return alert(error.message);
    loc.refresh();
  };

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text fw={700}>Locations</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>Add location</Button>
      </Group>

      <ScrollArea.Autosize mah={360} type="auto" scrollbarSize={8} styles={{ viewport: { overflowX: "hidden" } }}>
        <Table highlightOnHover withColumnBorders={false} style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "52%" }} />
            <col style={{ width: "38%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Timezone</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(loc.rows || []).map((l) => (
              <Table.Tr key={l.id}>
                <Table.Td>
                  <TextInput
                    defaultValue={l.name || ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (l.name || "")) updateLocation(l.id, { name: v });
                    }}
                  />

                </Table.Td>
                <Table.Td>
                  <Select
                    value={l.timezone || "UTC"}
                    onChange={(v) => updateLocation(l.id, { timezone: v })}
                    data={TZ_OPTS}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon color="red" variant="subtle" onClick={() => removeLocation(l.id)} title="Delete">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="Add location" centered>
        <Stack>
          <TextInput label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Select label="Timezone" value={draft.timezone} onChange={(v) => setDraft({ ...draft, timezone: v })} data={TZ_OPTS} comboboxProps={{ withinPortal: true, zIndex: 11000 }} />
          <Group justify="flex-end"><Button onClick={createLocation}>Add</Button></Group>
        </Stack>
      </Modal>
    </Card>
  );
}