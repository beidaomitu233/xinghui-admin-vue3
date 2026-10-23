import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus from 'element-plus';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { initComponentAdapter } from '#/adapter/component';
import { initSetupVbenForm } from '#/adapter/form';

import { newField } from './form-schema';
import RuntimeFields from './RuntimeFields.vue';

beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
});
describe('business schema on real Native Vben Form', () => {
  it('shows required/optional marks accurately and submits zero and false as valid values', async () => {
    const number = {
      ...newField(1),
      fieldKey: 'amount',
      label: '必填数字',
      type: 'number' as const,
      required: true,
    };
    const toggle = {
      ...newField(2),
      fieldKey: 'enabled',
      label: '必填开关',
      type: 'switch' as const,
      required: true,
    };
    const optional = { ...newField(3), fieldKey: 'note', label: '可选文本' };
    const wrapper = mount(RuntimeFields, {
      props: {
        schema: { fields: [number, toggle, optional] },
        modelValue: { amount: 0, enabled: false, note: null },
      },
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.find('[role=switch]').exists()).toBe(true),
    );
    const labels = wrapper.findAll('label');
    expect(
      labels.find((item) => item.text().includes('必填数字'))?.text(),
    ).toContain('*');
    expect(
      labels.find((item) => item.text().includes('必填开关'))?.text(),
    ).toContain('*');
    expect(
      labels.find((item) => item.text().includes('可选文本'))?.text(),
    ).not.toContain('*');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { amount: 0, enabled: false, note: null },
    ]);
    wrapper.unmount();
  });
  it('replaces schema controls without leaking a removed field into submitted values', async () => {
    const wrapper = mount(RuntimeFields, {
      props: {
        schema: { fields: [{ ...newField(1), fieldKey: 'old_field' }] },
        modelValue: { old_field: '历史值' },
      },
      global: { plugins: [ElementPlus] },
    });
    await flushPromises();
    await wrapper.setProps({
      schema: {
        fields: [
          {
            ...newField(2),
            fieldKey: 'new_field',
            label: '新字段',
            required: true,
          },
        ],
      },
      modelValue: { new_field: '新值' },
    });
    await flushPromises();
    await vi.waitFor(() =>
      expect(wrapper.get('input').element).toHaveProperty('value', '新值'),
    );
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { new_field: '新值' },
    ]);
    expect(wrapper.text()).not.toContain('old_field');
    wrapper.unmount();
  });
});
