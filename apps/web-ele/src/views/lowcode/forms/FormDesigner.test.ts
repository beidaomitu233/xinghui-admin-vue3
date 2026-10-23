import { flushPromises, mount } from '@vue/test-utils';

import { addCollection } from '@vben/icons';

import ElementPlus from 'element-plus';
import collections from 'virtual:xinghui-local-icons';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { initComponentAdapter } from '#/adapter/component';
import { initSetupVbenForm } from '#/adapter/form';

import FormDesigner from './FormDesigner.vue';

const api = vi.hoisted(() => ({
  createForm: vi.fn(),
  getForm: vi.fn(),
  publishForm: vi.fn(),
  updateForm: vi.fn(),
}));
vi.mock('#/api/lowcode/forms', () => api);
vi.mock('@vben/common-ui', async (importOriginal) => {
  const actual = await importOriginal<object>();
  const { useModalPort } = await import('#/test-utils/popup-port');
  return { ...actual, useVbenModal: useModalPort };
});
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: ['add', 'edit', 'query', 'publish'].map(
      (action) => `lowcode:form:${action}`,
    ),
  }),
}));
collections.forEach((collection) => addCollection(collection));
beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
});
const wrappers: ReturnType<typeof mount>[] = [];
async function render(readOnly = false) {
  const wrapper = mount(FormDesigner, {
    props: { modelValue: false, readOnly },
    global: { plugins: [ElementPlus], stubs: { Teleport: true } },
  });
  wrappers.push(wrapper);
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  if (!readOnly)
    await vi.waitFor(
      () => expect(wrapper.find('._fc-designer').exists()).toBe(true),
      { timeout: 15_000 },
    );
  await flushPromises();
  return wrapper;
}
function button(wrapper: ReturnType<typeof mount>, label: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function input(wrapper: ReturnType<typeof mount>, label: string) {
  const node = wrapper
    .findAll('label')
    .find((item) => item.text().replaceAll('*', '').trim() === label);
  if (!node) throw new Error(`Missing label ${label}`);
  const id = node.attributes('for');
  if (id) {
    const control = wrapper.find(`input[id="${id}"],textarea[id="${id}"]`);
    if (control.exists()) return control;
  }
  const element = node.element
    .closest('.el-form-item')
    ?.querySelector('input,textarea');
  const found = wrapper
    .findAll('input,textarea')
    .find((item) => item.element === element);
  if (!found) throw new Error(`Missing control ${label}`);
  return found;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.createForm.mockResolvedValue('42');
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

vi.setConfig({ testTimeout: 20_000 });
describe('native visual form designer', () => {
  it('uses the official seven-component palette and saves native canvas order, configured defaults and field identity', async () => {
    const wrapper = await render();
    expect(wrapper.findAll('._fc-l-item')).toHaveLength(7);
    await input(wrapper, '表单名称').setValue('报名表');
    await input(wrapper, '表单标识').setValue('enrollment');
    const palette = wrapper
      .findAll('._fc-l-item')
      .find((item) => item.text().includes('多行文本'));
    if (!palette) throw new Error('Native palette missing textarea');
    await palette.trigger('click');
    await flushPromises();
    expect(wrapper.findAll('._fd-drag-tool')).toHaveLength(2);
    await input(wrapper, '字段标识').setValue('notes');
    await input(wrapper, '字段标识').trigger('blur');
    await flushPromises();
    await input(wrapper, '字段名称').setValue('备注');
    await input(wrapper, '默认值').setValue('默认备注');
    await flushPromises();
    const methods = wrapper.getComponent({ name: 'FcDesigner' })
      .vm as unknown as {
      getRule: () => unknown[];
      setRule: (rules: unknown[]) => void;
    };
    // Exercise the library's own reorder/export boundary; browser acceptance also exercises native dragging.
    methods.setRule(methods.getRule().toReversed());
    await flushPromises();
    await button(wrapper, '保存草稿').trigger('click');
    await flushPromises();
    const draft = api.createForm.mock.calls[0]?.[0];
    expect(draft).toMatchObject({ name: '报名表', formKey: 'enrollment' });
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
  it('keeps a rejected draft editable and does not publish on failure', async () => {
    api.createForm.mockRejectedValueOnce(new Error('保存失败'));
    const wrapper = await render();
    await input(wrapper, '表单名称').setValue('保留草稿');
    await input(wrapper, '表单标识').setValue('draft_kept');
    await button(wrapper, '保存草稿').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('草稿已保留');
    expect(input(wrapper, '表单名称').element).toHaveProperty(
      'value',
      '保留草稿',
    );
    expect(api.publishForm).not.toHaveBeenCalled();
    await button(wrapper, '保存草稿').trigger('click');
    await flushPromises();
    expect(api.createForm).toHaveBeenCalledTimes(2);
  });
  it('sends one create when two save clicks arrive during asynchronous native validation', async () => {
    let complete: (id: string) => void = () => {};
    api.createForm.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    );
    const wrapper = await render();
    await input(wrapper, '表单名称').setValue('单次创建');
    await input(wrapper, '表单标识').setValue('single_create');
    const save = button(wrapper, '保存草稿');
    await Promise.all([save.trigger('click'), save.trigger('click')]);
    await flushPromises();
    expect(api.createForm).toHaveBeenCalledTimes(1);
    complete('42');
    await flushPromises();
    expect(api.createForm).toHaveBeenCalledTimes(1);
  });

  it('shows disabled native controls and exposes neither a canvas palette nor saving for read-only detail', async () => {
    const wrapper = await render(true);
    expect(wrapper.findAll('input').length).toBeGreaterThan(0);
    expect(
      wrapper
        .findAll('input')
        .every((item) => item.attributes('disabled') !== undefined),
    ).toBe(true);
    expect(wrapper.find('._fc-designer').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('保存草稿');
    expect(api.createForm).not.toHaveBeenCalled();
  });
});
