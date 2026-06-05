import { mount } from 'svelte';
import App from './App.svelte';
import { swStatus } from '$lib/stores';
import './app.scss';

// Track Service Worker registration status for PWA
if ('serviceWorker' in navigator) {
  swStatus.set('registering');
  navigator.serviceWorker.ready.then(() => {
    swStatus.set(navigator.serviceWorker.controller ? 'active' : 'registering');
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    swStatus.set('updated');
  });
}

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
