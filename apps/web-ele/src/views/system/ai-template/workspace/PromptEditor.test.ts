import { mount } from '@vue/test-utils';

import { describe, expect, it } from 'vitest';

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
describe('one editable prompt document', () => {
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
