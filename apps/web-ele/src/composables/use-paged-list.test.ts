import { describe, expect, it, vi } from 'vitest';

import { parsePage, usePagedList } from './use-paged-list';

describe('paged list pattern', () => {
  it('accepts Page.records/total and rejects malformed responses', () => {
    expect(parsePage({ records: [{ id: '1' }], total: '1' })).toEqual({
      records: [{ id: '1' }],
      total: 1,
    });
    expect(() => parsePage({ records: [] as string[], total: 'nope' })).toThrow(
      '分页响应格式错误',
    );
    expect(() => parsePage({ records: [], total: '' })).toThrow(
      '分页响应格式错误',
    );
  });

  it('resets page on filtering and sorting, and sends backend sort parameters', async () => {
    const filters = { title: '' };
    const fetch = vi
      .fn()
      .mockResolvedValue({ records: [{ id: 'a' }], total: 21 });
    const list = usePagedList({ fetch, filters, orderBy: 'operTime' });

    await list.setPage(3);
    filters.title = 'login';
    await list.search();
    expect(fetch).toHaveBeenLastCalledWith({
      title: 'login',
      orderBy: 'operTime',
      order: 'desc',
      pageNum: 1,
      pageSize: 10,
    });
    await list.setSort('ascending');
    expect(fetch).toHaveBeenLastCalledWith({
      title: 'login',
      orderBy: 'operTime',
      order: 'asc',
      pageNum: 1,
      pageSize: 10,
    });
    await list.setPageSize(20);
    expect(list.pageNum.value).toBe(1);
    expect(list.pageSize.value).toBe(20);
  });

  it('clears stale rows on failure and allows retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ records: [{ id: 'a' }], total: 1 })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ records: [], total: 0 });
    const list = usePagedList({ fetch, filters: {}, orderBy: 'operTime' });
    expect(await list.load()).toBe(true);
    expect(await list.load()).toBe(false);
    expect(list.records.value).toEqual([]);
    expect(list.total.value).toBe(0);
    expect(list.error.value).toContain('重试');
    expect(await list.load()).toBe(true);
    expect(list.error.value).toBe('');
  });

  it('ignores older responses and returns to the previous page after last-row deletion', async () => {
    let resolveOld!: (value: { records: string[]; total: number }) => void;
    const old = new Promise<{ records: string[]; total: number }>((resolve) => {
      resolveOld = resolve;
    });
    const fetch = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({ records: ['new'], total: 11 })
      .mockResolvedValueOnce({ records: ['previous'], total: 10 });
    const list = usePagedList({ fetch, filters: {}, orderBy: 'operTime' });
    const first = list.load();
    await list.setPage(2);
    resolveOld({ records: ['stale'], total: 99 });
    await first;
    expect(list.records.value).toEqual(['new']);
    await list.reloadAfterDelete(1);
    expect(list.pageNum.value).toBe(1);
    expect(list.records.value).toEqual(['previous']);
  });
});
