import { describe, expect, it, vi } from 'vitest';

import { listMyNotifications } from './personal-notification';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('#/api/request', () => ({ requestClient: mocks }));
describe('personal notification HTTP count adaptation', () => {
  it('normalizes serialized totals without converting exact IDs', async () => {
    mocks.get.mockResolvedValue({
      items: [{ id: '9007199254740993' }],
      total: '15',
      pageNum: 1,
      pageSize: 10,
    });
    const page = await listMyNotifications({ pageNum: 1, pageSize: 10 });
    expect(page.total).toBe(15);
    expect(page.items[0]?.id).toBe('9007199254740993');
  });
  it('rejects invalid counts rather than hiding the pagination failure', async () => {
    for (const total of ['bad', '', -1, '9007199254740993']) {
      mocks.get.mockResolvedValue({
        items: [],
        total,
        pageNum: 1,
        pageSize: 10,
      });
      await expect(listMyNotifications({})).rejects.toThrow(
        'Invalid notification count',
      );
    }
  });
});
