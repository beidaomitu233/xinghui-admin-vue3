import { flushPromises, mount } from '@vue/test-utils';

import { addCollection } from '@vben/icons';

import ElementPlus from 'element-plus';
import collections from 'virtual:xinghui-local-icons';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FormDesigner from './FormDesigner.vue';

const api = vi.hoisted(() => ({
  createForm: vi.fn(),
  getForm: vi.fn(),
  publishForm: vi.fn(),
  updateForm: vi.fn(),
}));
vi.mock('#/api/lowcode/forms', () => api);
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: ['add', 'edit', 'query', 'publish'].map(
      (action) => `lowcode:form:${action}`,
    ),
  }),
}));
collections.forEach((collection) => addCollection(collection));
const wrappers: ReturnType<typeof mount>[] = [];
async function render(readOnly = false) {
  const wrapper = mount(FormDesigner, {
    props: { modelValue: false, readOnly },
    global: {
      plugins: [ElementPlus],
      stubs: {
        Teleport: true,
        ElDialog: {
          props: ['modelValue', 'title'],
          template:
            '<section v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>',
        },
        ElAlert: {
          props: ['title'],
          template: '<div role="alert">{{ title }}<slot /></div>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  return wrapper;
}
function button(wrapper: ReturnType<typeof mount>, label: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function input(wrapper: ReturnType<typeof mount>, label: string) {
  const found = wrapper
    .findAll('.el-form-item')
    .find(
      (item) =>
        item.find('.el-form-item__label').exists() &&
        item.find('.el-form-item__label').text() === label,
    );
  if (!found) throw new Error(`Missing field ${label}`);
  return found.get('input');
}
beforeEach(() => {
  vi.clearAllMocks();
  api.createForm.mockResolvedValue('42');
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});
describe('visual form designer', () => {
  it('has all standard palette components and saves configured canvas order/defaults', async () => {
    const wrapper = await render();
    expect(wrapper.findAll('.palette-field')).toHaveLength(7);
    await input(wrapper, '表单名称').setValue('报名表');
    await input(wrapper, '表单标识').setValue('enrollment');
    await button(wrapper, '多行文本').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.designer-field')).toHaveLength(2);
    await input(wrapper, '字段标识').setValue('notes');
    await input(wrapper, '显示名称').setValue('备注');
    await wrapper.get('.field-properties textarea').setValue('默认备注');
    const up = wrapper
      .get('.designer-field.is-selected')
      .findAll('button')
      .find((item) => item.text() === '上移');
    if (!up) throw new Error('Missing selected field move');
    await up.trigger('click');
    await flushPromises();
    expect(wrapper.find('.designer-field').text()).toContain('notes');
    await button(wrapper, '保存草稿').trigger('click');
    await flushPromises();
    const draft = api.createForm.mock.calls[0]?.[0];
    expect(draft.name).toBe('报名表');
    expect(draft.formKey).toBe('enrollment');
    expect(
      draft.schema.fields.map((field: { fieldKey: string }) => field.fieldKey),
    ).toEqual(['notes', 'field_1']);
    expect(draft.schema.fields[0]).toMatchObject({
      type: 'textarea',
      label: '备注',
      defaultValue: '默认备注',
      listVisible: true,
    });
  });
  it('keeps a rejected save draft editable and does not publish on failure', async () => {
    api.createForm.mockRejectedValueOnce(new Error('保存失败'));
    const wrapper = await render();
    await input(wrapper, '表单名称').setValue('保留草稿');
    await input(wrapper, '表单标识').setValue('draft_kept');
    await button(wrapper, '保存草稿').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('草稿已保留');
    expect((input(wrapper, '表单名称').element as HTMLInputElement).value).toBe(
      '保留草稿',
    );
    expect(api.publishForm).not.toHaveBeenCalled();
    await button(wrapper, '保存草稿').trigger('click');
    await flushPromises();
    expect(api.createForm).toHaveBeenCalledTimes(2);
  });
  it('shows actual controls on the canvas while a read-only definition cannot add or save fields', async () => {
    const wrapper = await render(true);
    expect(
      wrapper.get('.designer-field input').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper
        .findAll('.palette-field')
        .every((item) => item.attributes('disabled') !== undefined),
    ).toBe(true);
    expect(wrapper.text()).not.toContain('保存草稿');
    expect(api.createForm).not.toHaveBeenCalled();
  });
});
