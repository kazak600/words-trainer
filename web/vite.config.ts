import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The streak request carries the timezone offset; pin it so tests do not depend on the machine.
process.env.TZ = 'UTC';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
