import '@mantine/core/styles.css';   // Mantine first
import './index.css';                // global resets / modal overrides
import './responsive.css';           // your design tokens & utilities
import './App.css';                  // legacy/demo styles (scoped as noted below)

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx'; // your app

ReactDOM.createRoot(document.getElementById('root')).render(<App />);