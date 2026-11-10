import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script',
      includeAssets: ['icons/bravo-mark.svg'],
      manifest: {
        id: '/',
        name: 'BR@VO',
        short_name: 'BR@VO',
        description: 'Study with purpose. Compete with clarity.',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        background_color: '#F4F5F7',
        theme_color: '#00A6A6',
        icons: [
          {
            src: '/icons/bravo-mark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/(?:auth|rest|functions|storage|realtime)\/v1(?:\/|$)/,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
