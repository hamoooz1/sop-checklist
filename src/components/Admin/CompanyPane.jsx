function CompanyPane({ settings, setSettings, onSave }) {
  const s = settings.company || {};
  return (
    <Card withBorder radius="md">
      <Text fw={700} mb="sm">Company</Text>
      <Stack gap="sm">
        <TextInput label="Company name" value={s.name || ""} onChange={(e) => setSettings({ ...settings, company: { ...s, name: e.target.value } })} />
        <ColorInput label="Brand color" value={s.brandColor || "#0ea5e9"} onChange={(v) => setSettings({ ...settings, company: { ...s, brandColor: v } })} />
        <Select label="Timezone" value={s.timezone || "UTC"} onChange={(v) => setSettings({ ...settings, company: { ...s, timezone: v } })} data={TZ_OPTS} comboboxProps={{ withinPortal: true }} />
        <Divider />
        <Group justify="flex-end">
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={onSave}>Save</Button>
        </Group>
      </Stack>
    </Card>
  );
}