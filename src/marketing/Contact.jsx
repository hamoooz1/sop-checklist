//Contact.jsx
import React, { useState } from "react";
import { Container, Card, Text, TextInput, Textarea, Button, Group } from "@mantine/core";
import { supabase } from "../lib/supabase";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!form.email || !form.message) return alert("Please provide email and a message.");
    setLoading(true);
    const { error } = await supabase.from("contact_messages").insert([form]);
    setLoading(false);
    if (error) return alert("Could not send message. Please try again.");
    setForm({ name: "", email: "", message: "" });
    alert("Thanks! We’ll get back to you soon.");
  }

  return (
    <Container size="sm" py="xl">
      <Card withBorder radius="md">
        <Text fw={700} fz="lg">Contact us</Text>
        <Text c="dimmed" fz="sm" mb="md">Have a question? Send us a note.</Text>
        <TextInput label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextInput mt="sm" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Textarea mt="sm" label="Message" minRows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        <Group justify="flex-end" mt="md">
          <Button loading={loading} onClick={submit}>Send</Button>
        </Group>
      </Card>
    </Container>
  );
}
