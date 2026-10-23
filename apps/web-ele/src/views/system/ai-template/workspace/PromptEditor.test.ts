import type { HubModel } from '#/api/system/ai-model-hub';
import type { SceneDefinition, SceneModelOption } from '#/api/system/ai-scene';

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
});

describe('one editable prompt document', () => {
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
    await selectValue(wrapper, '使用模型', 'business:customer-chat');
    const changed = wrapper.emitted('change')?.at(-1)?.[0] as SceneDefinition;
    expect(changed.businessModel).toBe('customer-chat');
    expect(changed.initialModel).toBeNull();
    expect(changed.modelPolicy).toEqual(value.modelPolicy);
    wrapper.unmount();
  });
  it('keeps existing fixed-key routing untouched while editing text and exposes only the configuration jump', async () => {
    const routed: SceneDefinition = {
      ...value,
      modelPolicy: {
        ...value.modelPolicy,
        models: [
          {
            model: { modelRef: '11', configVersion: '1' },
            keyMode: 'FIXED',
            allowedKeys: [],
            fixedKey: { keyRef: 'key-a', keyVersion: '2' },
            fallbackKeys: [{ keyRef: 'key-b', keyVersion: '3' }],
          },
        ],
        fallback: true,
      },
    };
    const wrapper = mount(PromptEditor, {
      props: {
        value: routed,
        models: [],
        fields: {},
        readonly: false,
        canConfigureRouting: true,
      },
    });
    expect(wrapper.findAll('.el-select')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('上移');
    expect(wrapper.text()).not.toContain('可用Key');
    await wrapper.get('textarea').setValue('仅修改正文');
    const changed = wrapper.emitted('change')?.at(-1)?.[0] as SceneDefinition;
    expect(changed.modelPolicy).toEqual(routed.modelPolicy);
    const jump = wrapper
      .findAll('button')
      .find((button) => button.text() === '到 AI 配置调整');
    await jump?.trigger('click');
    expect(wrapper.emitted('configure')).toHaveLength(1);
    wrapper.unmount();
  });
  it('uses initialModel for a new scene without constructing or widening a routing policy', async () => {
    const models: SceneModelOption[] = [
      {
        configId: '11',
        configName: '主渠道',
        providerCode: 'openrouter',
        modelCode: 'vendor/a',
        model: { modelRef: '11', configVersion: '1' },
        streaming: true,
        outputFormats: ['TEXT'],
        usableKeyCount: 2,
      },
    ];
    const wrapper = mount(PromptEditor, {
      props: { value, models, fields: {}, readonly: false, initialModel: true },
    });
    await selectValue(wrapper, '使用模型', '11:1');
    const changed = wrapper.emitted('change')?.at(-1)?.[0] as SceneDefinition;
    expect(changed.initialModel).toEqual(models[0]?.model);
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
