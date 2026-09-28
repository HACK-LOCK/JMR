import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { AppProviders } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/lib/theme';
import App from './App';
import './index.css';

/*
 * A counter phone can sit on an old build for days otherwise, and an old build
 * is what makes a fixed login screen look broken. The service worker takes over
 * as soon as a new build is ready (autoUpdate plus clientsClaim), and
 * controllerchange is the moment that happens - so reload once, right there,
 * and the person is on the new build without touching anything.
 */
let reloading = false;
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
