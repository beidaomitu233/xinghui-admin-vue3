import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createMarkdownRenderer } from 'vitepress';

import { resolveDocsBase } from '../.vitepress/base.mjs';
import { requiredPages, sections } from '../.vitepress/chapters.mjs';
import { checkSitePaths } from './output-paths.mjs';

export const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privatePatterns = [
  /(?:[A-Z]:[\\/](?:Users|changhuiengineer)[\\/]|\.qa-local|\.dpapi\b)/i,
  /\b(?:qa_bulk|qa_ai|ui05_empty_20261013|xinghui_[a-z]+_qa_\d+)\b/i,
  /(?:TASK_BOARD|Communication)\.md|Bearer\s+eyJ|-----BEGIN [\w ]*PRIVATE KEY-----/i,
  /(?:127\.0\.0\.1|localhost):(?:15198|15199|17823|17824|13317|13318)\b/,
];

export function checkPublicText(text, name) {
  return privatePatterns.some((pattern) => pattern.test(text))
    ? [`${name}: private material detected`]
    : [];
}

function filesIn(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? filesIn(join(root, item.name))
      : [join(root, item.name)],
  );
}
function bodyOf(text) {
  return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}
function tokensInside(tokens) {
  return tokens.flatMap((token) => [
    token,
    ...tokensInside(token.children ?? []),
  ]);
}

export async function checkContent({
  root = docsRoot,
  partial = false,
  required = requiredPages,
  navigation = sections,
  base = resolveDocsBase(),
} = {}) {
  base = resolveDocsBase(base);
  const content = join(root, 'content');
  const errors = [];
  const deferred = new Set();
  const missing = required.filter(
    (page) => !existsSync(join(content, `${page}.md`)),
  );
  if (partial) {
    missing.forEach((page) => deferred.add(`${page}.md`));
  } else {
    errors.push(
      ...missing.map((page) => `Required chapter missing: ${page}.md`),
    );
  }
  const md = await createMarkdownRenderer(content, {}, base);
  const pages = new Map();
  for (const file of filesIn(content).filter(
    (path) => extname(path) === '.md',
  )) {
    const source = readFileSync(file, 'utf8');
    const name = relative(content, file).replaceAll('\\', '/');
    errors.push(...checkPublicText(source, name));
    if (/^\s*#.*(?:待补充|TODO|placeholder)/im.test(source))
      errors.push(`${name}: placeholder chapter`);
    const tokens = md.parse(bodyOf(source), { path: file, relativePath: name });
    const flat = tokensInside(tokens);
    const anchors = new Set(
      flat
        .filter((t) => t.type === 'heading_open')
        .map((t) => t.attrGet('id'))
        .filter(Boolean),
    );
    const links = flat
      .filter((t) => t.type === 'link_open' || t.type === 'image')
      .map((t) => ({
        href: t.attrGet(t.type === 'image' ? 'src' : 'href'),
        image: t.type === 'image',
      }));
    // Homepage action links are YAML frontmatter rather than Markdown tokens.
    const frontmatter = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatter)
      for (const match of frontmatter[1].matchAll(
        /^\s*link:\s*['"]?([^\s'"]+)/gm,
      ))
        links.push({ href: match[1], image: false });
    pages.set(file, { name, anchors, links });
  }
  const allLinks = [...pages.entries()].flatMap(([file, page]) =>
    page.links.map((link) => ({ file, ...link })),
  );
  for (const section of navigation)
    for (const [path] of section.items)
      allLinks.push({
        file: join(content, 'index.md'),
        href: `/${path}`,
        image: false,
      });
  for (const { file, href, image } of allLinks) {
    if (!href || /^(?:https?:|mailto:|tel:)/i.test(href)) continue;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
      errors.push(`${relative(content, file)}: unsafe link scheme`);
      continue;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      errors.push(`${relative(content, file)}: invalid URL encoding`);
      continue;
    }
    const [linkPath, anchor] = decoded.split('#', 2);
    let cleanPath = linkPath.split('?', 1)[0];
    if (base !== '/' && cleanPath.startsWith(base))
      cleanPath = `/${cleanPath.slice(base.length)}`;
    let target = file;
    if (cleanPath) {
      target = cleanPath.startsWith('/')
        ? resolve(content, `.${cleanPath}`)
        : resolve(dirname(file), cleanPath);
    }
    if (!image && cleanPath) {
      if (target.endsWith('.html')) target = `${target.slice(0, -5)}.md`;
      else if (!extname(target))
        target =
          join(target, cleanPath.endsWith('/') ? 'index.md' : '') +
          (cleanPath.endsWith('/') ? '' : '.md');
    }
    const targetName = relative(content, target).replaceAll('\\', '/');
    if (targetName.startsWith('..')) {
      errors.push(`${relative(content, file)}: link escapes public content`);
      continue;
    }
    if (!existsSync(target)) {
      const publicAsset =
        cleanPath.startsWith('/') &&
        existsSync(resolve(root, 'public', `.${cleanPath}`));
      if (publicAsset) continue;
      if (partial && required.includes(targetName.replace(/\.md$/, '')))
        deferred.add(targetName);
      else
        errors.push(`${relative(content, file)}: missing target ${targetName}`);
    } else if (
      anchor &&
      pages.has(target) &&
      !pages.get(target).anchors.has(anchor)
    ) {
      errors.push(
        `${relative(content, file)}: missing anchor ${targetName}#${anchor}`,
      );
    }
  }
  return { errors, deferred: [...deferred], pageCount: pages.size };
}

export function checkOutput(
  root = join(docsRoot, '.vitepress/dist'),
  { base = resolveDocsBase(), required = requiredPages } = {},
) {
  const files = filesIn(root);
  const errors = files
    .filter((file) => /\.(?:html|js|json|css|txt)$/.test(file))
    .flatMap((file) =>
      checkPublicText(readFileSync(file, 'utf8'), relative(root, file)),
    );
  if (
    !existsSync(join(root, 'index.html')) ||
    !existsSync(join(root, '404.html'))
  )
    errors.push('Missing site index or 404 output');
  for (const asset of filesIn(join(docsRoot, 'public'))) {
    if (!existsSync(join(root, relative(join(docsRoot, 'public'), asset))))
      errors.push(`Missing public asset: ${relative(docsRoot, asset)}`);
  }
  errors.push(...checkSitePaths(root, files, base, required));
  return errors;
}

function removeTemporaryFixture(root) {
  const tempBase = resolve(tmpdir());
  const target = resolve(root);
  if (
    dirname(target) !== tempBase ||
    !target.slice(tempBase.length + 1).startsWith('xinghui-doc-links-')
  ) {
    throw new Error('Refusing to delete an unverified temporary fixture path');
  }
  rmSync(target, { recursive: true, force: true });
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'xinghui-doc-links-'));
  const content = join(root, 'content');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(content);
  try {
    writeFileSync(
      join(content, 'index.md'),
      '# 首页\n\n[字典](page.md#字典管理)\n\n```md\n[not a link](missing.md)\n```\n',
    );
    writeFileSync(
      join(content, 'page.md'),
      '# 字典管理\n\n## CONFIG_MASTER_KEY\n\n配置说明。',
    );
    const options = { root, required: ['index', 'page'], navigation: [] };
    const valid = await checkContent(options);
    assert.deepEqual(valid.errors, []);
    writeFileSync(
      join(content, 'index.md'),
      '# 首页\n[坏锚点](page.md#does-not-exist)',
    );
    const badAnchor = await checkContent(options);
    assert.match(badAnchor.errors.join(' '), /missing anchor/);
    writeFileSync(join(content, 'index.md'), '# 首页\n[坏链接](missing.md)');
    const badLink = await checkContent(options);
    assert.match(badLink.errors.join(' '), /missing target/);
    const missingChapter = await checkContent({
      ...options,
      required: ['index', 'missing'],
    });
    assert.match(missingChapter.errors.join(' '), /Required chapter missing/);
    const partialChapter = await checkContent({
      ...options,
      required: ['index', 'missing'],
      partial: true,
    });
    assert.deepEqual(partialChapter.errors, []);
    assert.equal(checkPublicText('TASK_BOARD.md', 'fixture').length, 1);
    assert.equal(
      checkPublicText('JWT_SECRET=<your-random-secret>', 'fixture').length,
      0,
    );
    process.stdout.write(
      'Documentation gate self-test passed: valid Chinese anchor, bad anchor/link, required chapter, explicit partial mode, fenced examples and public-text checks.\n',
    );
  } finally {
    removeTemporaryFixture(root);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes('--self-test')) await selfTest();
  else {
    const result = await checkContent({
      partial: process.argv.includes('--partial'),
    });
    if (result.deferred.length > 0)
      console.warn(
        `PARTIAL: ${result.pageCount} pages; ${result.deferred.length} required chapters not combined:\n${result.deferred.join(', ')}`,
      );
    if (result.errors.length > 0) {
      console.error(result.errors.join('\n'));
      process.exitCode = 1;
    } else
      process.stdout.write(
        `${result.deferred.length > 0 ? 'Partial content check' : 'Complete documentation check'} passed for ${result.pageCount} pages.\n`,
      );
  }
}
