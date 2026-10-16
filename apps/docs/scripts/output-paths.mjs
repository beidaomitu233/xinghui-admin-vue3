import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { resolveDocsBase } from '../.vitepress/base.mjs';

/** Check the emitted site, including deep pages and lazy search resources. */
export function checkSitePaths(root, files, base, required) {
  base = resolveDocsBase(base);
  const errors = [];
  for (const page of required)
    if (!existsSync(join(root, `${page}.html`)))
      errors.push(`Missing required page output: ${page}.html`);
  const names = files.map((file) => relative(root, file).replaceAll('\\', '/'));
  if (
    !names.some((name) =>
      /assets\/chunks\/@localSearchIndex[^/]*\.js$/.test(name),
    )
  )
    errors.push('Missing local search index output');
  if (
    !names.some((name) =>
      /assets\/chunks\/VPLocalSearchBox\.[^/]+\.js$/.test(name),
    )
  )
    errors.push('Missing local search UI output');

  function localTarget(raw, file, resource) {
    if (/^(?:https?:|mailto:|tel:)/i.test(raw)) {
      if (resource)
        errors.push(`${file}: external resource URL is not self-hosted`);
      return;
    }
    if (!raw || raw.startsWith('#') || /^data:image\//i.test(raw)) return;
    const label = relative(root, file).replaceAll('\\', '/');
    try {
      const decoded = decodeURIComponent(raw.replaceAll('&amp;', '&'));
      if (
        decoded.includes('\\') ||
        /\p{Control}/u.test(decoded) ||
        decoded.startsWith('//')
      )
        throw new Error('unsafe path');
      const page = base + label;
      const target = new URL(decoded, `https://docs.invalid${page}`);
      if (
        target.origin !== 'https://docs.invalid' ||
        !target.pathname.startsWith(base)
      )
        throw new Error('outside base');
      const name = decodeURIComponent(target.pathname.slice(base.length));
      const path = resolve(root, name || '.');
      const within = relative(resolve(root), path);
      if (within.startsWith('..') || within.includes('\0'))
        throw new Error('outside output');
      const expected = target.pathname.endsWith('/')
        ? join(path, 'index.html')
        : path;
      if (!existsSync(expected))
        errors.push(`${label}: missing emitted target ${name}`);
    } catch {
      errors.push(`${label}: unsafe or outside-base URL`);
    }
  }

  for (const file of files) {
    const name = relative(root, file).replaceAll('\\', '/');
    if (lstatSync(file).isSymbolicLink()) {
      errors.push(`${name}: symbolic links are not public artifacts`);
      continue;
    }
    if (
      /(?:^|\/)(?:\.git|node_modules|\.env[^/]*|[^/]*_TASK\.md|TASK_BOARD\.md|Communication\.md)(?:\/|$)|\.map$/i.test(
        name,
      )
    )
      errors.push(`${name}: forbidden public artifact`);
    if (file.endsWith('.html')) {
      const html = readFileSync(file, 'utf8');
      if (!html.includes(`href="${base}favicon.svg"`))
        errors.push(`${name}: favicon does not use configured base`);
      for (const tag of html.matchAll(/<(a|link|script|img|source)\b[^>]*>/gi))
        for (const attribute of tag[0].matchAll(
          /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi,
        ))
          localTarget(attribute[2], file, tag[1].toLowerCase() !== 'a');
    } else if (file.endsWith('.js')) {
      const source = readFileSync(file, 'utf8');
      for (const imported of source.matchAll(
        /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\/[^"']+)["']/g,
      ))
        localTarget(imported[1], file, true);
    }
  }
  return errors;
}
