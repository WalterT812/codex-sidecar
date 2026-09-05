import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const artwork = 'data:image/png;base64,' + (await readFile('assets/royal-pearl-wallpaper-v2.png')).toString('base64');
const wallpaper = 'data:image/png;base64,' + (await readFile('assets/royal-pearl-wallpaper-v2.png')).toString('base64');
await Promise.all([
  build({ entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js', bundle: true, platform: 'node', target: 'node22', format: 'esm', banner: { js: '#!/usr/bin/env node' } }),
  build({ entryPoints: ['src/renderer/index.ts'], outfile: 'dist/renderer.js', bundle: true, platform: 'browser', target: 'chrome130', format: 'iife', define: { __SIDECAR_ART_URL__: JSON.stringify(artwork), __SIDECAR_WALLPAPER_URL__: JSON.stringify(wallpaper) } }),
]);
