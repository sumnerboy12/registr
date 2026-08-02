import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4100,
    strictPort: true,
    proxy: {
      // registr's API server runs on 4101 in dev — 4100 is reserved for
      // this Vite dev server so the UI matches the port OIDC redirect URIs
      // are registered against (same port the docker deployment exposes).
      '/api': 'http://localhost:4101',
    },
  },
})
