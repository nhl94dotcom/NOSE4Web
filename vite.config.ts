import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the built site works from a GitHub Pages sub-folder.
  base: './',
  plugins: [react()],
  test: {
    // Tests that rebuild and compare whole ROMs take a few seconds each when
    // many run at once.
    testTimeout: 30000,
  },
})
