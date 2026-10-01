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

  /*
   * A service worker is only re-checked when the page navigates, and a counter
   * phone is left open on one screen all day. So the app could sit on the build
   * from this morning while the server was already serving the afternoon one -
   * which looks exactly like the change not having worked. Asking for the new
   * worker on a timer means the reload above happens on its own, and the app
   * updates itself within a few minutes of a deploy.
   */
  window.setInterval(() => {
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        // Offline or the worker is being replaced right now. Try again next tick.
      });
  }, 3 * 60_000);
}
registerSW({ immediate: true });

// Restrict zoom in / zoom out across devices (mobile pinch, Safari gestures, Ctrl+scroll/keys)
if (typeof window !== 'undefined') {
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false },
  );

  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
    }
  });
}

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
