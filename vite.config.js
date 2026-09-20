import { defineConfig } from 'vite';

// data.cjs is loaded by the browser as a classic <script> — it is the pure
// lookup layer, shared byte-for-byte with the Node test runs. Vite serves .cjs
// as application/node, which browsers refuse. This plugin corrects the type.
const serveCjsAsJs = {
  name: 'serve-cjs-as-js',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && req.url.split('?')[0].endsWith('.cjs')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
      next();
    });
  },
};

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/VanStock/' : '/',
  root: './app',
  plugins: [serveCjsAsJs],
  server: { port: 3838, host: true },
}));
