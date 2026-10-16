/* eslint-disable vue/one-component-per-file -- Test-only UI stubs. */
import type { ModelBinding } from '#/api/system/ai-application';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, expect, it, vi } from 'vitest';

import { applicationKeyOptions } from '#/api/system/ai-application';

import KeyPolicyEditor from './KeyPolicyEditor.vue';

vi.mock('#/api/system/ai-application', () => ({
  applicationKeyOptions: vi.fn(),
}));
vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn() },
  ...Object.fromEntries(
    ['ElAlert', 'ElButton', 'ElForm', 'ElFormItem', 'ElOption', 'ElSelect'].map(
      (name) => [name, { name, render: () => null }],
    ),
  ),
}));
const Box = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});
const Select = defineComponent({
  emits: ['change'],
  setup() {
    return () => h('select');
  },
});
const Button = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  setup(props, { slots, emit }) {
    return () =>
      h(
        'button',
        { disabled: props.disabled, onClick: () => emit('click') },
        slots.default?.(),
      );
  },
});
const binding = (): ModelBinding => ({
  model: { modelRef: '1', configVersion: '2' },
  keyMode: 'FIXED',
  allowedKeys: [],
  fixedKey: { keyRef: '10', keyVersion: '1' },
  fallbackKeys: [
    { keyRef: '11', keyVersion: '1' },
    { keyRef: '12', keyVersion: '1' },
  ],
});
function render(value = binding()) {
  return mount(KeyPolicyEditor, {
    props: { modelValue: value },
    global: {
      stubs: {
        ElAlert: Box,
        ElForm: Box,
        ElFormItem: Box,
        ElSelect: Select,
        ElOption: Box,
        ElButton: Button,
      },
    },
  });
}
beforeEach(() => vi.clearAllMocks());
it('preserves explicit fallback order and only clears it on an explicit AUTO mode change', async () => {
  const view = render();
  const down = view.findAll('button').find((item) => item.text() === '下移');
  if (!down) throw new Error('Missing order control');
  await down.trigger('click');
  const changed = view.emitted<ModelBinding[]>('update:modelValue')?.[0]?.[0];
  expect(changed?.fallbackKeys.map((item) => item.keyRef)).toEqual([
    '12',
    '11',
  ]);
  expect(changed?.fixedKey?.keyRef).toBe('10');
  view.findAllComponents(Select)[0]?.vm.$emit('change', 'AUTO');
  expect(
    view.emitted<ModelBinding[]>('update:modelValue')?.[1]?.[0],
  ).toMatchObject({ keyMode: 'AUTO', fixedKey: null, fallbackKeys: [] });
  expect(applicationKeyOptions).not.toHaveBeenCalled();
  view.unmount();
});
it('does not silently drop pinned references when current candidates cannot be read', async () => {
  vi.mocked(applicationKeyOptions).mockRejectedValue(
    new Error('private vendor details'),
  );
  const value = binding();
  value.keyMode = 'AUTO';
  value.allowedKeys = value.fallbackKeys;
  value.fixedKey = null;
  value.fallbackKeys = [];
  const view = render(value);
  await view.get('button').trigger('click');
  await flushPromises();
  view.findAllComponents(Select)[1]?.vm.$emit('change', ['11/1', '12/1']);
  expect(
    view.emitted<ModelBinding[]>('update:modelValue')?.[0]?.[0]?.allowedKeys,
  ).toEqual(value.allowedKeys);
  expect(view.text()).not.toContain('private vendor details');
  view.unmount();
});
