import { defineConfig } from 'vite';

// No plugins. There used to be one here rewriting the Content-Type of the
// lookup layer, which was named data.cjs so Node could require() it past this
// package's "type": "module" — and which Vite, and GitHub Pages after it,
// served as application/node for browsers to refuse. The file is data.js now
// and the tests read it directly, so dev and production both just serve it.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/VanStock/' : '/',
  root: './app',
  server: { port: 3838, host: true },
}));
