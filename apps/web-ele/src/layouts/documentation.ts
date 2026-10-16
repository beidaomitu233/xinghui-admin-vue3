import { pageHelp } from '../../../docs/.vitepress/chapters.mjs';

const DEFAULT_DOCS_BASE = '/docs/';

function isDirectoryPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  return (
    normalized === '' ||
    normalized
      .slice(1)
      .split('/')
      .every((segment) => /^[\w-]+$/.test(segment))
  );
}

/** A static documentation destination never receives application query/session data. */
export function resolveDocumentationBase(value?: string): string {
  if (!value) return DEFAULT_DOCS_BASE;
  const text = value.trim();
  if (isDirectoryPath(text)) {
    return `${text.replace(/\/$/, '')}/`;
  }
  if (!/^https:\/\//i.test(text)) return DEFAULT_DOCS_BASE;
  try {
    const url = new URL(text);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !isDirectoryPath(url.pathname)
    ) {
      return DEFAULT_DOCS_BASE;
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/`;
    return url.href;
  } catch {
    return DEFAULT_DOCS_BASE;
  }
}

export function documentationLinks(routePath: string, configuredBase?: string) {
  const base = resolveDocumentationBase(configuredBase);
  const path = routePath.split(/[?#]/, 1)[0]?.replace(/\/$/, '') || '/';
  const chapter =
    pageHelp[path] ||
    (/^\/lowcode\/(?:runtime|records)\/[^/]+$/.test(path)
      ? 'features/lowcode'
      : 'overview/reading-path');
  return {
    home: base,
    help: `${base}${chapter}.html`,
    versions: `${base}releases/versions.html`,
    upgrade: `${base}releases/upgrade.html`,
  };
}
