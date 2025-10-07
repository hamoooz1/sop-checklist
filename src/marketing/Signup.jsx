import React, { useState } from "react";
import { Container, Card, Text, TextInput, PasswordInput, Button, Group, Anchor } from "@mantine/core";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import LogoWordmark from "../components/LogoWordmark";

export default function Signup() {
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    if (!form.email || !form.password) return alert("Email & password required");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name } },
    });
    setLoading(false);
    if (error) return alert(error.message);
    navigate("/tutorial");
  }

  return (
    <Container
      size="xl"
      py={0}
      mih="calc(100dvh - 250px)"        // adjust if your header/footer height differs
      style={{ display: "grid", placeItems: "center" }} // centers both axes
    >
      <Card
        radius="xl"
        className="glass-panel"
        mx="auto"
        w={{ base: "100%", sm: 460, md: 560, lg: 680 }} // grows with viewport
        p={{ base: "lg", md: "xl" }}
      >
        <Group justify="center"><LogoWordmark size={40} /></Group>
        <Text ta="center" c="dimmed" mt="xs">Create your account</Text>

        <TextInput mt="md" label="Name" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextInput mt="sm" label="Email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordInput mt="sm" label="Password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />

        <Group justify="space-between" mt="sm">
          <Anchor component={Link} to="/login" fz="sm">I already have an account</Anchor>
        </Group>

        <Button fullWidth mt="lg" loading={loading} onClick={submit} className="button-glow">
          Sign up
        </Button>
      </Card>
    </Container>
  );
}
