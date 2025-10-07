import React from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { AppShell, Group, Button, Container, Anchor, Divider, Indicator } from "@mantine/core";
import { useWindowScroll } from '@mantine/hooks';
import ThemeToggle from "../components/ThemeToggle";
import LogoWordmark from "../components/LogoWordmark";


export default function MarketingLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [{ y }] = useWindowScroll();
  const elevated = y > 2;


  const linkProps = (to) => ({
    className: `nav-link ${location.pathname === to ? 'nav-active' : ''}`,
    component: Link,
    to,
    underline: 'never',
    c: location.pathname === to ? 'inherit' : 'dimmed',
  });


  return (
    <AppShell header={{ height: 80 }} padding="md" withBorder={false}>
      <AppShell.Header className={`nav-glass ${elevated ? 'nav-shadow' : ''}`}>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="lg" wrap="nowrap" align="center">
              <Anchor component={Link} to="/" underline="never" c="inherit"><LogoWordmark size={30} /></Anchor>
              <Group gap="md" visibleFrom="sm">
                <Anchor {...linkProps('/')}>Home</Anchor>
                <Anchor {...linkProps('/contact')}>Contact</Anchor>
              </Group>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <ThemeToggle />
              <Button variant="default" component={Link} to="/login">Log in</Button>
              <Button onClick={() => navigate("/signup")} className="button-glow">Get started</Button>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>


      <AppShell.Main>
        <Outlet />
      </AppShell.Main>


      <Divider mt="xl" />
      <Container size="lg" py="xl">
        <Group justify="space-between">
          <Anchor component={Link} to="/" underline="never" c="dimmed" fz="sm">© {new Date().getFullYear()} OpsCheck</Anchor>
          <Group gap="md">
            <Anchor component={Link} to="/contact" c="dimmed" fz="sm">Contact</Anchor>
            <Anchor href="#" target="_blank" rel="noreferrer" c="dimmed" fz="sm">Terms</Anchor>
            <Anchor href="#" target="_blank" rel="noreferrer" c="dimmed" fz="sm">Privacy</Anchor>
          </Group>
        </Group>
      </Container>
    </AppShell>
  );
}