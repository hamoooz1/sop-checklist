// UsersPaneDB.jsx (inline in same file or separate)
export default function UsersPaneDB() {
  const [rows, setRows] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);

  const [invite, setInvite] = useState({ email: "", role: "Employee", locations: [] });
  const [pinModal, setPinModal] = useState({ open: false, userId: null, email: "", pin: "" });

  async function refresh() {
    setLoading(true);
    const [u, l, ul] = await Promise.all([
      supabase.from("user_profile").select("*").order("created_at", { ascending: false }),
      supabase.from("location").select("id,name").order("name", { ascending: true }),
      supabase.from("user_location").select("*"),
    ]);
    setLoading(false);

    if (u.error || l.error || ul.error) {
      if (u.error) console.error(u.error);
      if (l.error) console.error(l.error);
      if (ul.error) console.error(ul.error);
      setRows([]); setLocations([]);
      return;
    }

    const locMap = new Map((l.data || []).map(x => [x.id, x.name]));
    const byUser = new Map();
    for (const r of (ul.data || [])) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      byUser.get(r.user_id).push(r.location_id);
    }

    const joined = (u.data || []).map(x => ({
      ...x,
      locations: byUser.get(x.id) || [],
    }));

    setRows(joined);
    setLocations(l.data || []);
  }

  useEffect(() => { refresh(); }, []);


  async function addUser({ email, role, locationIds }) {
    const { data, error } = await supabase.rpc(
      "admin_upsert_user_with_locations",
      { p_email: email, p_role: role, p_location_ids: locationIds }
    );
    if (error) throw error;
    return data; // UUID of user_profile.id
  }

  async function setUserPin(userId, pin) {
    const { error } = await supabase.rpc("set_user_pin", { p_user_id: userId, p_pin: pin });
    if (error) throw error;
  }
  

  async function updateRole(userId, role) {
    const { error } = await supabase.from("user_profile").update({ role }).eq("id", userId);
    if (error) return alert(error.message);
    refresh();
  }

  async function updateLocations(userId, locList) {
    // replace all assignments (simple approach)
    const { error: delErr } = await supabase.from("user_location").delete().eq("user_id", userId);
    if (delErr) return alert(delErr.message);
    if (locList.length) {
      const rows = locList.map(lid => ({ user_id: userId, location_id: lid }));
      const { error: insErr } = await supabase.from("user_location").insert(rows);
      if (insErr) return alert(insErr.message);
    }
    refresh();
  }

  async function deleteUser(userId) {
    if (!confirm("Remove this user?")) return;
    const { error } = await supabase.from("user_profile").delete().eq("id", userId);
    if (error) return alert(error.message);
    refresh();
  }

  async function savePin() {
    try {
      if (!pinModal.userId || !pinModal.pin) return;
      const { error } = await supabase.rpc("set_user_pin", {
        p_user_id: pinModal.userId,
        p_pin: pinModal.pin,
      });
      if (error) throw error;
      setPinModal({ open: false, userId: null, email: "", pin: "" });
      refresh();
      alert("PIN updated.");
    } catch (e) {
      alert(e.message);
    }
  }

  const locOptions = locations.map(l => ({ value: l.id, label: l.name }));

  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Users & Roles</Text>

      <Stack gap="sm" mb="md">
        <Group grow wrap="wrap">
          <TextInput
            label="Email"
            placeholder="person@company.com"
            value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })}
          />
          <Select
            label="Role"
            value={invite.role}
            onChange={(v) => setInvite({ ...invite, role: v })}
            data={["Admin", "Manager", "Employee"]}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>
        <MultiSelect
          label="Assign to locations"
          placeholder="Pick one or more"
          data={locOptions}
          value={invite.locations}
          onChange={(vals) => setInvite({ ...invite, locations: vals })}
          searchable
          comboboxProps={{ withinPortal: true }}
        />
        <Group justify="flex-end">
          <Button leftSection={<IconPlus size={16} />} onClick={addUser} disabled={loading}>Add user</Button>
        </Group>
      </Stack>

      <ScrollArea.Autosize mah={420} type="auto" scrollbarSize={8} styles={{ viewport: { overflowX: "hidden" } }}>
        <Table highlightOnHover style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "36%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Locations</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</Table.Td>
                <Table.Td>
                  <Select
                    value={u.role}
                    onChange={(v) => updateRole(u.id, v)}
                    data={["Admin", "Manager", "Employee"]}
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <MultiSelect
                    data={locOptions}
                    value={u.locations}
                    onChange={(vals) => updateLocations(u.id, vals)}
                    searchable
                    w="100%"
                    comboboxProps={{ withinPortal: true }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="default" onClick={() => setPinModal({ open: true, userId: u.id, email: u.email, pin: "" })}>
                      Set PIN
                    </Button>
                    <ActionIcon color="red" variant="subtle" onClick={() => deleteUser(u.id)} title="Remove">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Modal opened={pinModal.open} onClose={() => setPinModal({ open: false, userId: null, email: "", pin: "" })} title={`Set PIN for ${pinModal.email}`} centered>
        <Stack>
          <TextInput
            type="password"
            label="New PIN (4–8 digits)"
            value={pinModal.pin}
            onChange={(e) => setPinModal({ ...pinModal, pin: e.target.value })}
          />
          <Group justify="flex-end">
            <Button onClick={savePin}>Save PIN</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
