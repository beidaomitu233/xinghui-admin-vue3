import { beforeEach, describe, expect, it } from 'vitest';

import {
  readExpandedMenus,
  saveExpandedMenus,
} from '../../../packages/@core/ui-kit/menu-ui/src/expanded-state';

describe('account scoped expanded menu state', () => {
  beforeEach(() => localStorage.clear());
  it('restores multiple groups and persists closing only one, including all closed', () => {
    saveExpandedMenus('app:user-a', ['/system', '/ai']);
    expect(readExpandedMenus('app:user-a', ['/system', '/ai'])).toEqual([
      '/system',
      '/ai',
    ]);
    saveExpandedMenus('app:user-a', ['/ai']);
    expect(readExpandedMenus('app:user-a', ['/system', '/ai'])).toEqual([
      '/ai',
    ]);
    saveExpandedMenus('app:user-a', []);
    expect(readExpandedMenus('app:user-a', ['/system', '/ai'])).toEqual([]);
    expect(readExpandedMenus('app:user-b', ['/system', '/ai'])).toBeNull();
  });
  it('never restores unauthorized, malformed, duplicate or prototype paths', () => {
    localStorage.setItem(
      'x',
      JSON.stringify(['/system', '/secret', '/system', '__proto__']),
    );
    expect(readExpandedMenus('x', ['/system'])).toEqual(['/system']);
    localStorage.setItem('x', '{');
    expect(readExpandedMenus('x', ['/system'])).toBeNull();
    localStorage.setItem('x', '[1]');
    expect(readExpandedMenus('x', ['/system'])).toBeNull();
  });
});
