import { afterEach, expect, it, vi } from 'vitest';

import { secureId } from './secure-id';

afterEach(() => vi.unstubAllGlobals());

it('creates a valid UUID when randomUUID is unavailable on an HTTP origin', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(171),
  });
  expect(secureId()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
