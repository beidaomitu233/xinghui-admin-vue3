import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { optimizeDeps, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

import {
  collectDemoIcons,
  DEMO_CSP,
  DEMO_ICON_MODULE_ID,
  DEMO_MANIFEST,
  DEMO_MARKER,
  DEMO_RUNTIME,
  demoHtml,
  staticDemoPlugins,
} from '../../demo-build';
import { DEMO_MENUS, DEMO_PERMISSIONS } from './seed';

function removeScanFixture(fixture: string) {
  const target = resolve(fixture);
  if (dirname(target) !== resolve(tmpdir()))
    throw new Error('Unexpected fixture cleanup path');
  rmSync(target, { force: true, recursive: true });
}

describe('demo-only static publication build', () => {
  it('does not install demo plugins for normal application mode', () => {
    expect(staticDemoPlugins(false, '')).toEqual([]);
  });
  it('prebundles a real dependency when a guarded demo import contains the excluded virtual icon ID', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'ai-ux-demo-scan-'));
    try {
      mkdirSync(join(fixture, 'node_modules/scan-sentinel'), {
        recursive: true,
      });
      writeFileSync(
        join(fixture, 'package.json'),
        JSON.stringify({ type: 'module', private: true }),
      );
      writeFileSync(
        join(fixture, 'node_modules/scan-sentinel/package.json'),
        JSON.stringify({
          name: 'scan-sentinel',
          version: '1.0.0',
          main: 'index.js',
        }),
      );
      writeFileSync(
        join(fixture, 'node_modules/scan-sentinel/index.js'),
        'export const sentinel = 42;',
      );
      writeFileSync(
        join(fixture, 'main.ts'),
        `import { sentinel } from 'scan-sentinel'; if (import.meta.env.VITE_APP_DEMO === 'true') import('./demo-setup'); console.log(sentinel);`,
      );
      writeFileSync(
        join(fixture, 'demo-setup.ts'),
        `import icons from '${DEMO_ICON_MODULE_ID}'; export const setupDemo = () => icons;`,
      );
      const unresolved = await resolveConfig(
        {
          root: fixture,
          configFile: false,
          logLevel: 'silent',
          define: { 'import.meta.env.VITE_APP_DEMO': JSON.stringify('false') },
          optimizeDeps: { entries: ['main.ts'] },
        },
        'serve',
      );
      await expect(optimizeDeps(unresolved, true)).rejects.toThrow(
        DEMO_ICON_MODULE_ID,
      );
      const config = await resolveConfig(
        {
          root: fixture,
          configFile: false,
          logLevel: 'silent',
          plugins: staticDemoPlugins(false, fixture),
          define: { 'import.meta.env.VITE_APP_DEMO': JSON.stringify('false') },
          optimizeDeps: {
            entries: ['main.ts'],
            exclude: [DEMO_ICON_MODULE_ID],
          },
        },
        'serve',
      );
      const metadata = await optimizeDeps(config, true);
      expect(metadata.optimized['scan-sentinel']).toBeDefined();
      expect(metadata.optimized).not.toHaveProperty(DEMO_ICON_MODULE_ID);
      expect(
        config.plugins.some((plugin) => plugin.name === 'xinghui-static-demo'),
      ).toBe(false);
    } finally {
      // Only remove the exact generated fixture directly beneath the OS temporary directory.
      removeScanFixture(fixture);
    }
  }, 30_000);
  it('emits the agreed public evidence and blocks connections while preserving local assets', () => {
    expect(DEMO_MANIFEST).toEqual({
      schemaVersion: 1,
      mode: 'static-demo',
      apiTransport: 'local-only',
      persistence: 'browser-local',
      base: '/xinghui-admin-vue3/',
      docsBase: '/xinghui-admin-vue3/docs/',
    });
    const html = demoHtml(
      '<head><link rel="icon" href="/favicon.ico"><script>load("https://hm.baidu.com/hm.js")</script><script src="/xinghui-admin-vue3/_app.config.js"></script></head>',
    );
    expect(html).not.toContain('hm.baidu.com');
    expect(html).toContain('VITE_APP_DEMO:true');
    expect(html).toContain(DEMO_MARKER);
    expect(html).toContain('/xinghui-admin-vue3/favicon.ico');
    expect(html).toContain("connect-src 'none'");
    expect(DEMO_CSP).toContain("script-src 'self'");
    expect(DEMO_RUNTIME).toEqual({
      VITE_APP_DEMO: true,
      VITE_GLOB_API_URL: '/__static_demo_local_only__',
    });
  });
  it('bundles actual local menu icons instead of relying on Iconify APIs', () => {
    const workspace = resolve(import.meta.dirname, '../../../..');
    const collections = collectDemoIcons(workspace);
    const keyboard = collections.find((c) => c.prefix === 'mdi');
    expect(
      keyboard?.icons['keyboard-esc'] ?? keyboard?.aliases['keyboard-esc'],
    ).toBeTruthy();
    for (const menu of DEMO_MENUS.flatMap((m) => [m, ...(m.children ?? [])])) {
      const [prefix, name] = String(menu.icon).split(':');
      if (!prefix || !name) throw new Error('Invalid demo icon');
      const collection = collections.find((c) => c.prefix === prefix);
      expect(
        collection?.icons[name] ?? collection?.aliases[name],
        String(menu.icon),
      ).toBeTruthy();
    }
  }, 30_000);
  it('matches the real dictionary action predicates and leaves external writes disabled', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../views/system/dict/index.vue'),
      'utf8',
    );
    const actions = [...source.matchAll(/can\('(system:dict:[^']+)'\)/g)].map(
      (m) => m[1],
    );
    expect(actions).toHaveLength(4);
    for (const action of actions) expect(DEMO_PERMISSIONS).toContain(action);
    expect(DEMO_PERMISSIONS).toContain('system:oss:download');
    for (const action of [
      'system:oss:upload',
      'system:oss:remove',
      'system:businessConfig:edit',
      'ai:model:edit',
      'ai:model:test',
      'monitor:job:run',
      'system:notificationTemplate:edit',
    ])
      expect(DEMO_PERMISSIONS).not.toContain(action);
  });
});
