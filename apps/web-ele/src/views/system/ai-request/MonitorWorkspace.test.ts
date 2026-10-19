import { flushPromises, mount } from '@vue/test-utils';

import { ElOption } from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { selectControl, selectValue } from '#/test-utils/element-controls';

import MonitorWorkspace from './MonitorWorkspace.vue';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

const access = vi.hoisted(() => ({
  accessCodes: [] as string[],
  accessToken: 'session-a',
}));
const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  start: vi.fn(),
  followup: vi.fn(),
  scenes: vi.fn(),
  fields: vi.fn(),
  records: vi.fn(),
  stream: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => router,
}));
vi.mock('#/api/request', () => ({ requestClient: { get: api.scenes } }));
vi.mock('#/api/system/ai-conversation', () => ({
  listConversations: api.list,
  getConversation: api.detail,
  startConversation: api.start,
  continueConversation: api.followup,
}));
vi.mock('#/api/system/ai-application', () => ({
  subscribeAiRequest: api.stream,
}));
vi.mock('#/api/system/ai-scene', () => ({ cancelSceneRequest: vi.fn() }));
vi.mock('#/api/system/ai-database', () => ({
  databaseFields: api.fields,
  databaseRecords: api.records,
}));
vi.mock('#/api/system/ai-call-log', () => ({
  listCallLogs: vi.fn().mockResolvedValue({ records: [], total: '0' }),
  callLogStatistics: vi.fn().mockResolvedValue({ calls: '0' }),
  getCallLog: vi.fn(),
  exportCallLogs: vi.fn(),
}));
vi.mock('../ai-config/SimpleSettingsPanel.vue', () => ({
  default: { template: '<div data-keys>Key 与模型</div>' },
}));
const summary = {
  conversationId: 'private-conversation',
  title: '订单讨论',
  sceneKey: 'orders',
  sceneName: '订单分析',
  kind: 'BUSINESS',
  businessRef: null,
  sourceLabel: '销售业务',
  revision: 2,
  status: 'SUCCEEDED',
  lastMessage: '已分析',
  updatedAt: '2026-10-18T00:00:00Z',
  history: 'COMPLETE',
  canContinue: true,
};
const messages = [
  {
    messageId: 'u1',
    sequence: 1,
    role: 'USER',
    content: '统计订单',
    status: 'SUCCEEDED',
    requestId: 'r1',
    sceneVersionId: 'v1',
    partial: false,
    createdAt: summary.updatedAt,
  },
  {
    messageId: 'a1',
    sequence: 2,
    role: 'ASSISTANT',
    content: '已保存的完整回答',
    status: 'SUCCEEDED',
    requestId: 'r1',
    sceneVersionId: 'v1',
    partial: false,
    createdAt: summary.updatedAt,
  },
];
const drawer = {
  props: ['modelValue'],
  template: '<section v-if="modelValue"><slot /></section>',
};
const render = (keys = false) =>
  mount(MonitorWorkspace, {
    props: { initialKeySettings: keys },
    global: { stubs: { ElDrawer: drawer } },
  });
const click = async (wrapper: ReturnType<typeof render>, text: string) => {
  const button = wrapper
    .findAll('button')
    .find((item) => item.text().includes(text));
  expect(button).toBeTruthy();
  if (!button) throw new Error('BUTTON_MISSING');
  await button.trigger('click');
  await flushPromises();
};
beforeEach(() => {
  vi.clearAllMocks();
  access.accessCodes = ['ai:request:list', 'ai:scene:invoke'];
  api.list.mockResolvedValue({
    records: [summary],
    total: '1',
    pageNum: 1,
    pageSize: 20,
  });
  api.detail.mockResolvedValue({
    conversation: summary,
    messages,
    notice: null,
  });
  api.scenes.mockResolvedValue([
    {
      sceneKey: 'orders',
      name: '订单分析',
      revision: 1,
      canStartFromMonitor: true,
      contextRequired: false,
    },
  ]);
});
describe('persisted conversation workspace', () => {
  it('retains the conversation instance and unsent draft across log tabs', async () => {
    const wrapper = render();
    await flushPromises();
    await click(wrapper, '订单讨论');
    expect(wrapper.find('.monitor-workspace > .monitor-pane').exists()).toBe(
      true,
    );
    const draft = wrapper.get('textarea[aria-label="消息内容"]');
    await draft.setValue('尚未发送的追问');
    const original = draft.element;
    await click(wrapper, '请求日志');
    expect(
      (wrapper.get('.monitor-conversations').element as HTMLElement).style
        .display,
    ).toBe('none');
    expect(wrapper.get('textarea[aria-label="消息内容"]').element).toBe(
      original,
    );
    await click(wrapper, '我的对话');
    expect(
      (wrapper.get('.monitor-conversations').element as HTMLElement).style
        .display,
    ).not.toBe('none');
    expect(
      (
        wrapper.get('textarea[aria-label="消息内容"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe('尚未发送的追问');
    expect(api.followup).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each([
    { codes: ['ai:scene:invoke'], label: 'invoke only' },
    {
      codes: ['ai:scene:invoke', 'ai:request:audit'],
      label: 'invoke and audit without list',
    },
  ])(
    'loads only the own index for $label without gaining management actions',
    async ({ codes }) => {
      access.accessCodes = codes;
      const wrapper = render();
      await flushPromises();
      expect(api.list).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'OWN' }),
      );
      await click(wrapper, '订单讨论');
      expect(api.detail).toHaveBeenCalledWith(summary.conversationId, 'OWN');
      expect(wrapper.text()).toContain('已保存的完整回答');
      expect(wrapper.find('textarea[aria-label="消息内容"]').exists()).toBe(
        true,
      );
      expect(wrapper.find('select[aria-label="会话范围"]').exists()).toBe(
        false,
      );
      expect(wrapper.text()).not.toContain('Key 与模型');
      expect(api.scenes.mock.calls.every(([url]) => url === '/ai/scenes')).toBe(
        true,
      );
      expect(
        api.list.mock.calls.every(([query]) => query.scope === 'OWN'),
      ).toBe(true);
      wrapper.unmount();
    },
  );
  it('shows streamed deltas and reconciles them with the persisted answer', async () => {
    let receive:
      | ((event: { sequence: number; text?: string; type: string }) => void)
      | undefined;
    let finish: (() => void) | undefined;
    api.stream.mockImplementation(async (_id, callback) => {
      receive = callback;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    api.detail.mockResolvedValueOnce({
      conversation: { ...summary, status: 'RUNNING' },
      messages: [
        messages[0],
        { ...messages[1], status: 'RUNNING', content: '' },
      ],
      notice: null,
    });
    const wrapper = render();
    await flushPromises();
    await click(wrapper, '订单讨论');
    receive?.({ sequence: 1, type: 'delta', text: '实时回答' });
    await flushPromises();
    expect(wrapper.text()).toContain('实时回答');
    finish?.();
    await flushPromises();
    expect(wrapper.text()).toContain('已保存的完整回答');
    expect(wrapper.text()).not.toContain('实时回答');
    wrapper.unmount();
  });
  it('requires a named CURRENT record and submits the exact returned business reference', async () => {
    const businessRef = {
      type: 'database.record',
      id: 'server-returned-token',
    };
    api.scenes.mockResolvedValue([
      {
        sceneKey: 'orders',
        name: '订单分析',
        canStartFromMonitor: true,
        contextRequired: true,
        contextSourceKey: 'db.orders',
        contextSourceLabel: '销售订单',
      },
    ]);
    api.fields.mockResolvedValue({
      fields: [{ field: 'title', label: '订单名称', type: 'text' }],
      primaryKey: ['id'],
    });
    api.records.mockResolvedValue({
      records: [
        {
          key: { id: 42 },
          label: '十月采购订单',
          values: { title: '十月采购订单' },
          businessRef,
        },
      ],
      truncated: false,
    });
    api.start.mockResolvedValue({
      conversationId: summary.conversationId,
      revision: 1,
      status: 'SUCCEEDED',
      requestId: 'r2',
    });
    const wrapper = render();
    await flushPromises();
    await selectValue(wrapper, '对话场景', 'orders');
    await flushPromises();
    await wrapper
      .get('textarea[aria-label="消息内容"]')
      .setValue('分析当前订单');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    expect(api.start).not.toHaveBeenCalled();
    await selectValue(wrapper, '业务记录', '0');
    await flushPromises();
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    expect(api.start).toHaveBeenCalledWith(
      expect.objectContaining({
        businessRef,
        message: '分析当前订单',
        sceneKey: 'orders',
      }),
    );
    wrapper.unmount();
  });
  it('opens Key settings for config-only access without reading conversations', async () => {
    access.accessCodes = ['ai:config:list'];
    const wrapper = render(true);
    await flushPromises();
    expect(router.replace).toHaveBeenCalledWith('/ai/configurations');
    expect(wrapper.find('[data-keys]').exists()).toBe(false);
    expect(api.list).not.toHaveBeenCalled();
    expect(api.scenes).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('reads full persisted messages and sends followups with the original revision', async () => {
    const wrapper = render();
    await flushPromises();
    await click(wrapper, '订单讨论');
    expect(wrapper.text()).toContain('已保存的完整回答');
    expect(wrapper.text()).toContain('统计订单');
    api.followup.mockResolvedValue({
      conversationId: summary.conversationId,
      revision: 3,
      status: 'SUCCEEDED',
      requestId: 'r2',
    });
    await wrapper
      .get('textarea[aria-label="消息内容"]')
      .setValue('再按地区分析');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    expect(api.followup).toHaveBeenCalledWith(
      summary.conversationId,
      expect.objectContaining({ expectedRevision: 2, message: '再按地区分析' }),
    );
    expect(api.start).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('keeps audit history readable with no composer or impersonated followup', async () => {
    access.accessCodes.push('ai:request:audit');
    const wrapper = render();
    await flushPromises();
    await selectValue(wrapper, '会话范围', 'AUDIT');
    await flushPromises();
    await click(wrapper, '订单讨论');
    expect(api.detail).toHaveBeenLastCalledWith(
      summary.conversationId,
      'AUDIT',
    );
    expect(wrapper.text()).toContain('已保存的完整回答');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(api.followup).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('only offers scenes explicitly authorized for direct start', async () => {
    api.scenes.mockResolvedValue([
      {
        sceneKey: 'hidden',
        name: '业务入口专用',
        canStartFromMonitor: false,
        contextRequired: true,
      },
      {
        sceneKey: 'safe',
        name: '通用问答',
        canStartFromMonitor: true,
        contextRequired: false,
      },
    ]);
    const wrapper = render();
    await flushPromises();
    const options = selectControl(wrapper, '对话场景')
      .findAllComponents(ElOption)
      .map((option) => option.props('value'));
    expect(options).not.toContain('hidden');
    expect(options).toContain('safe');
    wrapper.unmount();
  });
});
