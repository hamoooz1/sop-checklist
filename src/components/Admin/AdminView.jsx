import React, { useState, useEffect } from 'react';
import { Card, Group, Button, Select, Table, Text, Modal, TextInput, ActionIcon } from '@mantine/core';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { supabase } from "../../lib/supabase";

export default function AdminView() {
  const [locations, setLocations] = useState([]);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', timezone: 'UTC' });

  const fetchLocations = async () => {
    const { data, error } = await supabase.from("public.location").select("*");
    if (error) {
      console.error(error);
    } else {
      setLocations(data);
    }
  };

  const addLocation = async () => {
    if (newLocation.name) {
      const { error } = await supabase.from("public.location").insert([newLocation]);
      if (error) {
        console.error(error);
      } else {
        setNewLocation({ name: '', timezone: 'UTC' });
        fetchLocations();
      }
    }
  };

  const deleteLocation = async (id) => {
    const { error } = await supabase.from("public.location").delete().eq("id", id);
    if (error) {
      console.error(error);
    } else {
      fetchLocations();
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  return (
    <Card>
      <Group position="apart">
        <Text>Locations</Text>
        <Button leftSection={<IconPlus />} onClick={() => setAddLocationOpen(true)}>Add Location</Button>
      </Group>
      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Timezone</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {locations.map(location => (
            <tr key={location.id}>
              <td>{location.name}</td>
              <td>{location.timezone}</td>
              <td>
                <ActionIcon color="red" onClick={() => deleteLocation(location.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        opened={addLocationOpen}
        onClose={() => setAddLocationOpen(false)}
        title="Add New Location"
      >
        <TextInput
          label="Location Name"
          value={newLocation.name}
          onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
        />
        <Select
          label="Timezone"
          value={newLocation.timezone}
          onChange={(value) => setNewLocation({ ...newLocation, timezone: value })}
          data={["UTC", "America/New_York", "America/Los_Angeles"]}
        />
        <Group position="right" mt="sm">
          <Button onClick={addLocation}>Add</Button>
        </Group>
      </Modal>
    </Card>
  );
}
