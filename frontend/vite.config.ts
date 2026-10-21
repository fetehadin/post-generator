import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Login settings may live in the repo's root settings file as SUPABASE_URL and
 * SUPABASE_PUBLISHABLE_KEY (the backend reads the same file). Only those two public values
 * are passed to the browser; nothing else from that file is exposed (it also holds secrets).
 * frontend/.env.local with VITE_SUPABASE_* still wins when present.
 */
function publicLoginSettings(mode: string): Record<string, string> {
  if (mode === 'test') return {}
  const root = loadEnv(mode, '..', '')
  const own = loadEnv(mode, '.', 'VITE_')
  const url = own.VITE_SUPABASE_URL || root.SUPABASE_URL
  const key = own.VITE_SUPABASE_PUBLISHABLE_KEY || root.SUPABASE_PUBLISHABLE_KEY
  if (key && !key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY must be the publishable (public) key, never a secret.',
    )
  }
  return url && key
    ? {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key),
      }
    : {}
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: publicLoginSettings(mode),
  server: {
    port: 5173,
    strictPort: true, // a busy port is an error, not a silent move to 5174
    // The browser calls /api/...; Vite forwards it to FastAPI, so no CORS in development.
    // 127.0.0.1, not localhost: uvicorn listens on IPv4, and localhost may mean IPv6 here.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // The first test in a file pays for loading jsdom and user-event; 5 s is too tight on CI.
    testTimeout: 15_000,
  },
}))
