import { defineConfig } from 'vitest/config';

// Vite's `root` is ./app for serving the PWA. Vitest inherits that unless told
// otherwise, so point it back at the repo root where ./tests/ lives.
export default defineConfig({
  root: '.',
  test: { include: ['tests/**/*.test.js'] },
});
