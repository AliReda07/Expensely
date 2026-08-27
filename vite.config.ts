import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    // Vite doesn't read $PORT itself, so honor it explicitly -- otherwise a
    // launcher that assigns a free port via $PORT (rather than a CLI flag)
    // gets ignored and Vite falls back to its own 5173-and-up search instead.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: Boolean(process.env.PORT),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // A custom service worker (src/sw.ts) is required for push notifications --
      // the default generateSW strategy has no hook for a `push` event listener.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['pwa-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Expensely',
        short_name: 'Expensely',
        description: 'Track balance, budgets, and spending on the go.',
        theme_color: '#3568f0',
        background_color: '#060814',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
