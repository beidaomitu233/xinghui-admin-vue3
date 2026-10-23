import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { lowcodeFillRoute } from './lowcode-fill';

describe('standalone filling entry', () => {
  it('registers a hidden standalone route that can ask for login without entering the admin shell', () => {
    expect(lowcodeFillRoute.path).toBe('/forms/fill/:token');
    expect(lowcodeFillRoute.meta).toMatchObject({
      ignoreAccess: true,
      hideInMenu: true,
      hideInTab: true,
    });
    expect(lowcodeFillRoute.children).toBeUndefined();
  });
  it('keeps capability URLs out of third-party statistics and referrers', () => {
    const html = readFileSync(
      new NodeURL('../../../index.html', import.meta.url),
      'utf8',
    );
    expect(html).toMatch(/<meta name="referrer" content="no-referrer"\s*\/>/u);
    expect(html).not.toMatch(/hm\.baidu\.com|_hmt|createElement\(['"]script/u);
    expect(html.match(/<script[^>]*src=["']https?:/gu)).toBeNull();
  });
});
