import React from "react";
import { Container, Grid, Card, Text, Button, Group, Badge, List, ThemeIcon, Image, SimpleGrid, Accordion, rem } from "@mantine/core";
import { IconCheck, IconBolt, IconLock, IconSparkles } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import LogoWordmark from "../components/LogoWordmark";

function Feature({ title, desc, icon }) {
  return (
    <Card className="feature-card" p="lg">
      <Group gap="sm">
        <ThemeIcon variant="light" radius="xl" size="lg">{icon}</ThemeIcon>
        <div>
          <Text fw={700}>{title}</Text>
          <Text c="dimmed" fz="sm">{desc}</Text>
        </div>
      </Group>
    </Card>
  );
}

export default function Home() {
  return (
    <>
      {/* Hero with animated blobs */}
      <div className="hero-bg">
        <Container size="lg" py={96}>
          <Grid align="center" gutter={40}>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <LogoWordmark size={36} />
              <Text fw={900} fz={48} lh={1.05} mt="sm" className="gradient-text">
                SOP checklists your team will actually finish
              </Text>
              <Text c="dimmed" fz="lg" mt="sm">
                Time‑blocked routines, photo evidence, PIN sign‑off, and manager approvals — all in one shared‑device app.
              </Text>
              <Group mt="lg">
                <Button size="md" component={Link} to="/signup" className="button-glow">Start free</Button>
                <Button size="md" variant="default" component={Link} to="/login">Log in</Button>
              </Group>
              <Group mt="md" gap="sm">
                <Badge variant="light">No credit card</Badge>
                <Badge variant="light">Dark & Light theme</Badge>
                <Badge variant="light">Works anywhere</Badge>
              </Group>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card radius="xl" p="lg" className="glass-panel">
                <Text fw={600} mb="sm">What you’ll love</Text>
                <List spacing="xs" size="sm" icon={<ThemeIcon radius="xl" variant="light"><IconCheck size={16} /></ThemeIcon>}>
                  <List.Item>Time blocks (Open / Mid / Close) with schedules</List.Item>
                  <List.Item>Task rules: number ranges, photo or note required</List.Item>
                  <List.Item>Manager review: approve, rework, audit history</List.Item>
                  <List.Item>Multi‑location ready with roles</List.Item>
                </List>
              </Card>
            </Grid.Col>
          </Grid>
        </Container>
      </div>

      {/* Interactive Features */}
      <Container size="lg" py="xl">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          <Feature title="Lightning‑fast setup" desc="Templates, time blocks, and roles in minutes." icon={<IconBolt size={18} />} />
          <Feature title="Evidence built‑in" desc="Photos, notes, and numeric ranges to prove compliance." icon={<IconSparkles size={18} />} />
          <Feature title="Secure by default" desc="Role‑based access and PIN sign‑offs." icon={<IconLock size={18} />} />
        </SimpleGrid>
      </Container>

      {/* Product visual */}
      <Container size="lg" py="xl">
        <Card radius="xl" p="xl" className="hover-raise">
          <Image src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80" alt="product" radius="md" />
        </Card>
      </Container>

      {/* Testimonials marquee */}
      <Container size="lg" pb="xl">
        <Card radius="xl" p="md" className="marquee-wrap">
          <div className="marquee">
            <span>“Cut our opening time by 20%” — Blue Harbor • “Finally know what got done” — Cafe Alto • “Photos = accountability” — North Ave • </span>
            <span>“Cut our opening time by 20%” — Blue Harbor • “Finally know what got done” — Cafe Alto • “Photos = accountability” — North Ave • </span>
          </div>
        </Card>
      </Container>

      {/* FAQ */}
      <Container size="lg" pb="xl">
        <Accordion radius="lg" variant="separated">
          <Accordion.Item value="pricing">
            <Accordion.Control>How does pricing work?</Accordion.Control>
            <Accordion.Panel>Start free for your first location. Add more locations/users as you grow.</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="devices">
            <Accordion.Control>Does it work on shared devices?</Accordion.Control>
            <Accordion.Panel>Yes — OpsCheck is optimized for kiosks/tablets with PIN sign‑offs.</Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="photos">
            <Accordion.Control>Are photos required?</Accordion.Control>
            <Accordion.Panel>Only when you set the rule — e.g., require photos for critical tasks.</Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Container>

      {/* CTA */}
      <Container size="lg" pb="xl">
        <Card radius="xl" p="xl" className="cta-card">
          <Group justify="space-between" align="center" wrap="nowrap">
            <div>
              <Text fw={800} fz="xl">Ready to make “Did you do it?” a thing of the past?</Text>
              <Text c="dimmed">Start free, invite your team, and ship your first checklist in minutes.</Text>
            </div>
            <Button size="md" component={Link} to="/signup" className="button-glow">Get started</Button>
          </Group>
        </Card>
      </Container>
    </>
  );
}
