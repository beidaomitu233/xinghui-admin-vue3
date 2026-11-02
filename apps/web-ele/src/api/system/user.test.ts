import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestClient } from '#/api/request';

import {
  downloadUserImportTemplate,
  exportUsers,
  getUserList,
  importUsers,
  resetUserPwd,
} from './user';

vi.mock('#/api/request', () => ({
  requestClient: {
    get: vi.fn(),
    post: vi.fn(),
    upload: vi.fn(),
  },
}));

describe('user import/export API contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes the page total while retaining long IDs and remote sort parameters', async () => {
    const records = [{ userId: '9007199254740993' }];
    vi.mocked(requestClient.get).mockResolvedValueOnce({
      records,
      total: '31',
    });
    const params = {
      pageNum: 2,
      pageSize: 10,
      orderBy: 'username',
      order: 'asc',
    };
    const result = await getUserList(params);
    expect(result).toEqual({ records, total: 31 });
    expect(requestClient.get).toHaveBeenCalledWith('/system/user/list', {
      params,
    });
  });

  it.each(['9007199254740993', '-1', 'not-a-number', '1.5', ''])(
    'rejects an unsafe page total %s',
    async (total) => {
      vi.mocked(requestClient.get).mockResolvedValueOnce({
        records: [],
        total,
      });
      await expect(getUserList({ pageNum: 1 })).rejects.toThrow(
        '用户总数超出可显示范围',
      );
    },
  );

  it('uploads a workbook through the multipart helper', async () => {
    const file = new File(['workbook'], 'users.xlsx');

    await importUsers(file);

    expect(requestClient.upload).toHaveBeenCalledWith(
      '/system/user/import',
      { file },
      { timeout: 120_000 },
    );
  });

  it('downloads the template and filtered export as blobs', async () => {
    const filters = { username: 'operator', status: '1' };

    await downloadUserImportTemplate();
    await exportUsers(filters);

    expect(requestClient.get).toHaveBeenNthCalledWith(
      1,
      '/system/user/importTemplate',
      { responseType: 'blob', responseReturn: 'body' },
    );
    expect(requestClient.get).toHaveBeenNthCalledWith(
      2,
      '/system/user/export',
      { params: filters, responseType: 'blob', responseReturn: 'body' },
    );
  });

  it('returns the one-time password response from reset', async () => {
    await resetUserPwd('9007199254740993');

    expect(requestClient.post).toHaveBeenCalledWith(
      '/system/user/resetPwd',
      null,
      { params: { userId: '9007199254740993' } },
    );
  });
});
