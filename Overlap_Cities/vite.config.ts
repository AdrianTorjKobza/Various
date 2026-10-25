/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

interface VercelHeaders {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

/** `npm run preview` serves the same security headers as production (vercel.json is the single source). */
function productionHeaders(): Record<string, string> {
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as VercelHeaders;
  const global = vercel.headers.find((rule) => rule.source === '/(.*)');
  return Object.fromEntries((global?.headers ?? []).filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value]));
}

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200, // MapLibre alone is ~800 kB minified
    rollupOptions: {
      output: { manualChunks: { maplibre: ['maplibre-gl'] } },
    },
  },
  preview: { headers: productionHeaders() },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
