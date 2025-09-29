import React, { useState } from "react";
import { Container, Card, Text, Button, Group, List, ThemeIcon, Progress } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const STEPS = [
  { title: "Create your first location", hint: "e.g., Downtown" },
  { title: "Add a time block", hint: "Open 05:00 – 10:00" },
  { title: "Make a checklist template", hint: "Open — FOH with 3 tasks" },
];

export default function Tutorial() {
  const [i, setI] = useState(0);
  const navigate = useNavigate();

  function next() {
    if (i < STEPS.length - 1) setI(i + 1);
    else navigate("/login");
  }

  return (
    <Container size="sm" py="xl">
      <Card withBorder radius="md">
        <Text fw={700} fz="lg">Welcome! Let’s get set up</Text>
        <Progress value={((i + 1) / STEPS.length) * 100} mt="sm" />
        <Card withBorder radius="md" mt="md">
          <Text fw={600}>{STEPS[i].title}</Text>
          <Text c="dimmed" fz="sm">{STEPS[i].hint}</Text>
          <Group justify="flex-end" mt="md">
            <Button onClick={next}>{i === STEPS.length - 1 ? "Finish" : "Next"}</Button>
          </Group>
        </Card>

        <List
          spacing="xs"
          mt="md"
          icon={<ThemeIcon radius="xl" variant="light"><IconCheck size={16} /></ThemeIcon>}
        >
          {STEPS.map((s, idx) => (
            <List.Item key={s.title} c={idx <= i ? "green" : undefined}>
              {s.title}
            </List.Item>
          ))}
        </List>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => navigate("/")}>Back to site</Button>
        </Group>
      </Card>
    </Container>
  );
}
