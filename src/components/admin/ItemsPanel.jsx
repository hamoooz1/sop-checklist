import React from "react";
import {
  Card,
  Group,
  Button,
  TextInput,
  NativeSelect,
  Switch,
  FileInput,
  Table,
  Avatar,
  Text,
  Stack,
  Modal,
} from "@mantine/core";
import {
  listItems,
  createItem,
  updateItem,
  deleteItem,
  uploadItemImage,
} from "../../lib/queries.js";
import { RESTOCK_CATEGORIES } from "../../lib/restock-categories.js";
import { IconTrash, IconPencil, IconPlus, IconChevronDown } from "@tabler/icons-react";

const CATEGORY_SELECT_DATA = [
  { value: "", label: "Select a category" },
  ...RESTOCK_CATEGORIES.map((value) => ({ value, label: value })),
];

export default function ItemsPanel() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [file, setFile] = React.useState(null);
  const [form, setForm] = React.useState({
    name: "",
    category: "",
    unit: "",
    sku: "",
    notes: "",
    is_active: true,
    image_url: "",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listItems();
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      category: "",
      unit: "",
      sku: "",
      notes: "",
      is_active: true,
      image_url: "",
    });
    setFile(null);
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      name: item.name ?? "",
      category: item.category ?? "",
      unit: item.unit ?? "",
      sku: item.sku ?? "",
      notes: item.notes ?? "",
      is_active: item.is_active ?? true,
      image_url: item.image_url ?? "",
    });
    setFile(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setLoading(true);
    try {
      let image_url = form.image_url;
      if (file) {
        image_url = await uploadItemImage(file);
      }
      const payload = { ...form, image_url };

      if (editing) {
        await updateItem(editing.id, payload);
      } else {
        await createItem(payload);
      }

      setModalOpen(false);
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this item?")) return;
    setLoading(true);
    try {
      await deleteItem(id);
      await load();
    } finally {
      setLoading(false);
    }
  }

  const rows = items.map((it) => (
    <Table.Tr key={it.id}>
      <Table.Td>
        <Group gap="xs">
          <Avatar src={it.image_url || undefined} radius="xl">
            {it.name?.[0] ?? "?"}
          </Avatar>
          <div>
            <Text fw={500}>{it.name}</Text>
            <Text size="xs" c="dimmed">
              {it.unit || it.sku ? [it.unit, it.sku].filter(Boolean).join(" · ") : null}
            </Text>
          </div>
        </Group>
      </Table.Td>
      <Table.Td>{it.category}</Table.Td>
      <Table.Td>{it.is_active ? "Active" : "Inactive"}</Table.Td>
      <Table.Td>
        <Group gap="xs" justify="flex-end">
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconPencil size={14} />}
            onClick={() => openEdit(it)}
          >
            Edit
          </Button>
          <Button
            variant="subtle"
            color="red"
            size="xs"
            leftSection={<IconTrash size={14} />}
            onClick={() => handleDelete(it.id)}
          >
            Delete
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Card withBorder shadow="sm">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>Items</Text>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openCreate}
          loading={loading}
        >
          New item
        </Button>
      </Group>

      <Table highlightOnHover withColumnBorders striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Item</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit item" : "New item"}
        centered
      >
        <Stack>
          <TextInput
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <NativeSelect
            rightSection={<IconChevronDown size={16} stroke={1.5} />}
            styles={(theme) => ({
              input: {
                borderRadius: theme.radius.md,
                borderColor: theme.colors.gray[4],
                paddingRight: theme.spacing.lg,
                height: 40,
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                "&:focus": {
                  borderColor: theme.colors.blue[5],
                  boxShadow: `0 0 0 1px ${theme.colors.blue[5]}40`,
                },
              },
              rightSection: {
                pointerEvents: "none",
              },
            })}
            label="Category"
            required
            data={CATEGORY_SELECT_DATA}
            value={form.category}
            onChange={(event) => {
              const nextValue = event?.currentTarget?.value ?? "";
              setForm((f) => ({ ...f, category: nextValue }));
            }}
          />
          <TextInput
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <FileInput
            label="Image"
            placeholder={form.image_url ? "Change image…" : "Upload image"}
            value={file}
            onChange={setFile}
          />
          <Switch
            label="Active"
            checked={form.is_active}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_active: e.currentTarget.checked }))
            }
          />
          <Group justify="flex-end" mt="md">
            <Button onClick={handleSave} loading={loading}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

