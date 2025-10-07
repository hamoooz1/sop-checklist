import React from 'react';
import { Group, Image, Text } from '@mantine/core';
import logo from '../assets/logo.svg';


export default function LogoWordmark({ size = 28, stacked = false }) {
  const Title = (
    <Text fw={900} fz={size < 28 ? 'md' : 'lg'} style={{ letterSpacing: 0.2 }}>
      <span className="gradient-text">Ops</span>
      <Text component="span" inherit className="gradient-text-acc">Check</Text>
    </Text>
  );


  if (stacked) {
    return (
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <Image src={logo} alt="OpsCheck" w={size} h={size} style={{ display: 'block' }} />
        {Title}
        <Text c="dimmed" fz="xs" mt={2}>Checklists that get done</Text>
      </div>
    );
  }


  return (
    <Group gap={8} wrap="nowrap" align="center">
      <Image src={logo} alt="OpsCheck" w={size} h={size} style={{ display: 'block' }} />
      {Title}
    </Group>
  );
}