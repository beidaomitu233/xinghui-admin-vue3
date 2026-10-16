import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestClient } from '#/api/request';

import {
  downloadUserImportTemplate,
  exportUsers,
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
