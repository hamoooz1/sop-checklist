import '@mantine/core/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import App from './App.jsx';
import Root from './Root.jsx';

const theme = createTheme({
  components: {
    Modal: {
      defaultProps: {
        withinPortal: true,
        zIndex: 10000,
        transitionProps: { duration: 0 },
        overlayProps: { opacity: 0.25, blur: 2 },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <Root />
  </MantineProvider>
);
