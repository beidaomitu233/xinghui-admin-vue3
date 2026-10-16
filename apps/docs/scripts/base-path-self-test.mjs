import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { resolveDocsBase } from '../.vitepress/base.mjs';
import { requiredPages } from '../.vitepress/chapters.mjs';
import { checkContent, checkOutput } from './check.mjs';

const project = '/xinghui-admin-vue3/docs/';
const scenarios = [];
function test(name, run) {
  scenarios.push({ name, run });
}
test('default, project and safe absolute bases; reject URL/traversal/encoded paths', () => {
  const previous = process.env.DOCS_BASE;
  try {
    delete process.env.DOCS_BASE;
    assert.equal(resolveDocsBase(), '/docs/');
    process.env.DOCS_BASE = project;
    assert.equal(resolveDocsBase(), project);
    for (const value of ['/', '/docs/', project, '/manual_v2/'])
      assert.equal(resolveDocsBase(value), value);
    for (const value of [
      '',
      'docs/',
      '/docs',
      '//host/docs/',
      'https://host/docs/',
      '/a/../docs/',
      '/a/./docs/',
      '/a//docs/',
      '/%2e/docs/',
      '/docs/?x',
      '/docs/#x',
      '/docs/\n',
      String.raw`/a\docs/`,
      '/a b/docs/',
      '/中文/docs/',
    ])
      assert.throws(() => resolveDocsBase(value), /DOCS_BASE/);
  } finally {
    if (previous === undefined) delete process.env.DOCS_BASE;
    else process.env.DOCS_BASE = previous;
  }
});

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'xinghui-doc-base-'));
  try {
    return run(root);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), 'xinghui-doc-base-')));
    rmSync(root, { recursive: true, force: true });
  }
}
function write(root, name, source) {
  mkdirSync(dirname(join(root, name)), { recursive: true });
  writeFileSync(join(root, name), source);
}
function site(root, base) {
  const html = `<html><head><link rel="icon" href="${base}favicon.svg"><script src="${base}assets/app.js"></script></head><body><a href="${base}guide/quickstart.html">指南</a></body></html>`;
  for (const page of [...requiredPages, '404'])
    write(root, `${page}.html`, html);
  write(root, 'favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  write(
    root,
    'assets/app.js',
    `export const search=()=>import("${base}assets/chunks/@localSearchIndexroot.test.js");`,
  );
  write(
    root,
    'assets/chunks/@localSearchIndexroot.test.js',
    'export default {};',
  );
  write(root, 'assets/chunks/VPLocalSearchBox.test.js', 'export default {};');
}
for (const base of ['/docs/', project]) {
  test(`complete output validates deep pages, favicon and lazy search under ${base}`, () =>
    fixture((root) => {
      site(root, base);
      assert.deepEqual(checkOutput(root, { base }), []);
      write(root, '404.html', '<a href="/docs/">wrong base</a>');
      assert.ok(
        checkOutput(root, { base }).some((error) => error.includes('favicon')),
      );
    }));
}
test('reject old root assets, missing deep chapter, wrong lazy import and source maps', () =>
  fixture((root) => {
    site(root, project);
    write(
      root,
      'index.html',
      `<link rel="icon" href="${project}favicon.svg"><script src="/docs/assets/app.js"></script>`,
    );
    write(
      root,
      'assets/app.js',
      'export const search=()=>import("/docs/assets/chunks/missing.js");',
    );
    write(root, 'assets/leak.js.map', '{}');
    rmSync(join(root, 'features/lowcode.html'));
    const errors = checkOutput(root, { base: project });
    for (const expected of [
      'outside-base',
      'features/lowcode.html',
      'forbidden public artifact',
    ])
      assert.ok(
        errors.some((error) => error.includes(expected)),
        expected,
      );
  }));
test('missing local search index fails the output gate', () =>
  fixture((root) => {
    site(root, project);
    rmSync(join(root, 'assets/chunks/@localSearchIndexroot.test.js'));
    assert.ok(
      checkOutput(root, { base: project }).some((error) =>
        error.includes('Missing local search index'),
      ),
    );
  }));
test('content links with complete project base retain strict chapter and Chinese anchor checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'xinghui-doc-base-'));
  try {
    write(
      root,
      'content/index.md',
      `# 首页\n[字典](${project}page.html#字典管理)`,
    );
    write(root, 'content/page.md', '# 字典管理\n');
    const options = {
      root,
      base: project,
      required: ['index', 'page'],
      navigation: [],
    };
    const valid = await checkContent(options);
    assert.deepEqual(valid.errors, []);
    write(
      root,
      'content/index.md',
      `# 首页\n[坏锚点](${project}page.html#missing)`,
    );
    const badAnchor = await checkContent(options);
    assert.match(badAnchor.errors.join(' '), /missing anchor/);
    const missingChapter = await checkContent({
      ...options,
      required: ['missing'],
    });
    assert.match(missingChapter.errors.join(' '), /Required chapter missing/);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), 'xinghui-doc-base-')));
    rmSync(root, { recursive: true, force: true });
  }
});

for (const scenario of scenarios) {
  await scenario.run();
  process.stdout.write(`PASS ${scenario.name}\n`);
}
process.stdout.write(
  `Documentation base self-test passed: ${scenarios.length} scenarios.\n`,
);
