import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import {
  registerNotificationRecordTargetValidator,
  resolveNotificationTarget,
  validateNotificationTarget,
} from './target-navigation';

function createRouterForTargetChecks() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/ai/model', name: 'AiModelList', component: {} },
      { path: '/infra/file', name: 'FileList', component: {} },
      { path: '/infra/notice', name: 'SystemNotice', component: {} },
      { path: '/monitor/job', name: 'JobList', component: {} },
      { path: '/monitor/jobLog', name: 'JobLogList', component: {} },
      { path: '/notifications', name: 'Notifications', component: {} },
      { path: '/system/dict', name: 'DictList', component: {} },
      {
        path: '/system/notification-template',
        name: 'NotificationTemplateList',
        component: {},
      },
      { path: '/system/user', name: 'UserList', component: {} },
      { path: '/system/ai-model', name: 'WrongAiModelPath', component: {} },
      { path: '/system/file', name: 'WrongFilePath', component: {} },
      { path: '/system/notice', name: 'WrongNoticePath', component: {} },
      { path: '/records/:id', name: 'RecordDetails', component: {} },
      {
        path: '/admin',
        name: 'AdminPage',
        component: {},
        meta: { authority: ['admin'], title: 'Admin' },
      },
      { path: '/:path(.*)*', name: 'FallbackNotFound', component: {} },
    ],
  });
}

describe('notification target policy', () => {
  it('rejects every C0 control character and DEL inside an internal target', () => {
    const router = createRouterForTargetChecks();
    for (let code = 0; code <= 127; code++) {
      if (code >= 32 && code < 127) continue;
      expect(
        resolveNotificationTarget(
          `/system/u${String.fromCodePoint(code)}ser`,
          router,
          [],
        ),
      ).toEqual({ kind: 'invalid' });
    }
  });

  it('rejects external, malformed, traversal, and empty targets safely', () => {
    const router = createRouterForTargetChecks();

    expect(
      resolveNotificationTarget('https://outside.example/path', router, []),
    ).toEqual({ kind: 'external' });
    expect(
      resolveNotificationTarget('//outside.example/path', router, []),
    ).toEqual({ kind: 'invalid' });
    expect(
      resolveNotificationTarget('/records/%5c%5coutside', router, []),
    ).toEqual({ kind: 'invalid' });
    expect(resolveNotificationTarget('/records/../admin', router, [])).toEqual({
      kind: 'invalid',
    });
    expect(resolveNotificationTarget(null, router, [])).toEqual({
      kind: 'empty',
    });
  });

  it.each([
    '/ai/model',
    '/infra/file',
    '/infra/notice',
    '/monitor/job',
    '/monitor/jobLog',
    '/notifications',
    '/system/dict',
    '/system/notification-template',
    '/system/user',
  ])(
    'allows an approved list route without record parameters: %s',
    async (path) => {
      const router = createRouterForTargetChecks();
      const target = resolveNotificationTarget(path, router, ['tenant-user']);

      expect(target).toMatchObject({ kind: 'internal', policy: 'list' });
      if (target.kind !== 'internal')
        throw new Error('Expected internal target');
      await expect(
        validateNotificationTarget(target, router, ['tenant-user']),
      ).resolves.toBe('available');
    },
  );

  it('does not treat list routes with query values as safe record targets', () => {
    const target = resolveNotificationTarget(
      '/infra/notice?noticeId=9001',
      createRouterForTargetChecks(),
      ['tenant-user'],
    );

    expect(target.kind).toBe('unavailable');
  });

  it.each(['/system/ai-model', '/system/file', '/system/notice'])(
    'does not allow the wrong directory-root path %s',
    (path) => {
      const target = resolveNotificationTarget(
        path,
        createRouterForTargetChecks(),
        ['tenant-user'],
      );

      expect(target.kind).toBe('unavailable');
    },
  );

  it('fails closed for an existing record route without a business checker', () => {
    const target = resolveNotificationTarget(
      '/records/N-404',
      createRouterForTargetChecks(),
      ['tenant-user'],
    );

    expect(target.kind).toBe('unavailable');
  });

  it.each([
    ['missing', 'missing'],
    ['forbidden', 'forbidden'],
    ['available', 'available'],
  ] as const)(
    'uses the record checker result (%s) before navigation',
    async (result, expected) => {
      const router = createRouterForTargetChecks();
      const checker = vi.fn().mockResolvedValue(result);
      const unregister = registerNotificationRecordTargetValidator(
        'RecordDetails',
        checker,
      );
      try {
        const target = resolveNotificationTarget('/records/N-404', router, [
          'tenant-user',
        ]);
        expect(target).toMatchObject({ kind: 'internal', policy: 'record' });
        if (target.kind !== 'internal') {
          throw new Error('Expected validated record target');
        }

        await expect(
          validateNotificationTarget(target, router, ['tenant-user']),
        ).resolves.toBe(expected);
        expect(checker).toHaveBeenCalledWith(
          expect.objectContaining({ params: { id: 'N-404' } }),
          ['tenant-user'],
        );
      } finally {
        unregister();
      }
    },
  );

  it('treats a failing business checker as unavailable', async () => {
    const router = createRouterForTargetChecks();
    const unregister = registerNotificationRecordTargetValidator(
      'RecordDetails',
      vi.fn().mockRejectedValue(new Error('record service unavailable')),
    );
    try {
      const target = resolveNotificationTarget('/records/N-404', router, [
        'tenant-user',
      ]);
      if (target.kind !== 'internal') throw new Error('Expected record target');

      await expect(
        validateNotificationTarget(target, router, ['tenant-user']),
      ).resolves.toBe('unavailable');
    } finally {
      unregister();
    }
  });

  it('treats an unknown checker result as unavailable', async () => {
    const router = createRouterForTargetChecks();
    const unregister = registerNotificationRecordTargetValidator(
      'RecordDetails',
      vi.fn().mockResolvedValue('unknown' as never),
    );
    try {
      const target = resolveNotificationTarget('/records/N-404', router, [
        'tenant-user',
      ]);
      if (target.kind !== 'internal') throw new Error('Expected record target');

      await expect(
        validateNotificationTarget(target, router, ['tenant-user']),
      ).resolves.toBe('unavailable');
    } finally {
      unregister();
    }
  });

  it('preserves route permission and missing-route checks', () => {
    const router = createRouterForTargetChecks();

    expect(
      resolveNotificationTarget('/admin', router, ['tenant-user']).kind,
    ).toBe('forbidden');
    expect(
      resolveNotificationTarget('/deleted-records/N-1', router, ['tenant-user'])
        .kind,
    ).toBe('missing');
  });
});
