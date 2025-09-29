// src/marketing/Landing.jsx
import { Button, Container, Group, Stack, Text, Title, Card, Image } from "@mantine/core";
import { supabase } from "../lib/supabase";

export default function Landing() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg" align="center">
        <Title ta="center">SOP Checklists for Busy Teams</Title>
        <Text ta="center" c="dimmed" maw={720}>
          Create time-boxed checklists, capture photo/notes, PIN sign-offs, and manager approvals — all from one shared device.
        </Text>
        <Group>
          <Button onClick={() => supabase.auth.signInWithOAuth({ provider: "google" })}>
            Get started (Google)
          </Button>
          <Button variant="default" onClick={() => supabase.auth.signInWithOtp({ email: prompt("Enter email for magic link:") })}>
            Email magic link
          </Button>
        </Group>

        <Group grow align="stretch" mt="lg">
          <Card withBorder radius="md" p="lg">
            <Title order={3}>Build templates</Title>
            <Text c="dimmed" mt="xs">Time blocks, locations, priorities, photo/note rules.</Text>
          </Card>
          <Card withBorder radius="md" p="lg">
            <Title order={3}>Complete & sign</Title>
            <Text c="dimmed" mt="xs">Employees complete tasks and sign with a PIN.</Text>
          </Card>
          <Card withBorder radius="md" p="lg">
            <Title order={3}>Review & approve</Title>
            <Text c="dimmed" mt="xs">Rework loop, approvals, and analytics for managers.</Text>
          </Card>
        </Group>

        <Card withBorder radius="md" mt="lg">
          <Image src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80" alt="product" />
        </Card>
      </Stack>
    </Container>
  );
}
