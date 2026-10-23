import { mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getJobList } from '#/api/monitor/job';

import JobPage from './index.vue';

interface GridQuery {
  gridOptions: {
    proxyConfig: {
      ajax: {
        query: (params: unknown, values: unknown) => Promise<unknown>;
      };
    };
  };
  tableTitle?: string;
}
const state = vi.hoisted(() => ({
  options: undefined as GridQuery | undefined,
  codes: ['monitor:job:list'],
  labels: {} as Record<string, string>,
  labelRequests: [] as string[][],
  live: undefined as
    | undefined
    | {
        field: string | undefined;
        order: 'asc' | 'desc' | undefined;
        page: number;
        values: Record<string, unknown>;
      },
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
  useVbenModal: () => [
    { template: '<div />' },
    { setData: () => ({ open: () => {} }) },
  ],
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: state.codes,
    accessToken: 'token',
  }),
}));
vi.mock('#/adapter/form', () => ({ useVbenForm: vi.fn(), z: {} }));
vi.mock('#/adapter/vxe-table', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/adapter/vxe-table')>();
  return {
    ...actual,
    useVbenVxeGrid: (options: GridQuery) => {
      if (options.tableTitle === '任务列表') state.options = options;
      return [
        { template: '<div />' },
        {
          grid: {
            getCurrentPage: () => state.live?.page ?? 1,
            getPageSize: () => 10,
            getSortColumns: () => [
              { field: state.live?.field, order: state.live?.order },
            ],
            setCurrentPage: async (page: number) => {
              if (state.live) state.live.page = page;
            },
          },
          formApi: {
            getLatestSubmissionValues: () => state.live?.values ?? {},
            updateSchema: async () => {},
          },
        },
      ];
    },
  };
});
vi.mock('#/composables/use-dictionary', () => ({
  DICT_TYPE: { JOB_STATUS: 'job_status' },
  useDictionary: () => ({
    options: { value: [] },
    loading: { value: false },
    error: { value: false },
    load: async () => {},
    ensureLabels: async (values: string[]) => {
      state.labelRequests.push([...values]);
    },
    label: (value: string) => state.labels[value] ?? value,
  }),
}));
vi.mock('#/api/monitor/job', () => ({
  getJobList: vi.fn(),
  getJob: vi.fn(),
  addJob: vi.fn(),
  updateJob: vi.fn(),
  removeJob: vi.fn(),
  getJobHandlers: vi.fn().mockResolvedValue(['system.noop']),
  getJobFires: vi.fn().mockResolvedValue([]),
  runJob: vi.fn(),
  changeJobStatus: vi.fn(),
}));

function query(
  page = 1,
  field = 'createTime',
  order: 'asc' | 'desc' | null = 'desc',
  values: Record<string, unknown> = {},
) {
  if (!state.options) throw new Error('任务原生Grid未初始化');
  // createVbenGridQuery 从原生 Grid 状态读取查询条件，不走 proxy 参数。
  state.live = { field, order: order ?? undefined, page, values };
  return state.options.gridOptions.proxyConfig.ajax.query({}, {});
}

beforeEach(() => {
  vi.resetAllMocks();
  state.options = undefined;
  state.live = undefined;
  state.codes = ['monitor:job:list'];
  state.labels = {};
  state.labelRequests = [];
});

describe('任务原生Grid查询合同', () => {
  it('sends whitelisted sort and business filters to the server', async () => {
    mount(JobPage);
    vi.mocked(getJobList).mockResolvedValue({ records: [], total: 27 });
    await query(2, 'nextFireTime', 'asc', {
      jobName: ' 清理 ',
      jobGroup: 'DEFAULT',
      status: '0',
    });
    expect(getJobList).toHaveBeenCalledWith({
      pageNum: 2,
      pageSize: 10,
      jobName: '清理',
      jobGroup: 'DEFAULT',
      status: '0',
      orderBy: 'nextFireTime',
      order: 'asc',
    });
  });

  it('resolves status labels for the loaded rows', async () => {
    mount(JobPage);
    vi.mocked(getJobList).mockResolvedValue({
      records: [
        {
          jobId: '1',
          jobName: '示例任务',
          jobGroup: 'DEFAULT',
          handlerKey: 'system.noop',
          handlerParams: '{}',
          cronExpression: '0 */5 * * * ?',
          timeZone: 'Asia/Shanghai',
          nextFireTime: null,
          misfirePolicy: '3',
          concurrent: '1',
          status: '0',
          createBy: '',
          createTime: '',
          updateBy: '',
          updateTime: '',
          remark: '',
        },
      ],
      total: 1,
    });
    await query();
    expect(state.labelRequests.at(-1)).toEqual(['0']);
  });

  it('restores the server default when the header sort is cleared', async () => {
    mount(JobPage);
    vi.mocked(getJobList).mockResolvedValue({ records: [], total: 0 });
    await query(1, 'jobName', null);
    expect(getJobList).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: 'createTime', order: 'desc' }),
    );
  });

  it('does not forward an unsortable column to the server', async () => {
    mount(JobPage);
    vi.mocked(getJobList).mockResolvedValue({ records: [], total: 0 });
    await query(1, 'cronExpression', 'asc');
    expect(getJobList).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: 'createTime', order: 'desc' }),
    );
  });

  it('does not issue a list request without the list permission', async () => {
    state.codes = [];
    mount(JobPage);
    expect(await query()).toEqual({ items: [], total: 0 });
    expect(getJobList).not.toHaveBeenCalled();
  });
});
