import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { router } from './app/router/routes';
import { startVersionCheck } from './app/version-check';
import './styles/global.css';

startVersionCheck(router);

const container = document.getElementById('root');

if (!container) {
  throw new Error('No se encontró el elemento #root en index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
