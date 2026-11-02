import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listAgentCapabilities } from '#/api/system/ai-workbench';

import AgentCapabilities from './AgentCapabilities.vue';

const access = reactive({
  accessToken: 'qa-user',
  accessCodes: ['ai:agent:invoke'],
});
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('#/api/system/ai-workbench', () => ({
  listAgentCapabilities: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  access.accessToken = 'qa-user';
  access.accessCodes = ['ai:agent:invoke'];
});
describe('live Agent capability boundary', () => {
  it('shows only server-reported capabilities and explicit write operations', async () => {
    vi.mocked(listAgentCapabilities).mockResolvedValue([
      {
        resource: 'users',
        name: '用户',
        operations: ['query', 'update'],
        readOnly: false,
      },
      {
        resource: 'files',
        name: '文件',
        operations: ['query'],
        readOnly: true,
      },
    ]);
    const wrapper = mount(AgentCapabilities, {
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('修改');
    expect(wrapper.text()).toContain('写入需确认');
    expect(wrapper.text()).toContain('只读');
    expect(wrapper.text()).not.toContain('批量新增');
    wrapper.unmount();
  });
  it('discards a stale actor response and never invents a default tool list', async () => {
    let resolve!: (
      value: Awaited<ReturnType<typeof listAgentCapabilities>>,
    ) => void;
    vi.mocked(listAgentCapabilities).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const wrapper = mount(AgentCapabilities, {
      global: { plugins: [ElementPlus] },
    });
    access.accessToken = '';
    await flushPromises();
    resolve([
      {
        resource: 'users',
        name: '旧账号工具',
        operations: ['query', 'delete'],
        readOnly: false,
      },
    ]);
    await flushPromises();
    expect(wrapper.text()).toContain('无中台调用权限');
    expect(wrapper.text()).not.toContain('旧账号工具');
    wrapper.unmount();
  });
});
