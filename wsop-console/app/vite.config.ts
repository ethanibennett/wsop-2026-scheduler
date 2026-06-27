import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// WSOP 2027 Console — installable, offline-first PWA.
// The service worker precaches the app shell (offline-first). Push is layered
// on later (M2) via the separate push-service; treat it as enhancement.
export default defineConfig({
  // Served under /console on the futurega.me server (see server.js). Keep the
  // trailing slash — Vite prefixes every asset URL and the PWA paths with it.
  base: '/console/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'favicon.svg'],
      manifest: {
        name: 'WSOP 2027 Console',
        short_name: 'Console',
        description: 'Personal command console for the WSOP 2027 cycle',
        theme_color: '#111111',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/console/',
        scope: '/console/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/console/index.html',
        // Pull in the push/notificationclick handlers (M2). Relative to the SW,
        // which sits at /console/sw.js, so this resolves to /console/push-sw.js.
        importScripts: ['push-sw.js'],
      },
      devOptions: { enabled: true },
    }),
  ],
})
