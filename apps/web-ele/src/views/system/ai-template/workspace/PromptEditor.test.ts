import type { HubModel } from '#/api/system/ai-model-hub';
import type { SceneDefinition } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';

import { beforeAll, describe, expect, it } from 'vitest';

import { initComponentAdapter } from '#/adapter/component';
import { initSetupVbenForm } from '#/adapter/form';
import { selectValue } from '#/test-utils/element-controls';

import PromptEditor from './PromptEditor.vue';

const value = {
  name: '问答',
  purpose: '',
  promptText: '读取{{user_request}}',
  outputRequirement: '  保留旧格式\n及空格  ',
  dataObjects: [],
  modelPolicy: {
    mode: 'FIXED' as const,
    models: [],
    fallback: false,
    outputFormat: 'TEXT' as const,
    timeoutSeconds: 30,
    maxAttempts: 2,
    maxConcurrent: 2,
    maxTokens: 1024,
  },
};
beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
  // 表单 Input/Select 是 defineAsyncComponent，预热门模块避免冷加载时 DOM 未渲染。
  await Promise.all([
    import('element-plus/es/components/input/index'),
    import('element-plus/es/components/input/style/css'),
    import('element-plus/es/components/select-v2/index'),
    import('element-plus/es/components/select-v2/style/css'),
  ]);
});

describe('one editable prompt document', () => {
  it('edits Agent instructions while tools provide its business context', async () => {
    const wrapper = mount(PromptEditor, {
      props: {
        value: {
          ...value,
          promptText: '按当前业务权限自主规划并执行任务。',
          outputRequirement: '',
        },
        agent: true,
        models: [],
        fields: {},
        readonly: false,
      },
      slots: { data: '<div data-testid="data-picker">数据引用</div>' },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="data-picker"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Agent 系统提示词');
    expect(wrapper.get('textarea').attributes('placeholder')).toContain(
      'AI 工作台',
    );
    await wrapper.get('textarea').setValue('管理业务任务，并汇报实际结果。');
    const changed = wrapper.emitted('change')?.at(-1)?.[0] as SceneDefinition;
    expect(changed.promptText).toBe('管理业务任务，并汇报实际结果。');
    expect(changed.modelPolicy).toEqual(value.modelPolicy);
    wrapper.unmount();
  });
  it('selects a stable business model identity for a new scene without creating a provider/key route', async () => {
    const model: HubModel = {
      modelId: 'business-1',
      revision: 1,
      name: '客服模型',
      slug: 'customer-chat',
      capabilities: '',
      contextWindow: '',
      enabled: true,
      strategy: 'PRIORITY',
      fallback: true,
      routes: [],
      health: {
        ready: false,
        readyRoutes: 0,
        distinctProviders: 0,
        multiProviderProtected: false,
        reasons: [],
      },
      updatedAt: '2026-10-18T01:00:00Z',
    };
    const wrapper = mount(PromptEditor, {
      props: {
        value,
        models: [],
        businessModels: [model],
        fields: {},
        readonly: false,
        initialModel: true,
      },
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '选择模型与顺序')
      ?.trigger('click');
    await selectValue(wrapper, '添加调用模型', 'customer-chat');
    const changed = wrapper.emitted('change')?.at(-1)?.[0] as SceneDefinition;
    expect(changed.businessModels).toEqual(['customer-chat']);
    expect(changed.initialModel).toBeNull();
    expect(changed.modelPolicy).toEqual(value.modelPolicy);
    wrapper.unmount();
  });
  it('shows historical instructions losslessly without saving on first read', async () => {
    const wrapper = mount(PromptEditor, {
      props: { value, models: [], fields: {}, readonly: false },
    });
    await flushPromises();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      `${value.promptText}\n\n输出要求：\n${value.outputRequirement}`,
    );
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.findAll('textarea')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('输出格式');
    wrapper.unmount();
  });
  it('keeps historical instructions in the prompt when another property is edited', async () => {
    const wrapper = mount(PromptEditor, {
      props: { value, models: [], fields: {}, readonly: false },
    });
    await flushPromises();
    await wrapper.get('input[aria-label="场景名称"]').setValue('新名称');
    await flushPromises();
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({
      name: '新名称',
      promptText: `${value.promptText}\n\n输出要求：\n${value.outputRequirement}`,
      outputRequirement: '',
    });
    wrapper.unmount();
  });
});
