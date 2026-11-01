import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MonitorWorkspace from './MonitorWorkspace.vue';

const access = reactive({
  accessToken: 'qa-user',
  accessCodes: ['ai:agent:invoke', 'ai:request:list'],
});
const api = vi.hoisted(() => ({
  agents: vi.fn(),
  events: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('#/api/system/ai-workbench', () => ({
  listAgentSessions: api.agents,
  getAgentEvents: api.events,
}));
vi.mock('#/api/system/ai-conversation', () => ({
  listConversations: api.list,
  getConversation: api.detail,
}));
vi.mock('./CallLogPanel.vue', () => ({
  default: { template: '<div>请求日志列表</div>' },
}));
vi.mock('#/views/ai/workbench/AgentImagePreview.vue', () => ({
  default: { template: '<div />' },
}));
const legacy = {
  conversationId: 'same-id',
  title: '业务对话',
  sceneKey: 'orders',
  sceneName: '订单',
  updatedAt: '2026-11-01T00:00:00Z',
};
const event = (id: string, type: string, data: Record<string, unknown>) => ({
  id,
  type,
  data,
  runId: 'run',
  createdAt: '2026-11-01T00:00:00Z',
});
const render = async () => {
  const wrapper = mount(MonitorWorkspace, {
    global: { plugins: [ElementPlus], stubs: { AiStatistics: true } },
  });
  await flushPromises();
  await wrapper
    .findAll('[role="tab"]')
    .find((tab) => tab.text() === '对话记录')
    ?.trigger('click');
  await flushPromises();
  return wrapper;
};
beforeEach(() => {
  vi.clearAllMocks();
  access.accessToken = 'qa-user';
  access.accessCodes = ['ai:agent:invoke', 'ai:request:list'];
  api.agents.mockResolvedValue([
    { id: 'same-id', title: '中台改价', updatedAt: '2026-11-01T01:00:00Z' },
  ]);
  api.events.mockResolvedValue([
    event('1', 'USER_MESSAGE', { text: '改成35元' }),
    event('2', 'TEXT_DELTA', { replyId: 'reply', delta: '已核对35元' }),
  ]);
  api.list.mockResolvedValue({ records: [legacy], total: '1' });
  api.detail.mockResolvedValue({
    conversation: { ...legacy, history: 'COMPLETE' },
    messages: [
      {
        messageId: '1',
        role: 'ASSISTANT',
        content: '历史订单回答',
        status: 'SUCCEEDED',
        partial: false,
        createdAt: legacy.updatedAt,
      },
    ],
    notice: null,
  });
});
describe('unified conversation log', () => {
  it('merges both sources in one tab with collision-safe selection and keeps logs read-only', async () => {
    const wrapper = await render();
    await flushPromises();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      '使用统计',
      '对话记录',
      '请求日志',
    ]);
    expect(wrapper.text()).toContain('中台改价');
    expect(wrapper.text()).toContain('业务对话');
    expect(wrapper.text()).toContain('已核对35元');
    await wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text() === '业务对话')
      ?.trigger('click');
    await flushPromises();
    expect(api.detail).toHaveBeenCalledWith('same-id', 'OWN');
    expect(wrapper.text()).toContain('历史订单回答');
    expect(wrapper.find('textarea').exists()).toBe(false);
    await wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === '请求日志')
      ?.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('请求日志列表');
    wrapper.unmount();
  });
  it('does not fetch unauthorized sources and ignores late responses after sign-out', async () => {
    access.accessCodes = ['ai:agent:invoke'];
    let resolve!: (rows: unknown[]) => void;
    api.agents.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const wrapper = await render();
    await flushPromises();
    expect(api.list).not.toHaveBeenCalled();
    access.accessToken = '';
    await flushPromises();
    resolve([{ id: 'other', title: '过期账号私有会话', updatedAt: '' }]);
    await flushPromises();
    expect(wrapper.text()).not.toContain('过期账号私有会话');
    expect(wrapper.text()).toContain('暂无对话记录访问权限');
    wrapper.unmount();
  });
  it('keeps the readable source available if the other source fails', async () => {
    api.agents.mockRejectedValue(new Error('unavailable'));
    const wrapper = await render();
    await flushPromises();
    expect(wrapper.text()).toContain('部分对话列表读取失败');
    expect(wrapper.text()).toContain('业务对话');
    expect(wrapper.text()).toContain('历史订单回答');
    wrapper.unmount();
  });
});
