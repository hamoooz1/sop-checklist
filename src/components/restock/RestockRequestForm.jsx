import React from "react";
import { Card, Select, NumberInput, Textarea, Button, Group } from "@mantine/core";
import { listItems, createRestockRequest } from "../../lib/queries.js";

export default function RestockRequestForm({ companyId, locationId, currentEmployeeId, onSubmitted }) {
  const [items, setItems] = React.useState([]);
  const [itemId, setItemId] = React.useState(null);
  const [quantity, setQuantity] = React.useState(1);
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const rows = await listItems(companyId);
        setItems(rows.filter((r) => r.is_active));
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const selectData = React.useMemo(() => {
    const groups = new Map();
    items.forEach((it) => {
      const option = { value: String(it.id), label: it.name || "Unnamed item" };
      const groupKey = it.category || "Other";
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(option);
    });
    if (groups.size === 0) return [];
    return Array.from(groups.entries()).map(([group, groupItems]) => ({
      group,
      items: groupItems,
    }));
  }, [items]);

  async function handleSubmit() {
    if (!itemId) return;
    setLoading(true);
    try {
      await createRestockRequest({
        company_id: companyId,
        location_id: locationId,
        item_id: itemId,
        quantity: quantity || 1,
        notes,
        requested_by: currentEmployeeId || null,
      });
      setItemId(null);
      setQuantity(1);
      setNotes("");
      onSubmitted?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card withBorder shadow="sm">
      <Select
        label="Item"
        placeholder="Select an item"
        data={selectData}
        searchable
        clearable
        value={itemId}
        onChange={setItemId}
        required
      />
      <Group mt="sm" grow>
        <NumberInput
          label="Quantity"
          min={1}
          value={quantity}
          onChange={setQuantity}
          required
        />
      </Group>
      <Textarea
        label="Notes"
        mt="sm"
        minRows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Group justify="flex-end" mt="md">
        <Button onClick={handleSubmit} loading={loading} disabled={!itemId}>
          Submit request
        </Button>
      </Group>
    </Card>
  );
}

