import type { Plugin } from 'vite';

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';

export const DEMO_MANIFEST = {
  schemaVersion: 1,
  mode: 'static-demo',
  apiTransport: 'local-only',
  persistence: 'browser-local',
  base: '/xinghui-admin-vue3/',
  docsBase: '/xinghui-admin-vue3/docs/',
};
export const DEMO_MARKER = 'XINGHUI_STATIC_DEMO_LOCAL_ONLY_V1';
export const DEMO_ICON_MODULE_ID = 'virtual:xinghui-demo-icons';
export const DEMO_RUNTIME = {
  VITE_APP_DEMO: true,
  VITE_GLOB_API_URL: '/__static_demo_local_only__',
};
export const DEMO_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'";
export function demoHtml(html: string) {
  return html
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) =>
      script.includes('hm.baidu.com') ? '' : script,
    )
    .replace('href="/favicon.ico"', `href="${DEMO_MANIFEST.base}favicon.ico"`)
    .replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="${DEMO_CSP}">`,
    )
    .replace(
      '</head>',
      `<script src="${DEMO_MANIFEST.base}_app.config.js"></script><script>window.__XINGHUI_STATIC_DEMO__=Object.freeze({VITE_APP_DEMO:true,marker:'${DEMO_MARKER}'});</script></head>`,
    );
}
function sources(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sources(join(root, entry.name));
    return /\.(?:ts|tsx|vue)$/.test(entry.name) &&
      !entry.name.includes('.test.')
      ? [join(root, entry.name)]
      : [];
  });
}
export function collectDemoIcons(
  workspace: string,
  iconEvidence: string[] = [],
) {
  const names = new Map<string, Set<string>>();
  for (const folder of [
    'apps/web-ele/src',
    'packages/@core/ui-kit',
    'packages/effects',
    'packages/business',
    'packages/icons/src',
    'packages/@core/base/icons',
  ]) {
    for (const file of sources(join(workspace, folder)))
      for (const match of readFileSync(file, 'utf8').matchAll(
        /['"]([a-z][a-z0-9-]*):([a-z0-9-]+)['"]/g,
      )) {
        const name = match[2];
        const prefix = match[1];
        if (!name || !prefix) continue;
        const requested = names.get(prefix) ?? new Set<string>();
        requested.add(name);
        names.set(prefix, requested);
      }
  }
  const require = createRequire(
    join(workspace, 'internal/tailwind-config/package.json'),
  );
  try {
    iconEvidence.push(require.resolve('@iconify/json/collections.json'));
  } catch {
    /* Per-set JSON paths remain recorded below. */
  }
  const collections = [];
  for (const [prefix, requested] of names) {
    let file: string;
    try {
      file = require.resolve(`@iconify/json/json/${prefix}.json`);
    } catch {
      continue;
    }
    iconEvidence.push(file);
    const collection = JSON.parse(readFileSync(file, 'utf8')) as {
      aliases?: Record<string, { parent: string }>;
      height?: number;
      icons: Record<string, unknown>;
      prefix: string;
      width?: number;
    };
    const selected = new Set<string>();
    const include = (name: string) => {
      if (selected.has(name)) return;
      selected.add(name);
      const alias = collection.aliases?.[name];
      if (alias) include(alias.parent);
    };
    for (const name of requested) include(name);
    collections.push({
      prefix,
      width: collection.width,
      height: collection.height,
      icons: Object.fromEntries(
        [...selected]
          .filter((name) => collection.icons[name])
          .map((name) => [name, collection.icons[name]]),
      ),
      aliases: Object.fromEntries(
        [...selected]
          .filter((name) => collection.aliases?.[name])
          .map((name) => [name, collection.aliases?.[name]]),
      ),
    });
  }
  return collections;
}
export function staticDemoPlugins(
  enabled: boolean,
  workspace: string,
): Plugin[] {
  if (!enabled) return [];
  const id = `\0${DEMO_ICON_MODULE_ID}`;
  const iconEvidence: string[] = [];
  return [
    {
      name: 'xinghui-static-demo',
      enforce: 'post',
      resolveId(source) {
        if (source === DEMO_ICON_MODULE_ID) return id;
      },
      load(source) {
        if (source === id)
          return `export default ${JSON.stringify(collectDemoIcons(workspace, iconEvidence))};`;
      },
      transformIndexHtml: { order: 'post', handler: demoHtml },
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: '_app.config.js',
          source: `window._VBEN_ADMIN_PRO_APP_CONF_=Object.freeze(${JSON.stringify(DEMO_RUNTIME)});`,
        });
        this.emitFile({
          type: 'asset',
          fileName: 'demo-manifest.json',
          source: JSON.stringify(DEMO_MANIFEST, null, 2),
        });
        const evidence = process.env.DOC05_MODULE_EVIDENCE;
        if (evidence) {
          const target = resolve(evidence);
          if (
            !isAbsolute(evidence) ||
            !target.replaceAll('\\', '/').includes('/.qa-local/')
          )
            throw new Error(
              'Module evidence requires a private .qa-local absolute path',
            );
          writeFileSync(
            target,
            JSON.stringify(
              {
                modules: [
                  ...new Set([
                    ...iconEvidence,
                    ...Object.values(bundle).flatMap((chunk) =>
                      chunk.type === 'chunk' ? Object.keys(chunk.modules) : [],
                    ),
                  ]),
                ],
              },
              null,
              2,
            ),
          );
        }
      },
    },
  ];
}
