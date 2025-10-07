import React, { useState } from "react";
import { Container, Card, Text, TextInput, PasswordInput, Button, Group, Anchor, Checkbox } from "@mantine/core";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import LogoWordmark from "../components/LogoWordmark";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(form);
    setLoading(false);
    if (error) return alert(error.message);
    navigate("/", { replace: true });
  }

  return (
    <Container
      size="xl"
      py={0}
      mih="calc(100dvh - 140px)"
      style={{ display: "grid", placeItems: "center" }}
    >
      <Card
        radius="xl"
        className="glass-panel"
        mx="auto"
        w={{ base: "100%", sm: 460, md: 560, lg: 680 }}
        p={{ base: "lg", md: "xl" }}
      >
        <Group justify="center"><LogoWordmark size={40} /></Group>
        <Text ta="center" c="dimmed" mt="xs">Sign in to continue</Text>

        <TextInput mt="md" label="Email" placeholder="you@company.com"
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordInput mt="sm" label="Password"
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

        <Group justify="space-between" mt="sm">
          <Checkbox label="Save credentials" />
          <Anchor component={Link} to="/signup" fz="sm">Create an account</Anchor>
        </Group>

        <Button fullWidth mt="lg" loading={loading} onClick={submit} className="button-glow">
          Login
        </Button>
        <Text ta="center" mt="sm" c="dimmed">
          Forgot password? <Anchor component={Link} to="/reset">Reset</Anchor>
        </Text>
      </Card>
    </Container>
  );
}
