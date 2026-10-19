import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The browser calls /api/...; Vite forwards it to FastAPI, so no CORS in development.
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // The first test in a file pays for loading jsdom and user-event; 5 s is too tight on CI.
    testTimeout: 15_000,
  },
})
