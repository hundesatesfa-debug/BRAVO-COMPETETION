import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script',
      includeAssets: [
        'icons/bravo-mark.svg',
        'icons/bravo-192.png',
        'icons/bravo-512.png',
        'icons/bravo-maskable-512.png',
      ],
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
            src: '/icons/bravo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/bravo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/bravo-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
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
