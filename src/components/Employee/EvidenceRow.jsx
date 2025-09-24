export default function EvidenceRow({ state }) {
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