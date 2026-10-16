import { describe, expect, it } from 'vitest';

import { pageHelp, requiredPages } from '../../../docs/.vitepress/chapters.mjs';
import { documentationLinks, resolveDocumentationBase } from './documentation';

describe('documentation destinations', () => {
  it('maps every configured page help to a required public chapter', () => {
    for (const [path, page] of Object.entries(pageHelp)) {
      expect(requiredPages).toContain(page);
      expect(documentationLinks(path).help).toBe(`/docs/${page}.html`);
    }
  });
  it('keeps dynamic form identifiers and all query/hash/session data out of links', () => {
    const links = documentationLinks(
      '/lowcode/runtime/9007199254740993123?token=synthetic#fragment',
    );
    expect(links.help).toBe('/docs/features/lowcode.html');
    expect(JSON.stringify(links)).not.toMatch(
      /synthetic|9007199254740993123|fragment|token/,
    );
    expect(documentationLinks('/system/user?phone=synthetic#detail').help).toBe(
      '/docs/features/accounts.html',
    );
    expect(documentationLinks('/unknown').help).toBe(
      '/docs/overview/reading-path.html',
    );
  });
  it('accepts a same-origin directory or a credential-free HTTPS directory', () => {
    expect(resolveDocumentationBase('/docs')).toBe('/docs/');
    expect(
      documentationLinks('/about', 'https://docs.example.org/docs').versions,
    ).toBe('https://docs.example.org/docs/releases/versions.html');
  });
  it('maps operation logs to troubleshooting rather than scheduler help', () => {
    expect(documentationLinks('/monitor/operlog').help).toBe(
      '/docs/operations/troubleshooting.html',
    );
  });
  it.each([
    'javascript:alert(1)',
    '//example.org/docs/',
    'http://example.org/docs/',
    'https://user:pass@example.org/docs/',
    '/docs/?token=synthetic',
    'https://example.org/docs/#token',
    '/docs/%2fadmin',
    '/docs/../api/',
  ])('rejects unsafe configuration %s', (value) => {
    expect(resolveDocumentationBase(value)).toBe('/docs/');
  });
});
