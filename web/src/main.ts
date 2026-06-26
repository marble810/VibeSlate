import { mount } from 'svelte';
import App from './App.svelte';
import { swStatus } from '$lib/stores';
import { applyThemeToDocument, readStoredTheme } from '$lib/theme';
import './themes/register-styles';
import './app.scss';

const initialSelection = readStoredTheme();
applyThemeToDocument(initialSelection);

// Dynamic viewport height polyfill for browsers without dvh support
function setViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setViewportHeight();
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', () => {
  // orientationchange fires before resize; defer to let innerHeight settle
  setTimeout(setViewportHeight, 100);
});

// Track Service Worker registration status for PWA
if ('serviceWorker' in navigator) {
  swStatus.set('registering');
  navigator.serviceWorker.ready
    .then(() => {
      swStatus.set('active');
    })
    .catch(() => {
      swStatus.set('unsupported');
    });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    swStatus.set('active');
  });
}

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
