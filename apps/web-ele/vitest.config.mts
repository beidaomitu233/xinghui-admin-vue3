import type { UserConfigExport } from 'vite';

import { defineConfig } from 'vitest/config';

import appViteConfig from './vite.config.mts';

export default defineConfig(async (configEnv) => {
  const resolvedViteConfig =
    typeof appViteConfig === 'function'
      ? await appViteConfig(configEnv)
      : await (appViteConfig as UserConfigExport);

  return {
    ...resolvedViteConfig,
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
      server: {
        deps: {
          inline: ['element-plus'],
        },
      },
    },
  };
});
