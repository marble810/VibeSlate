import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  const pwaEnabled = command === 'serve'
    ? process.env.MARBLE_PWA_ENABLED === 'true'
    : process.env.MARBLE_PWA_ENABLED !== 'false';

  return {
    plugins: [
      svelte(),
      VitePWA({
        disable: !pwaEnabled,
        registerType: 'autoUpdate',
        manifest: {
          id: '/',
          name: 'VibeSlate',
          short_name: 'VibeSlate',
          description: 'LLM usage and spare-device info slate',
          start_url: '/',
          scope: '/',
          lang: 'zh-CN',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'fullscreen',
          display_override: ['fullscreen', 'standalone'],
          orientation: 'any',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,webmanifest,png,svg,ico,woff2}'],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    server: {
      host: true,
      port: 5173,
      https: {
        key: fs.readFileSync(path.resolve(__dirname, './key.pem')),
        cert: fs.readFileSync(path.resolve(__dirname, './cert.pem')),
      },
      proxy: {
        '/auth': 'http://localhost:12001',
        '/api': 'http://localhost:12001',
        '/events': 'http://localhost:12001',
      },
    },
    resolve: {
      alias: {
        $lib: path.resolve(__dirname, './src/lib'),
        $components: path.resolve(__dirname, './src/components'),
      },
    },
    build: {
      outDir: 'dist',
      target: 'es2022',
    },
  };
});
