import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // I .woff2 non rientrano nei globPatterns di default: senza questa riga
        // offline la tipografia decade sul serif di sistema.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Veneto — cassa',
        short_name: 'Veneto',
        description: 'Cassa e andamento dello stand',
        lang: 'it',
        // Gli stessi due valori di --bg. Erano color carta: installata, la
        // schermata d'avvio partiva bianca in mano a chi lavora al buio.
        theme_color: '#141718',
        background_color: '#141718',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
