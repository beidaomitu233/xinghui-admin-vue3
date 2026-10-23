import { mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getUserList } from '#/api/system/user';

import UserPage from './index.vue';

interface GridQuery {
  gridOptions: {
    proxyConfig: {
      ajax: {
        query: (
          params: {
            page: { currentPage: number; pageSize: number };
            sort: { field: string; order: 'asc' | 'desc' | null };
          },
          values: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    };
  };
}
const state = vi.hoisted(() => ({
  options: undefined as GridQuery | undefined,
  codes: ['system:user:list'],
  live: undefined as
    | undefined
    | {
        field: string;
        order: 'asc' | 'desc';
        page: number;
        values: Record<string, unknown>;
      },
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
  useVbenModal: () => [{ template: '<div />' }, {}],
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: state.codes }),
}));
vi.mock('#/adapter/form', () => ({ useVbenForm: vi.fn(), z: {} }));
vi.mock('#/adapter/vxe-table', () => ({
  useVbenVxeGrid: (options: GridQuery & { tableTitle?: string }) => {
    if (options.tableTitle === '用户列表') state.options = options;
    return [
      { template: '<div />' },
      {
        grid: state.live
          ? {
              getCurrentPage: () => state.live?.page ?? 1,
              getPageSize: () => 10,
              getSortColumns: () => [
                { field: state.live?.field, order: state.live?.order },
              ],
              setCurrentPage: async (page: number) => {
                if (state.live) state.live.page = page;
              },
            }
          : {},
        formApi: { getLatestSubmissionValues: () => state.live?.values ?? {} },
      },
    ];
  },
}));
vi.mock('#/api/system/user', () => ({
  getUserList: vi.fn(),
  getUser: vi.fn(),
  addUser: vi.fn(),
  updateUser: vi.fn(),
  downloadUserImportTemplate: vi.fn(),
  exportUsers: vi.fn(),
  importUsers: vi.fn(),
  removeUser: vi.fn(),
  resetUserPwd: vi.fn(),
}));
vi.mock('#/api/system/role', () => ({ getRoleList: vi.fn() }));

function query(
  page = 1,
  field = 'createTime',
  order: 'asc' | 'desc' | null = 'desc',
  values: Record<string, unknown> = {},
) {
  if (!state.options) throw new Error('用户原生Grid未初始化');
  return state.options.gridOptions.proxyConfig.ajax.query(
    { page: { currentPage: page, pageSize: 10 }, sort: { field, order } },
    values,
  );
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise未初始化');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  state.options = undefined;
  state.live = undefined;
  state.codes = ['system:user:list'];
});

describe('用户原生Grid查询合同', () => {
  it('sends sort and business filters to the server on later pages', async () => {
    mount(UserPage);
    vi.mocked(getUserList).mockResolvedValue({ records: [], total: 31 });
    await query(3, 'nickname', 'asc', {
      username: ' alice ',
      mobile: ' 13900001111 ',
      status: '0',
    });
    expect(getUserList).toHaveBeenCalledWith({
      pageNum: 3,
      pageSize: 10,
      orderBy: 'nickname',
      order: 'asc',
      username: 'alice',
      mobile: '13900001111',
      status: '0',
    });
  });
  it('restores the server default when the header sort is cleared', async () => {
    mount(UserPage);
    vi.mocked(getUserList).mockResolvedValue({ records: [], total: 0 });
    await query(1, 'username', null);
    expect(getUserList).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: 'createTime', order: 'desc' }),
    );
  });
  it('does not let an older response overwrite the newest query', async () => {
    mount(UserPage);
    const old = deferred<Awaited<ReturnType<typeof getUserList>>>();
    vi.mocked(getUserList)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ records: [], total: 21 });
    const first = query(1, 'username', 'asc');
    const second = query(2, 'username', 'desc');
    expect(await second).toEqual({ items: [], total: 21 });
    old.resolve({ records: [], total: 999 });
    expect(await first).toEqual({ items: [], total: 21 });
  });
  it('continues a filter change that Vxe ignores while its proxy is loading', async () => {
    state.live = { page: 3, field: 'username', order: 'asc', values: {} };
    mount(UserPage);
    const old = deferred<Awaited<ReturnType<typeof getUserList>>>();
    vi.mocked(getUserList)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ records: [], total: 4 });
    const first = query(3, 'username', 'asc');
    state.live.values = { status: '0' };
    state.live.field = 'nickname';
    state.live.order = 'desc';
    old.resolve({ records: [], total: 999 });
    expect(await first).toEqual({ items: [], total: 4 });
    expect(getUserList).toHaveBeenLastCalledWith({
      pageNum: 1,
      pageSize: 10,
      orderBy: 'nickname',
      order: 'desc',
      status: '0',
    });
    expect(state.live.page).toBe(1);
  });
  it('does not issue a list request without the list permission', async () => {
    state.codes = [];
    mount(UserPage);
    expect(await query()).toEqual({ items: [], total: 0 });
    expect(getUserList).not.toHaveBeenCalled();
  });
});
