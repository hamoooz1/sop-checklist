import '@mantine/core/styles.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // your app
import './index.css';        // your own styles AFTER Mantine

ReactDOM.createRoot(document.getElementById('root')).render(<App />);