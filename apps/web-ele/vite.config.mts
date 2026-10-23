import { resolve } from 'node:path';
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
      optimizeDeps: { exclude: [DEMO_ICON_MODULE_ID] },
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
