import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  API_SENTINEL,
  BASE,
  DOCS_BASE,
  REQUIRED_DOCS,
  checkDemoHtml,
  checkDocumentation,
  checkDocument,
  checkFilename,
  checkManifest,
  checkNotFoundHtml,
  checkRuntimeConfig,
  checkSite,
  localTarget,
  scanText,
  tags,
} from './check-site.mjs';

const rejects = (code, callback) =>
  assert.throws(callback, (error) => error.code === code);
const manifest = {
  schemaVersion: 1,
  mode: 'static-demo',
  apiTransport: 'local-only',
  persistence: 'browser-local',
  base: BASE,
  docsBase: DOCS_BASE,
};

test('fixed chapter contract contains exactly 54 distinct pages', () => {
  assert.equal(REQUIRED_DOCS.length, 54);
  assert.equal(new Set(REQUIRED_DOCS).size, 54);
});

test('each demo manifest field is required and rejects production/network modes', () => {
  checkManifest(manifest);
  for (const key of Object.keys(manifest)) {
    rejects('DEMO_MANIFEST', () =>
      checkManifest({ ...manifest, [key]: 'wrong' }),
    );
    const missing = { ...manifest };
    delete missing[key];
    rejects('DEMO_MANIFEST', () => checkManifest(missing));
  }
});

test('runtime JSON must use the disabled-network sentinel', () => {
  checkRuntimeConfig(
    `window._VBEN_ADMIN_PRO_APP_CONF_=${JSON.stringify({ VITE_GLOB_API_URL: API_SENTINEL })};Object.freeze(window._VBEN_ADMIN_PRO_APP_CONF_);`,
  );
  for (const api of [
    '/api',
    '',
    'http://127.0.0.1:7799',
    'https://api.example.com',
  ]) {
    rejects('REAL_API_CONFIG', () =>
      checkRuntimeConfig(
        `window.CONF=${JSON.stringify({ VITE_GLOB_API_URL: api })};`,
      ),
    );
  }
  rejects('REAL_API_CONFIG', () => checkRuntimeConfig('window.CONF={};'));
});

test('runtime script is parsed as data, never evaluated', () => {
  checkRuntimeConfig(
    `window.CONF=Object.freeze(${JSON.stringify({ VITE_APP_DEMO: true, VITE_GLOB_API_URL: API_SENTINEL })});`,
  );
  rejects('RUNTIME_CONFIG', () =>
    checkRuntimeConfig('window.CONF=fetch("https://api.example.com");'),
  );
  rejects('RUNTIME_CONFIG', () =>
    checkRuntimeConfig('window.CONF={invalid json};'),
  );
  rejects('RUNTIME_CONFIG', () =>
    checkRuntimeConfig(
      'window.CONF=Object.freeze(fetch("https://api.example.com"));',
    ),
  );
});

test('server secrets cannot be emitted in runtime configuration', () => {
  rejects('SERVER_SECRET_CONFIG', () =>
    checkRuntimeConfig(
      `window.CONF=${JSON.stringify({ VITE_GLOB_API_URL: API_SENTINEL, CONFIG_MASTER_KEY: 'not-a-real-key' })};`,
    ),
  );
});

test('missing or permissive demo CSP cannot replace a disabled-network policy', () => {
  rejects('DEMO_CSP', () => checkDemoHtml('<div id="app"></div>'));
  rejects('DEMO_CSP', () =>
    checkDemoHtml(
      '<meta http-equiv="Content-Security-Policy" content="connect-src https:;form-action \'none\';object-src \'none\'">',
    ),
  );
  rejects('DEMO_CSP', () =>
    checkDemoHtml(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"connect-src 'none';connect-src *;form-action 'none';object-src 'none'\">",
    ),
  );
  rejects('DEMO_HTML', () =>
    checkDemoHtml(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"connect-src 'none';form-action 'none';object-src 'none'\">",
    ),
  );
});

test('private filenames and application source/maps are refused', () => {
  for (const file of [
    '.env',
    '.env.production',
    'assets/index.js.map',
    'logs/access.log',
    'TASK_BOARD.md',
    'backup.sql',
    'key.machine.dpapi',
    'src/main.ts',
    'src/app.vue',
    '.git/config',
  ])
    rejects('PRIVATE_FILE', () => checkFilename(file));
  rejects('UNREVIEWED_FILE', () => checkFilename('script.exe'));
  checkFilename('licenses/echarts/LICENSE');
});

test('high-confidence secrets and private paths are refused without echoing their values', () => {
  rejects('PRIVATE_KEY', () =>
    scanText('-----BEGIN PRIVATE KEY-----', 'assets/bad.js'),
  );
  rejects('VENDOR_TOKEN', () =>
    scanText('sk-or-v1-' + 'a'.repeat(32), 'assets/bad.js'),
  );
  const fakeJwt = [
    'eyJ' + 'a'.repeat(16),
    'eyJ' + 'b'.repeat(16),
    'c'.repeat(32),
  ].join('.');
  rejects('ISSUED_JWT', () => scanText(fakeJwt, 'assets/bad.js'));
  rejects('PRIVATE_PATH', () =>
    scanText('C:\\Users\\someone\\private', 'assets/bad.js'),
  );
  rejects('PRIVATE_FIXTURE', () =>
    scanText('oss99_current_20000101', 'assets/bad.js'),
  );
});

test('public documentation examples and generic network library names do not imply actual transport', () => {
  scanText(
    '配置示例 JWT_SECRET=replace_me CONFIG_MASTER_KEY=replace_me /api http://localhost:7799 fetch XMLHttpRequest',
    'docs/guide/configuration.html',
  );
  scanText('MIT License Copyright (c) Evan You', 'licenses/vue/LICENSE');
});

test('minified ternary URL regexes are not Windows drive paths', () => {
  scanText(
    String.raw`return!e||/^https?:\/\//i.test(t)?t:/^https?:\/\//i.test(e)?new URL(t,e).toString():...`,
    'js/bootstrap.js',
  );
});

test('actual drive path components remain private, including escaped backslashes', () => {
  for (const value of [
    'C:/Users/someone/file.txt',
    'C:/private/file',
    'C:/secret.pem',
    'C:/.env',
    String.raw`C:\private\file`,
    String.raw`C:\\Users\\someone\\file.txt`,
    String.raw`C:\\private\\file`,
  ]) {
    rejects('PRIVATE_PATH', () => scanText(value, 'js/bootstrap.js'));
  }
});

test('root-level asset paths and missing deep resources fail project-base checks', () => {
  const files = new Map([['docs/assets/style.css', {}]]);
  rejects('PROJECT_BASE', () =>
    localTarget('/assets/style.css', 'docs/index.html', files, {
      resource: true,
    }),
  );
  rejects('PROJECT_BASE', () =>
    localTarget('/docs/assets/style.css', 'docs/index.html', files, {
      resource: true,
    }),
  );
  rejects('MISSING_RESOURCE', () =>
    localTarget(
      `${DOCS_BASE}assets/missing.css`,
      'docs/guide/quickstart.html',
      files,
      { resource: true },
    ),
  );
  assert.equal(
    localTarget(
      `${DOCS_BASE}assets/style.css`,
      'docs/guide/quickstart.html',
      files,
      { resource: true },
    ),
    'docs/assets/style.css',
  );
});

test('external executable/style/image resources and unsafe schemes are refused', () => {
  const files = new Map();
  for (const url of [
    'https://cdn.example.com/a.js',
    '//cdn.example.com/a.css',
    'http://127.0.0.1:7799/api',
  ])
    rejects('EXTERNAL_RESOURCE', () =>
      localTarget(url, 'index.html', files, { resource: true }),
    );
  rejects('UNSAFE_URL', () =>
    localTarget('javascript:alert(1)', 'index.html', files),
  );
  rejects('UNSAFE_URL', () =>
    localTarget('..\\secret.js', 'index.html', files, { resource: true }),
  );
});

test('root Pages 404 must keep documentation asset base', () => {
  const files = new Map([
    ['assets/app.css', {}],
    ['docs/assets/docs.css', {}],
  ]);
  rejects('ROOT_404_BASE', () =>
    localTarget(`${BASE}assets/app.css`, '404.html', files, {
      resource: true,
      docs404: true,
    }),
  );
  assert.equal(
    localTarget(`${DOCS_BASE}assets/docs.css`, '404.html', files, {
      resource: true,
      docs404: true,
    }),
    'docs/assets/docs.css',
  );
});

test('client-rendered VitePress 404 requires localized data and its actual docs loader', () => {
  const data = {
    base: DOCS_BASE,
    themeConfig: {
      notFound: {
        title: '页面不存在',
        quote: '请返回目录',
        linkText: '返回首页',
        linkLabel: '文档首页',
      },
    },
  };
  const shell = `<title>404 | 文档</title><div id="app"></div><script type="module" src="${DOCS_BASE}assets/app.js"></script><script>window.__VP_SITE_DATA__=deserializeFunctions(JSON.parse(${JSON.stringify(JSON.stringify(data))}));</script>`;
  checkNotFoundHtml(shell, '404.html');
  rejects('EMPTY_404', () =>
    checkNotFoundHtml(
      '<title>404 | 文档</title><div id="app"></div>',
      '404.html',
    ),
  );
  rejects('EMPTY_404', () =>
    checkNotFoundHtml(
      shell.replace(`${DOCS_BASE}assets/app.js`, '/assets/app.js'),
      '404.html',
    ),
  );
  rejects('EMPTY_404', () =>
    checkNotFoundHtml(shell.replace('页面不存在', ''), '404.html'),
  );
});

test('HTML attribute extraction handles entities and ignores script-body strings', () => {
  const result = tags(
    '<script>const fake="<img src=\"bad\">";</script><link rel="stylesheet" href="/x/a.css?a=1&amp;b=2">',
  );
  assert.equal(result.filter((tag) => tag.name === 'img').length, 0);
  assert.equal(
    result.find((tag) => tag.name === 'link').attributes.href,
    '/x/a.css?a=1&b=2',
  );
});

test('missing local anchors are rejected but app hash routes remain supported', () => {
  const files = new Map([
    ['docs/a.html', { text: '<h1 id="heading">标题</h1>' }],
    ['index.html', { text: '<div id="app"></div>' }],
  ]);
  rejects('MISSING_ANCHOR', () =>
    localTarget('a.html#missing', 'docs/index.html', files),
  );
  assert.equal(
    localTarget(`${BASE}#/system/user`, 'index.html', files),
    'index.html',
  );
});

test('empty/stub documents and duplicate article bodies cannot fill chapter count', () => {
  rejects('DOC_BODY', () => checkDocument('<h1>标题</h1>', 'guide/quickstart'));
  rejects('DOC_BODY', () =>
    checkDocument('<main><h1>标题</h1>待完善</main>', 'guide/quickstart'),
  );
  rejects('DOC_TITLE', () =>
    checkDocument(
      `<main>${'无标题正文'.repeat(40)}</main>`,
      'guide/quickstart',
    ),
  );
  const repeated = `<main><h1>重复内容</h1><p>${'相同正文'.repeat(40)}</p></main>`;
  rejects('DUPLICATE_DOC', () =>
    checkDocumentation(
      new Map([
        ['docs/index.html', { text: repeated }],
        ['docs/overview/introduction.html', { text: repeated }],
      ]),
    ),
  );
  rejects('DOC_MISSING', () => checkDocumentation(new Map()));
});

test('an absent or empty actual site fails; no successful site fixture is generated', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'xinghui-pages-reject-'));
  try {
    rejects('SITE_MISSING', () => checkSite(path.join(temporary, 'missing')));
    rejects('REQUIRED_FILE', () => checkSite(temporary));
  } finally {
    const resolved = realpathSync(temporary);
    assert.equal(
      path.dirname(resolved).toLowerCase(),
      realpathSync(tmpdir()).toLowerCase(),
    );
    assert.ok(path.basename(resolved).startsWith('xinghui-pages-reject-'));
    rmSync(resolved, { recursive: true, force: false });
  }
});
