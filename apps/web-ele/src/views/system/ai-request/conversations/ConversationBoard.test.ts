import type {
  ConversationAcceptance,
  ConversationDraft,
  ConversationItem,
} from './view-model';

import { flushPromises, mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import { selectValue } from '#/test-utils/element-controls';

import ConversationBoard from './ConversationBoard.vue';
import { ConversationSendFailure } from './view-model';

function item(key = 'conversation-private-1'): ConversationItem {
  return {
    key,
    title: '本周订单讨论',
    sceneKey: 'scene-internal-1',
    sceneLabel: '订单分析',
    sourceLabel: '销售订单',
    excerpt: '按地区继续汇总',
    state: 'idle',
    updatedAt: '2026-10-18T01:00:00Z',
  };
}
async function render() {
  const submit = vi.fn<
    (draft: ConversationDraft) => Promise<ConversationAcceptance>
  >(async () => ({ conversationKey: item().key }));
  const wrapper = mount(ConversationBoard, {
    props: {
      canCancel: true,
      canCreate: true,
      canReply: true,
      canSettings: true,
      conversations: [item()],
      historyUnavailable: false,
      listLoading: false,
      messageLoading: false,
      messages: [],
      readonlyReason: '',
      scenes: [{ key: 'scene-internal-1', label: '订单分析' }],
      selected: item(),
      submit,
      working: false,
    },
    slots: { details: '次要请求统计' },
  });
  // Let Element Plus finish its queued textarea measurement before a test changes or disposes the view.
  await flushPromises();
  return { submit, wrapper };
}
function deferred() {
  let resolve: ((value: ConversationAcceptance) => void) | undefined;
  const promise = new Promise<ConversationAcceptance>((yes) => {
    resolve = yes;
  });
  return {
    promise,
    resolve: (value: ConversationAcceptance) => resolve?.(value),
  };
}
describe('conversation presentation and scoped draft state', () => {
  it('uses title-only search and read-only audit empty-state wording', async () => {
    const { wrapper } = await render();
    await wrapper.setProps({
      scope: 'AUDIT',
      selected: null,
      canReply: false,
      canCreate: false,
    });
    expect(wrapper.text()).toContain('审计对话');
    expect(wrapper.text()).toContain('请选择会话');
    expect(wrapper.text()).not.toContain('开始新对话');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('input[placeholder="搜索对话标题"]').exists()).toBe(
      true,
    );
    await flushPromises();
    wrapper.unmount();
  });
  it('renders readable continuous turns and incomplete failures without exposing internal IDs or claiming a complete answer', async () => {
    const { wrapper } = await render();
    await wrapper.setProps({
      messages: [
        {
          key: 'm1',
          role: 'user',
          state: 'complete',
          body: '订单有哪些变化？',
          createdAt: '2026-10-18T01:00:00Z',
        },
        {
          key: 'm2',
          role: 'assistant',
          state: 'complete',
          body: '订单总量增加。',
          createdAt: '2026-10-18T01:00:01Z',
        },
        {
          key: 'm3',
          role: 'user',
          state: 'complete',
          body: '继续按地区分析',
          createdAt: '2026-10-18T01:01:00Z',
        },
        {
          key: 'm4',
          role: 'assistant',
          state: 'partial',
          body: '华东地区…',
          failure: '连接中断',
          createdAt: '2026-10-18T01:01:01Z',
        },
      ],
    });
    expect(wrapper.findAll('article').map((node) => node.text())).toHaveLength(
      4,
    );
    expect(wrapper.text()).toContain('订单总量增加。');
    expect(wrapper.text()).toContain('继续按地区分析');
    expect(wrapper.text()).toContain('未完成的回答');
    expect(wrapper.text()).toContain('不会作为完整回答使用');
    expect(wrapper.text()).not.toContain('conversation-private-1');
    expect(wrapper.text()).not.toContain('scene-internal-1');
    expect(
      wrapper.get('details.conversation-details').attributes('open'),
    ).toBeUndefined();
    await flushPromises();
    wrapper.unmount();
  });
  it('retains a follow-up draft until admission is confirmed and never invents an assistant reply', async () => {
    const { wrapper, submit } = await render();
    const admission = deferred();
    submit.mockReturnValueOnce(admission.promise);
    await wrapper.get('textarea').setValue('继续解释原因');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      conversationKey: item().key,
      sceneKey: 'scene-internal-1',
      text: '继续解释原因',
    });
    expect(wrapper.get('textarea').element).toHaveProperty(
      'value',
      '继续解释原因',
    );
    expect(wrapper.findAll('article')).toHaveLength(0);
    admission.resolve({ conversationKey: item().key });
    await flushPromises();
    expect(wrapper.get('textarea').element).toHaveProperty('value', '');
    await flushPromises();
    wrapper.unmount();
  });
  it('retries an uncertain send with its exact original token and content while preserving newly typed text', async () => {
    const { wrapper, submit } = await render();
    submit.mockRejectedValueOnce(new Error('lost admission'));
    await wrapper.get('textarea').setValue('原追问');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    await wrapper.get('textarea').setValue('下一条尚未发送的追问');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    expect(submit.mock.calls[1]?.[0]).toEqual(submit.mock.calls[0]?.[0]);
    expect(wrapper.get('textarea').element).toHaveProperty(
      'value',
      '下一条尚未发送的追问',
    );
    await flushPromises();
    wrapper.unmount();
  });
  it('does not erase another conversation draft when an earlier send completes late', async () => {
    const { wrapper, submit } = await render();
    const admission = deferred();
    submit.mockReturnValueOnce(admission.promise);
    await wrapper.get('textarea').setValue('第一段会话的问题');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    await wrapper.setProps({ selected: item('conversation-private-2') });
    await wrapper.get('textarea').setValue('另一段会话的草稿');
    admission.resolve({ conversationKey: item().key });
    await flushPromises();
    expect(wrapper.get('textarea').element).toHaveProperty(
      'value',
      '另一段会话的草稿',
    );
    await wrapper.setProps({ selected: item() });
    expect(wrapper.get('textarea').element).toHaveProperty('value', '');
    await flushPromises();
    wrapper.unmount();
  });
  it('starts with a named scene and carries a newer unsent draft into the accepted new conversation', async () => {
    const { wrapper, submit } = await render();
    const admission = deferred();
    submit.mockReturnValueOnce(admission.promise);
    await wrapper.setProps({ selected: null });
    await selectValue(wrapper, '对话场景', 'scene-internal-1');
    await wrapper.get('textarea').setValue('第一问');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    await wrapper.get('textarea').setValue('第二问草稿');
    admission.resolve({ conversationKey: 'created-conversation' });
    await flushPromises();
    await wrapper.setProps({ selected: item('created-conversation') });
    expect(wrapper.get('textarea').element).toHaveProperty(
      'value',
      '第二问草稿',
    );
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      conversationKey: null,
      text: '第一问',
    });
    await flushPromises();
    wrapper.unmount();
  });
  it('blocks impersonated follow-ups in audit-only views while keeping the transcript visible', async () => {
    const { wrapper, submit } = await render();
    await wrapper.setProps({
      canReply: false,
      readonlyReason: '审计查看不可代替会话主人续聊',
      messages: [
        {
          key: 'm1',
          role: 'user',
          state: 'complete',
          body: '可读的历史问题',
          createdAt: '2026-10-18T01:00:00Z',
        },
      ],
    });
    expect(wrapper.text()).toContain('可读的历史问题');
    expect(wrapper.text()).toContain('审计查看不可代替会话主人续聊');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    await flushPromises();
    wrapper.unmount();
  });
  it('allows a corrected fresh send after a definitive rejection and marks old unrecorded history honestly', async () => {
    const { wrapper, submit } = await render();
    submit.mockRejectedValueOnce(
      new ConversationSendFailure('rejected', '请补充问题'),
    );
    await wrapper.get('textarea').setValue('原问题');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    await wrapper.get('textarea').setValue('修正后的问题');
    await wrapper.get('form.conversation-composer').trigger('submit');
    await flushPromises();
    expect(submit.mock.calls[1]?.[0].token).not.toBe(
      submit.mock.calls[0]?.[0].token,
    );
    await wrapper.setProps({ historyUnavailable: true });
    expect(wrapper.text()).toContain('旧记录未保留对话');
    await flushPromises();
    wrapper.unmount();
  });
});
