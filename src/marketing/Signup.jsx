import React, { useState } from "react";
import { Container, Card, Text, TextInput, PasswordInput, Button, Group, Anchor } from "@mantine/core";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    if (!form.email || !form.password) return alert("Email & password required");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name } },
    });
    setLoading(false);
    if (error) return alert(error.message);

    // Optional: if email confirmation is enabled, you might still want to send them to a "check your email" page.
    // For now, we route to tutorial; Root will keep them on marketing until session exists.
    navigate("/tutorial");
  }

  return (
    <Container size="xs" py="xl">
      <Card withBorder radius="md">
        <Text fw={700} fz="lg">Create your account</Text>
        <TextInput mt="sm" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextInput mt="sm" label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordInput mt="sm" label="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Group justify="space-between" mt="md">
          <Anchor component={Link} to="/login" fz="sm">I already have an account</Anchor>
          <Button loading={loading} onClick={submit}>Sign up</Button>
        </Group>
      </Card>
    </Container>
  );
}
