import { flushPromises, mount } from '@vue/test-utils';

import { ElOption, ElSelect } from 'element-plus';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initComponentAdapter } from '#/adapter/component';
import { initSetupVbenForm } from '#/adapter/form';

import SceneDataSelector from './SceneDataSelector.vue';

const api = vi.hoisted(() => ({
  sceneDataCatalog: vi.fn(),
  sceneDataFields: vi.fn(),
  sceneDataForms: vi.fn(),
}));
const access = vi.hoisted(() => ({ accessCodes: [] as string[] }));
vi.mock('#/api/system/ai-scene-data', () => api);
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
});
beforeEach(() => {
  vi.clearAllMocks();
  access.accessCodes = ['lowcode:record:query'];
  api.sceneDataCatalog.mockResolvedValue({
    objects: [
      { objectKey: 'lowcode.record', name: '业务记录', description: '' },
    ],
    inputVariables: [{ name: 'user_request', label: '用户要求' }],
  });
  api.sceneDataForms.mockResolvedValue({
    records: [{ formId: '42', name: '售后记录', schemaVersion: 3 }],
    total: '1',
    pageNum: 1,
    pageSize: 20,
  });
  api.sceneDataFields.mockResolvedValue({
    fields: [
      {
        fieldKey: 'subject',
        label: '记录标题',
        type: 'text',
        nullable: true,
        variableName: 'record_subject',
      },
    ],
  });
});
describe('authorized scene data selector', () => {
  it('uses named candidates, emits only controlled form/field identity and only selected field variables', async () => {
    const wrapper = mount(SceneDataSelector, {
      props: { fixedFormId: null, readonly: false, value: [] },
    });
    await flushPromises();
    const select = wrapper.findComponent(ElSelect);
    expect(
      select.findAllComponents(ElOption).map((option) => option.props('label')),
    ).toContain('售后记录');
    select.vm.$emit('change', '42');
    await flushPromises();
    expect(wrapper.emitted('change')?.[0]).toEqual([
      [{ objectKey: 'lowcode.record', formId: '42', fields: [] }],
    ]);
    await wrapper.setProps({
      value: [{ objectKey: 'lowcode.record', formId: '42', fields: [] }],
    });
    await flushPromises();
    expect(api.sceneDataFields).toHaveBeenCalledWith({
      formId: '42',
      objectKey: 'lowcode.record',
    });
    expect(wrapper.text()).not.toContain('internal_note');
    expect(wrapper.emitted('variables')?.at(-1)).toEqual([
      [{ name: 'user_request', label: '用户要求' }],
    ]);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([
      [{ objectKey: 'lowcode.record', formId: '42', fields: ['subject'] }],
    ]);
    await wrapper.setProps({
      value: [
        { objectKey: 'lowcode.record', formId: '42', fields: ['subject'] },
      ],
    });
    expect(wrapper.emitted('variables')?.at(-1)).toEqual([
      [
        { name: 'user_request', label: '用户要求' },
        { name: 'record_subject', label: '记录标题' },
      ],
    ]);
    wrapper.unmount();
  });
  it('does not query business candidates without record query permission', async () => {
    access.accessCodes = [];
    const wrapper = mount(SceneDataSelector, {
      props: { fixedFormId: '42', readonly: false, value: [] },
    });
    await flushPromises();
    expect(api.sceneDataForms).not.toHaveBeenCalled();
    expect(api.sceneDataFields).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('没有业务记录查询权限');
    wrapper.unmount();
  });
  it('ignores late field responses after switching the bound form', async () => {
    let finish: ((result: unknown) => void) | undefined;
    api.sceneDataFields.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = mount(SceneDataSelector, {
      props: { fixedFormId: '42', readonly: true, value: [] },
    });
    await flushPromises();
    await wrapper.setProps({ fixedFormId: '43' });
    await flushPromises();
    finish?.({
      fields: [
        {
          fieldKey: 'summary',
          label: '旧表单字段',
          variableName: 'record_summary',
        },
      ],
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain('旧表单字段');
    expect(wrapper.findComponent(ElSelect).props('disabled')).toBe(true);
    wrapper.unmount();
  });
});
