import { describe, expect, it, vi } from 'vitest';

import {
  callLogStatistics,
  exportCallLogs,
  getCallLog,
  listCallLogs,
} from './ai-call-log';

const get = vi.hoisted(() => vi.fn());
vi.mock('#/api/request', () => ({ requestClient: { get } }));
describe('upstream call log HTTP contract', () => {
  it('uses independent read endpoints, exact filters and encoded string IDs', async () => {
    const filters = {
      scope: 'OWN' as const,
      requestId: '9007199254740993123',
      entryType: 'CONFIGURATION_TEST' as const,
    };
    await listCallLogs({ ...filters, pageNum: 1, pageSize: 20 });
    await callLogStatistics(filters);
    await exportCallLogs(filters);
    await getCallLog('call/a', filters);
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      '/system/ai/call-logs',
      '/system/ai/call-logs/statistics',
      '/system/ai/call-logs/export',
      '/system/ai/call-logs/call%2Fa',
    ]);
    expect(get).toHaveBeenLastCalledWith('/system/ai/call-logs/call%2Fa', {
      params: filters,
    });
  });
});
