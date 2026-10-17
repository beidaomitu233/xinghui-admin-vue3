import type { SceneDefinition, SceneModelOption } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import { selectValue } from '#/test-utils/element-controls';

import PromptEditor from './PromptEditor.vue';

const keys = vi.hoisted(() => vi.fn());
vi.mock('#/api/system/ai-scene', () => ({ sceneKeys: keys }));

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
describe('one editable prompt document', () => {
  it('selects multiple channels and a named key subset, then reorders automatic fallback priority', async () => {
    keys.mockResolvedValue([
      {
        key: { keyRef: 'key-a', keyVersion: '2' },
        maskedLabel: '主账号 · ••••1234',
      },
      {
        key: { keyRef: 'key-b', keyVersion: '3' },
        maskedLabel: '备用账号 · ••••5678',
      },
    ]);
    const models: SceneModelOption[] = ['11', '12'].map((id, index) => ({
      configId: id,
      configName: index === 0 ? '主渠道' : '备用渠道',
      providerCode: 'openrouter',
      modelCode: 'vendor/shared',
      model: { modelRef: id, configVersion: '1' },
      streaming: true,
      outputFormats: ['TEXT'],
      usableKeyCount: 2,
    }));
    const wrapper = mount(PromptEditor, {
      props: { value, models, fields: {}, readonly: false },
    });
    await selectValue(wrapper, '渠道与模型', ['11:1', '12:1']);
    const chosen = wrapper.emitted('change')?.at(-1)?.[0] as SceneDefinition;
    expect(
      chosen.modelPolicy.models.map((binding) => binding.model.modelRef),
    ).toEqual(['11', '12']);
    expect(chosen.modelPolicy.fallback).toBe(true);
    await wrapper.setProps({ value: chosen });
    await flushPromises();
    expect(wrapper.text()).toContain('主渠道');
    expect(wrapper.text()).toContain('备用渠道');
    await selectValue(wrapper, '组合 1 可用Key', ['key-b:3']);
    const restricted = wrapper
      .emitted('change')
      ?.at(-1)?.[0] as SceneDefinition;
    expect(restricted.modelPolicy.models[0]).toMatchObject({
      keyMode: 'AUTO',
      allowedKeys: [{ keyRef: 'key-b', keyVersion: '3' }],
      fixedKey: null,
    });
    await wrapper.setProps({ value: restricted });
    await wrapper
      .get('button[aria-label="降低组合 1 优先级"]')
      .trigger('click');
    const reordered = wrapper.emitted('change')?.at(-1)?.[0] as SceneDefinition;
    expect(
      reordered.modelPolicy.models.map((binding) => binding.model.modelRef),
    ).toEqual(['12', '11']);
    expect(reordered.modelPolicy.models[1]?.allowedKeys).toEqual([
      { keyRef: 'key-b', keyVersion: '3' },
    ]);
    wrapper.unmount();
  });
  it('shows historical instructions losslessly without saving on first read', () => {
    const wrapper = mount(PromptEditor, {
      props: { value, models: [], fields: {}, readonly: false },
    });
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
    await wrapper.get('input').setValue('新名称');
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({
      name: '新名称',
      promptText: `${value.promptText}\n\n输出要求：\n${value.outputRequirement}`,
      outputRequirement: '',
    });
    wrapper.unmount();
  });
});
