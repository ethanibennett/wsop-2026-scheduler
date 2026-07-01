import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Compile-time build id (UTC), e.g. "20260627-1930". Changes every build, so a
// device can show which build it's running (Settings → footer) to diagnose
// stale-PWA-cache situations.
const d = new Date()
const p = (n: number) => String(n).padStart(2, '0')
const BUILD_ID = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`

// WSOP 2027 Console — installable, offline-first PWA.
// The service worker precaches the app shell (offline-first). Push is layered
// on later (M2) via the separate push-service; treat it as enhancement.
export default defineConfig({
  // Served under /console on the futurega.me server (see server.js). Keep the
  // trailing slash — Vite prefixes every asset URL and the PWA paths with it.
  base: '/console/',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
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
