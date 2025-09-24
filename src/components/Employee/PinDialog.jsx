export default function PinDialog({ opened, onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  return (
    <Modal zIndex={1000} opened={opened} onClose={onClose} title="Enter PIN" centered withinPortal transitionProps={{ duration: 0 }} overlayProps={{ opacity: 0.25, blur: 2 }}>
      <Stack gap="sm">
        <TextInput type="password" placeholder="••••" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={() => pin && onConfirm && onConfirm(pin)}>Confirm</Button>
        </Group>
      </Stack>
    </Modal>
  );
}