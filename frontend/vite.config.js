import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,   // boolean true = allow ALL hosts (string 'all' does NOT work)
    hmr: {
      clientPort: 443,
    },
  },
})


