import React from "react";
import { Container, Grid, Card, Text, Button, Group, Badge, List, ThemeIcon } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <div style={{ background: "linear-gradient(180deg, rgba(14,165,233,0.08), transparent)" }}>
        <Container size="lg" py={80}>
          <Grid align="center">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Text fw={900} fz={42} lh={1.1} style={{ letterSpacing: -0.5 }}>
                Checklists that actually get done.
              </Text>
              <Text c="dimmed" fz="lg" mt="sm">
                OpsCheck helps restaurants and teams run reliable daily routines: time-blocked
                checklists, photo evidence, PIN sign-off, and manager approvals.
              </Text>
              <Group mt="lg">
                <Button size="md" component={Link} to="/signup">Start free</Button>
                <Button size="md" variant="default" component={Link} to="/login">Log in</Button>
              </Group>
              <Group mt="md" gap="sm">
                <Badge variant="light">No credit card required</Badge>
                <Badge variant="light">Works on any device</Badge>
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card radius="lg" withBorder>
                <Text fw={600} mb="xs">What you’ll love</Text>
                <List
                  spacing="xs"
                  size="sm"
                  icon={<ThemeIcon radius="xl" variant="light"><IconCheck size={16} /></ThemeIcon>}
                >
                  <List.Item>Time blocks (Open / Mid / Close) with schedules</List.Item>
                  <List.Item>Task rules: number ranges, photo or note required</List.Item>
                  <List.Item>Manager review: approve, rework, audit history</List.Item>
                  <List.Item>Multi-location ready with roles</List.Item>
                </List>
              </Card>
            </Grid.Col>
          </Grid>
        </Container>
      </div>

      {/* Features */}
      <Container size="lg" py="xl">
        <Grid>
          {[
            { title: "Structured time blocks", desc: "Morning, mid, close—configure once, reuse everywhere." },
            { title: "Evidence built-in", desc: "Photos, notes, and number ranges to prove compliance." },
            { title: "Approvals & rework", desc: "Managers approve or request fixes with one click." },
            { title: "Fast onboarding", desc: "Import locations, invite users, and start checking today." },
          ].map((f) => (
            <Grid.Col key={f.title} span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder radius="md" h="100%">
                <Text fw={700}>{f.title}</Text>
                <Text c="dimmed" fz="sm" mt={6}>{f.desc}</Text>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      </Container>

      {/* CTA */}
      <Container size="lg" pb="xl">
        <Card withBorder radius="lg" p="xl">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={700} fz="xl">Ready to make “Did you do it?” a thing of the past?</Text>
              <Text c="dimmed">Start free, invite your team, and ship your first checklist in minutes.</Text>
            </div>
            <Button size="md" component={Link} to="/signup">Get started</Button>
          </Group>
        </Card>
      </Container>
    </>
  );
}
