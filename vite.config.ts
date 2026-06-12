import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/cards-collection/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '校園集卡牌',
        short_name: '集卡牌',
        description: '校園卡片收集遊戲 - 累積點數、完成任務、解鎖成就',
        theme_color: '#6366f1',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/cards-collection/',
        icons: [
          { src: '/cards-collection/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/cards-collection/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/cards-collection/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
})
