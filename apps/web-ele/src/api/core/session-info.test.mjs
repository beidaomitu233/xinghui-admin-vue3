import assert from 'node:assert/strict';

import { it } from 'vitest';

import { restoreUserSession } from './session-info.ts';

it('refresh replaces persisted access codes after a role permission changes', async () => {
  let accessCodes = ['system:user:edit'];
  let userInfo;
  const apply = (permissions) =>
    restoreUserSession(
      async () => ({ userId: '42', roles: ['operator'], permissions }),
      (info) => {
        userInfo = info;
      },
      (codes) => {
        accessCodes = codes;
      },
    );

  await apply(['system:user:list']);
  assert.deepEqual(accessCodes, ['system:user:list']);
  assert.deepEqual(userInfo.permissions, accessCodes);

  await apply([]);
  assert.deepEqual(accessCodes, []);
});
