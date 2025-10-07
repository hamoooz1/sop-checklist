import React from 'react';
import { ActionIcon, Tooltip, useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import { IconSun, IconMoon } from '@tabler/icons-react';


export default function ThemeToggle() {
const { setColorScheme } = useMantineColorScheme();
const computed = useComputedColorScheme('light');
const dark = computed === 'dark';


return (
<Tooltip label={dark ? 'Switch to light' : 'Switch to dark'} withArrow>
<ActionIcon
variant="default"
aria-label="Toggle color scheme"
onClick={() => setColorScheme(dark ? 'light' : 'dark')}
>
{dark ? <IconSun size={18} /> : <IconMoon size={18} />}
</ActionIcon>
</Tooltip>
);
}