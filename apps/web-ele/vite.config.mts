import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { defineConfig } from '@vben/vite-config';

import ElementPlus from 'unplugin-element-plus/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
import { loadEnv } from 'vite';

import {
  DEMO_ICON_MODULE_ID,
  DEMO_MANIFEST,
  staticDemoPlugins,
} from './demo-build';
import { localIconsPlugin } from './local-icons';

export default defineConfig(async ({ mode }) => {
  const demo = loadEnv(mode, process.cwd()).VITE_APP_DEMO === 'true';
  // On-demand component styles are injected after the initial dependency scan.
  // Pre-optimize the installed entries to avoid a full reload on each new menu.
  const require = createRequire(import.meta.url);
  const elementComponents = resolve(
    dirname(require.resolve('element-plus/package.json')),
    'es/components',
  );
  const elementStyles = readdirSync(elementComponents)
    .filter((name) =>
      existsSync(resolve(elementComponents, name, 'style/css.mjs')),
    )
    .map((name) => `element-plus/es/components/${name}/style/css`);
  return {
    application: demo
      ? {
          extraAppConfig: false,
          archiver: false,
          nitroMock: false,
          pwa: false,
          devtools: false,
        }
      : {},
    vite: {
      // The dependency scanner visits guarded dynamic imports even in normal dev mode.
      // This virtual ID belongs to the demo plugin, rather than an installable dependency.
      optimizeDeps: {
        exclude: [DEMO_ICON_MODULE_ID],
        include: elementStyles,
      },
      define: {
        'import.meta.env.VITE_APP_DEMO': JSON.stringify(String(demo)),
        ...(demo
          ? {
              'import.meta.env.VITE_DOCS_URL': JSON.stringify(
                DEMO_MANIFEST.docsBase,
              ),
            }
          : {}),
      },
      ...(demo
        ? {
            base: '/xinghui-admin-vue3/',
            build: { outDir: 'dist-demo', sourcemap: false },
          }
        : {}),
      plugins: [
        localIconsPlugin(resolve(process.cwd(), '../..')),
        ...staticDemoPlugins(demo, resolve(process.cwd(), '../..')),
        ElementPlus({
          format: 'esm',
        }),
        Components({
          resolvers: [ElementPlusResolver()],
          dts: 'src/components.d.ts',
        }),
      ],
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            // Spring Boot backend
            target: process.env.VITE_DEV_API_TARGET || 'http://localhost:7799',
            ws: true,
          },
        },
      },
    },
  };
});
