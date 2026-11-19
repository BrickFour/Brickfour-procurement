// Bundles the Express API server for production.
// Output goes to build/ (not dist/) so server code is never served as a static file.
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  sourcemap: true,
  outfile: 'build/server.cjs',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});
