import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppStoreProvider } from '@/context/AppStore';
import { ToastProvider } from '@/context/ToastContext';
import { ConnectionProvider } from '@/context/ConnectionContext';
import '@xyflow/react/dist/style.css';
import { AppRoutes } from '@/App';
import { STORAGE_KEYS } from '@/lib/config';
import './index.css';

// Apply the saved theme before first paint.
try {
  if (localStorage.getItem(STORAGE_KEYS.theme) === 'light') {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AppStoreProvider>
          <ConnectionProvider>
            <AppRoutes />
          </ConnectionProvider>
        </AppStoreProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
