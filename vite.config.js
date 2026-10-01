import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';

// Dev only: the in-game screenshot key (P, src/ui/Screenshot.js) posts the PNG here and it
// lands in the project's screenshots/game/ (git-ignored).
function screenshotEndpoint() {
  return {
    name: 'kotel-screenshots',
    configureServer(server) {
      server.middlewares.use('/__screenshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const asked = new URL(req.url, 'http://localhost').searchParams.get('name') ?? 'shot.png';
          const name = asked.replace(/[^\w.-]/g, '_').replace(/^\.+/, '') || 'shot.png';
          const dir = resolve(server.config.root, 'screenshots/game');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name.endsWith('.png') ? name : `${name}.png`), Buffer.concat(chunks));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ path: `screenshots/game/${name}` }));
        });
      });
    },
  };
}

// Dev only: the recording booth (dev/booth.html) posts each take here; it lands in
// src/assets/voice/<lineId>.webm, where the game picks it up (story/Voice.js). DELETE removes it.
function voiceEndpoint() {
  return {
    name: 'kotel-voice',
    configureServer(server) {
      server.middlewares.use('/__voice', (req, res) => {
        const id = (new URL(req.url, 'http://localhost').searchParams.get('id') ?? '').replace(/[^\w-]/g, '');
        const dir = resolve(server.config.root, 'src/assets/voice');
        if (req.method === 'GET') {
          // The recordings there are: { lineId: file name }.
          const files = {};
          for (const f of existsSync(dir) ? readdirSync(dir) : []) {
            const m = f.match(/^([\w-]+)\.(ogg|mp3|wav|m4a|webm)$/);
            if (m) files[m[1]] = f;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
          return;
        }
        if (!id) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const file = join(dir, `${id}.webm`);
        if (req.method === 'DELETE') {
          try {
            unlinkSync(file);
          } catch {
            // (not there)
          }
          res.end('{}');
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, Buffer.concat(chunks));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ path: `src/assets/voice/${id}.webm` }));
        });
      });
    },
  };
}

export default defineConfig({
  // Relative base so the production build works from any sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [screenshotEndpoint(), voiceEndpoint()],
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is ~530 kB minified (~130 kB gzip); that is expected.
    chunkSizeWarningLimit: 1000,
  },
});
