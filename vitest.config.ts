import { fileURLToPath } from 'node:url';

import Vue from '@vitejs/plugin-vue';
import VueJsx from '@vitejs/plugin-vue-jsx';
import { configDefaults, defineConfig } from 'vitest/config';

import { localIconsPlugin } from './apps/web-ele/local-icons';

export default defineConfig({
  plugins: [
    Vue(),
    VueJsx(),
    localIconsPlugin(fileURLToPath(new URL('.', import.meta.url))),
  ],
  test: {
    environment: 'happy-dom',
    exclude: [
      ...configDefaults.exclude,
      // Static Pages use their independent node:test gate.
      'scripts/check-site.test.mjs',
      'site/**',
      '**/e2e/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/node_modules/**',
      '**/{stylelint,eslint}.config.*',
      '.prettierrc.mjs',
    ],
    server: {
      deps: {
        // Transform the native controls' ESM style imports, as in the application test runner.
        inline: ['element-plus'],
      },
    },
  },
});
