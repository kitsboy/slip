import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const el = document.getElementById('root');
if (!el) throw new Error('slip: #root missing');

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
