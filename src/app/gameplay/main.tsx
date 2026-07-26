import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameplayApp } from './GameplayApp.js';
import '../styles/app.css';
import '../styles/gameplay.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Root element not found.');
}

createRoot(root).render(
  <StrictMode>
    <GameplayApp />
  </StrictMode>,
);
