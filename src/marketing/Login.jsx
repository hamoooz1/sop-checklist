import React, { useState } from "react";
import { Container, Card, Text, TextInput, PasswordInput, Button, Group, Anchor } from "@mantine/core";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(form);
    setLoading(false);
    if (error) return alert(error.message);
    navigate("/", { replace: true }); // Root will now show <App />
  }

  return (
    <Container size="xs" py="xl">
      <Card withBorder radius="md">
        <Text fw={700} fz="lg">Log in</Text>
        <TextInput mt="sm" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordInput mt="sm" label="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Group justify="space-between" mt="md">
          <Anchor component={Link} to="/signup" fz="sm">Create an account</Anchor>
          <Button loading={loading} onClick={submit}>Log in</Button>
        </Group>
      </Card>
    </Container>
  );
}
