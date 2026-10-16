import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getNews, listNews } from './news';

const requests = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('#/api/request', () => ({ requestClient: requests }));
const pages = import.meta.glob('../../views/system/**/index.vue');

describe('active content quality', () => {
  beforeEach(() => vi.resetAllMocks());
  it('normalizes serialized total without rounding record IDs', async () => {
    const record = { id: '9007199254740993', title: 'Neutral fixture' };
    requests.get.mockResolvedValue({
      records: [record],
      total: '25',
      pageNum: 2,
      pageSize: 20,
    });
    const result = await listNews({ pageNum: 2, pageSize: 20 });
    expect(result.total).toBe(25);
    expect(result.records[0]?.id).toBe('9007199254740993');
    expect(requests.get).toHaveBeenCalledWith('/system/news', {
      params: { pageNum: 2, pageSize: 20 },
    });
  });
  it('propagates network failure and permits a new request', async () => {
    requests.get
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce({ records: [], total: '0' });
    await expect(listNews({ pageNum: 1, pageSize: 10 })).rejects.toThrow(
      'network failed',
    );
    await expect(listNews({ pageNum: 1, pageSize: 10 })).resolves.toMatchObject(
      { total: 0 },
    );
    expect(requests.get).toHaveBeenCalledTimes(2);
  });
  it('preserves an exact Snowflake ID in detail requests', async () => {
    requests.get.mockResolvedValue({ id: '9007199254740993' });
    await getNews('9007199254740993');
    expect(requests.get).toHaveBeenCalledWith('/system/news/9007199254740993');
  });
  it('loads the actual retained news component', async () => {
    const load = pages['../../views/system/news/index.vue'];
    if (!load) throw new Error('Missing retained news component');
    expect((await load()) as { default: unknown }).toHaveProperty('default');
  }, 60_000);
});
