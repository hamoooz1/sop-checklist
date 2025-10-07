import React from "react";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import '@mantine/core/styles.css';
import '../styles.css'; // custom micro-interactions/glow/marquee


export function AppThemeProvider({ children }) {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider
        defaultColorScheme="auto"
        theme={{
          primaryColor: 'violet',
          defaultRadius: 'lg',
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Cantarell, Noto Sans, Ubuntu, Helvetica Neue, Arial',
          headings: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI' },
          components: {
            Button: { defaultProps: { size: 'md', radius: 'lg' } },
            Card: { defaultProps: { withBorder: true, radius: 'lg' } },
            Paper: { defaultProps: { radius: 'lg' } },
          },
        }}
      >
        {children}
      </MantineProvider>
    </>
  );
}