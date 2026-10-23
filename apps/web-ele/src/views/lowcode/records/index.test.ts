/* eslint-disable vue/one-component-per-file -- Parent-view regression uses test-local UI stubs. */
import type {
  FormRecord,
  FormRecordRow,
  RuntimeDefinition,
} from '#/api/lowcode/forms';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';

import { beforeEach, expect, it, vi } from 'vitest';

import {
  addRecord,
  getRecord,
  getRuntime,
  listRecords,
  updateRecord,
} from '#/api/lowcode/forms';
import { recordSummaryScene } from '#/api/system/ai-scene';

import { newField } from '../form-schema';
import Records from './index.vue';

const context = vi.hoisted(() => ({
  route: { params: { formId: '1' } },
  access: { accessCodes: [] as string[] },
  form: {
    values: {} as Record<string, unknown>,
    schema: [] as {
      component: string;
      componentProps?: Record<string, unknown>;
      fieldName: string;
    }[],
  },
}));
vi.mock('vue-router', () => ({
  useRoute: () => context.route,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => context.access }));
vi.mock('@vben/common-ui', async (importOriginal) => {
  const actual = await importOriginal<object>();
  const { defineComponent, h, reactive, ref } = await import('vue');
  return {
    ...actual,
    Page: { template: '<main><slot /></main>' },
    useVbenModal(options: Record<string, any>) {
      const opened = ref(false);
      const settings = reactive({ ...options });
      const api = {
        setState: (state: Record<string, unknown>) =>
          Object.assign(settings, state),
        lock: vi.fn(),
        unlock: vi.fn(),
        open() {
          opened.value = true;
          options.onOpenChange?.(true);
        },
        close() {
          if (options.onBeforeClose?.() === false) return;
          opened.value = false;
          options.onOpenChange?.(false);
        },
      };
      return [
        defineComponent({
          setup(_, { slots }) {
            return () =>
              opened.value
                ? h('aside', [
                    slots.default?.(),
                    slots.footer?.(),
                    settings.showConfirmButton === false
                      ? null
                      : h(
                          'button',
                          { onClick: () => options.onConfirm?.() },
                          String(settings.confirmText || '确认'),
                        ),
                  ])
                : null;
          },
        }),
        api,
      ];
    },
  };
});
vi.mock('#/adapter/form', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useVbenForm() {
    return [
      { name: 'NativeRecordFormPort', render: () => null },
      {
        setState(state: { schema?: typeof context.form.schema }) {
          if (state.schema) context.form.schema = state.schema;
        },
        async resetForm({ values }: { values: Record<string, unknown> }) {
          context.form.values = structuredClone(values);
        },
        async getValues() {
          return context.form.values;
        },
        async setFieldValue(key: string, value: unknown) {
          context.form.values[key] = value;
        },
        validate: async () => ({ valid: true }),
      },
    ];
  },
}));
vi.mock('#/adapter/vxe-table', async () => {
  const { defineComponent, h, onMounted, ref } = await import('vue');
  return {
    useVbenVxeGrid(options: Record<string, any>) {
      const rows = ref<FormRecordRow[]>([]);
      const api = {
        formApi: { updateSchema: vi.fn(), setFieldValue: vi.fn() },
        grid: { setCurrentPage: async () => {} },
        setGridOptions: vi.fn(),
        async query() {
          const result = await options.gridOptions.proxyConfig.ajax.query(
            { page: { currentPage: 1, pageSize: 10 }, sort: {} },
            {},
          );
          rows.value = result.items;
        },
      };
      return [
        defineComponent({
          setup(_, { slots }) {
            onMounted(() => api.query());
            return () =>
              h('section', [
                slots['toolbar-actions']?.(),
                ...rows.value.map((row) => slots.actions?.({ row })),
              ]);
          },
        }),
        api,
      ];
    },
  };
});
vi.mock('#/api/lowcode/forms', () =>
  Object.fromEntries(
    [
      'addRecord',
      'getRecord',
      'getRuntime',
      'listRecords',
      'removeRecord',
      'updateRecord',
    ].map((name) => [name, vi.fn()]),
  ),
);
vi.mock('#/api/system/ai-scene', () => ({
  recordSummaryScene: vi.fn(),
}));
vi.mock('./AiSummaryDialog.vue', () => ({
  default: {
    name: 'AiSummaryDialog',
    props: [
      'sceneKey',
      'formId',
      'recordId',
      'fields',
      'modelValue',
      'writable',
    ],
    emits: ['adopt', 'update:modelValue'],
    template: '<section data-summary-dialog />',
  },
}));
vi.mock('../RuntimeFields.vue', () => ({
  default: {
    name: 'RuntimeFields',
    props: ['modelValue', 'schema', 'disabled'],
    render: () => null,
  },
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
  ElLoadingDirective: { mounted: () => {}, updated: () => {} },
  ...Object.fromEntries(
    [
      'ElAlert',
      'ElButton',
      'ElCard',
      'ElDatePicker',
      'ElDescriptions',
      'ElDescriptionsItem',
      'ElDialog',
      'ElForm',
      'ElFormItem',
      'ElInput',
      'ElOption',
      'ElPagination',
      'ElSelect',
      'ElTable',
      'ElTableColumn',
    ].map((name) => [name, { name, render: () => null }]),
  ),
}));

let row: FormRecordRow;
let original: FormRecord;
let current: RuntimeDefinition;
const Box = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.footer?.()]);
  },
});
const Column = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.({ row }));
  },
});
const Dialog = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('aside', [slots.default?.(), slots.footer?.()])
        : null;
  },
});
const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { slots, emit }) {
    return () =>
      h(
        'button',
        {
          disabled: props.disabled || props.loading,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});
const Alert = defineComponent({
  props: { title: { type: String, default: '' }, closable: Boolean },
  emits: ['close'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', { 'data-alert': '' }, [
        props.title,
        slots.default?.(),
        props.closable
          ? h('button', { onClick: () => emit('close') }, '关闭提示')
          : null,
      ]);
  },
});
function render() {
  return mount(Records, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        ElAlert: Alert,
        ElButton: Button,
        ElCard: Box,
        ElDatePicker: Box,
        ElDescriptions: Box,
        ElDescriptionsItem: Box,
        ElDialog: Dialog,
        ElForm: Box,
        ElFormItem: Box,
        ElInput: Box,
        ElOption: Box,
        ElPagination: Box,
        ElSelect: Box,
        ElTable: Box,
        ElTableColumn: Column,
      },
    },
  });
}
type View = ReturnType<typeof render>;
function summary(view: View) {
  const button = view
    .findAll('button')
    .find((item) => item.text() === 'AI 摘要');
  if (!button) throw new Error('Summary action missing');
  return button;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Not initialized');
  };
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  context.route = reactive({ params: { formId: '1' } });
  context.access = reactive({
    accessCodes: [
      'ai:scene:invoke',
      'lowcode:record:list',
      'lowcode:record:query',
      'lowcode:record:edit',
    ],
  });
  row = {
    id: '7',
    formId: '1',
    schemaVersion: 1,
    revision: 0,
    tenantId: 'tenant-a',
    creator: '101',
    createTime: '',
    updateTime: '',
    data: { old_summary: 'Original record' },
  };
  original = {
    ...row,
    schema: {
      fields: [
        {
          ...newField(1),
          fieldKey: 'old_summary',
          label: 'Historical text',
          type: 'textarea',
          maxLength: 1500,
        },
      ],
    },
  };
  current = {
    id: '1',
    name: 'Current form',
    status: 'enabled',
    schemaVersion: 2,
    schema: {
      fields: [
        {
          ...newField(1),
          fieldKey: 'new_summary',
          label: 'Current text',
          maxLength: 200,
        },
      ],
    },
  };
  vi.mocked(getRuntime).mockImplementation(async (id) => ({ ...current, id }));
  vi.mocked(listRecords).mockResolvedValue({
    records: [row],
    total: '1',
    pageNum: 1,
    pageSize: 10,
  });
  vi.mocked(recordSummaryScene).mockResolvedValue({
    sceneKey: '11',
    currentVersionId: '12',
    name: 'Summary scene',
    kind: 'RECORD_SUMMARY',
    formId: '1',
    revision: 1,
    availability: { state: 'READY', reasons: [] },
  });
  vi.mocked(getRecord).mockResolvedValue(original);
});

it('loads an actual detail before mounting summary and passes its historical schema instead of the current form schema', async () => {
  const detail = deferred<FormRecord>();
  vi.mocked(getRecord).mockReturnValue(detail.promise);
  const view = render();
  await flushPromises();
  expect(row).not.toHaveProperty('schema');
  await summary(view).trigger('click');
  await flushPromises();
  expect(getRecord).toHaveBeenCalledWith('1', '7');
  expect(view.findComponent({ name: 'AiSummaryDialog' }).exists()).toBe(false);
  detail.resolve(original);
  await flushPromises();
  const dialog = view.getComponent({ name: 'AiSummaryDialog' });
  expect(dialog.props()).toMatchObject({
    sceneKey: '11',
    formId: '1',
    recordId: '7',
    modelValue: true,
    fields: original.schema.fields,
  });
  expect(dialog.props('fields')).not.toEqual(current.schema.fields);
  expect(original.schemaVersion).toBe(1);
  expect(current.schemaVersion).toBe(2);
  expect(view.find('main').exists()).toBe(true);
  expect(addRecord).not.toHaveBeenCalled();
  expect(updateRecord).not.toHaveBeenCalled();
  view.unmount();
});

it('keeps the parent usable and shows a dismissible short error for failed or invalid details without a current-schema fallback', async () => {
  const view = render();
  await flushPromises();
  const noSchema = structuredClone(original);
  Reflect.deleteProperty(noSchema, 'schema');
  for (const detail of [
    null,
    noSchema,
    { ...original, id: '8' },
    { ...original, schemaVersion: 2 },
  ]) {
    if (detail) vi.mocked(getRecord).mockResolvedValueOnce(detail);
    else
      vi.mocked(getRecord).mockRejectedValueOnce(
        new Error('private raw detail failure'),
      );
    await summary(view).trigger('click');
    await flushPromises();
    expect(view.findComponent({ name: 'AiSummaryDialog' }).exists()).toBe(
      false,
    );
    expect(view.text()).toContain('记录读取失败，请重试。');
    expect(view.text()).not.toContain('private raw detail failure');
    expect(view.find('main').exists()).toBe(true);
    const close = view
      .findAll('button')
      .find((item) => item.text() === '关闭提示');
    if (!close) throw new Error('Dismiss action missing');
    await close.trigger('click');
    expect(view.text()).not.toContain('记录读取失败，请重试。');
  }
  expect(addRecord).not.toHaveBeenCalled();
  expect(updateRecord).not.toHaveBeenCalled();
  view.unmount();
});

it('discards detail responses after route or query permission changes', async () => {
  const detail = deferred<FormRecord>();
  vi.mocked(getRecord).mockReturnValue(detail.promise);
  const view = render();
  await flushPromises();
  await summary(view).trigger('click');
  context.route.params.formId = '2';
  await flushPromises();
  detail.resolve(original);
  await flushPromises();
  expect(view.findComponent({ name: 'AiSummaryDialog' }).exists()).toBe(false);
  context.route.params.formId = '1';
  await flushPromises();
  const later = deferred<FormRecord>();
  vi.mocked(getRecord).mockReturnValue(later.promise);
  await summary(view).trigger('click');
  context.access.accessCodes = ['lowcode:record:list'];
  await flushPromises();
  context.access.accessCodes.push('lowcode:record:query');
  await flushPromises();
  later.resolve(original);
  await flushPromises();
  expect(view.findComponent({ name: 'AiSummaryDialog' }).exists()).toBe(false);
  expect(view.text()).not.toContain('记录读取失败，请重试。');
  view.unmount();
});

it.each(['route', 'query', 'edit'] as const)(
  'discards pending summary adoption after %s changes even when permissions return',
  async (change) => {
    const view = render();
    await flushPromises();
    await summary(view).trigger('click');
    await flushPromises();
    const detail = deferred<FormRecord>();
    vi.mocked(getRecord).mockReturnValueOnce(detail.promise);
    view
      .getComponent({ name: 'AiSummaryDialog' })
      .vm.$emit('adopt', 'old_summary', 'Adopted text');
    await flushPromises();
    expect(getRecord).toHaveBeenLastCalledWith('1', '7');
    if (change === 'route') context.route.params.formId = '2';
    else
      context.access.accessCodes = context.access.accessCodes.filter(
        (code) => code !== `lowcode:record:${change}`,
      );
    await flushPromises();
    if (change !== 'route') {
      context.access.accessCodes.push(`lowcode:record:${change}`);
      await flushPromises();
    }
    detail.resolve(original);
    await flushPromises();
    expect(view.findComponent({ name: 'NativeRecordFormPort' }).exists()).toBe(
      false,
    );
    expect(view.find('aside').exists()).toBe(false);
    expect(addRecord).not.toHaveBeenCalled();
    expect(updateRecord).not.toHaveBeenCalled();
    view.unmount();
  },
);

it('does not let a pending summary adoption overwrite a newer detail opening', async () => {
  const view = render();
  await flushPromises();
  await summary(view).trigger('click');
  await flushPromises();
  const detail = deferred<FormRecord>();
  vi.mocked(getRecord)
    .mockReturnValueOnce(detail.promise)
    .mockResolvedValueOnce({
      ...original,
      revision: 1,
      data: { old_summary: 'Fresh detail' },
    });
  view
    .getComponent({ name: 'AiSummaryDialog' })
    .vm.$emit('adopt', 'old_summary', 'Stale adopted text');
  await flushPromises();
  const showDetail = view
    .findAll('button')
    .find((button) => button.text() === '详情');
  if (!showDetail) throw new Error('Detail action missing');
  await showDetail.trigger('click');
  await flushPromises();
  detail.resolve(original);
  await flushPromises();
  expect(view.findComponent({ name: 'NativeRecordFormPort' }).exists()).toBe(
    false,
  );
  expect(view.text()).toContain('Fresh detail');
  expect(view.text()).not.toContain('Stale adopted text');
  expect(updateRecord).not.toHaveBeenCalled();
  view.unmount();
});

it('adopts into the validated current editor draft using historical fields without saving', async () => {
  const view = render();
  await flushPromises();
  await summary(view).trigger('click');
  await flushPromises();
  view
    .getComponent({ name: 'AiSummaryDialog' })
    .vm.$emit('adopt', 'old_summary', 'Current adopted text');
  await flushPromises();
  expect(view.findComponent({ name: 'NativeRecordFormPort' }).exists()).toBe(
    true,
  );
  expect(context.form.values).toEqual({
    old_summary: 'Current adopted text',
  });
  expect(context.form.schema.map((field) => field.fieldName)).toEqual(
    original.schema.fields.map((field) => field.fieldKey),
  );
  expect(context.form.schema.map((field) => field.fieldName)).not.toEqual(
    current.schema.fields.map((field) => field.fieldKey),
  );
  expect(context.form.schema[0]).toMatchObject({
    component: 'Input',
    componentProps: { type: 'textarea', maxlength: 1500 },
  });
  expect(addRecord).not.toHaveBeenCalled();
  expect(updateRecord).not.toHaveBeenCalled();
  view.unmount();
});

it('saves an edited historical record once and closes after unlocking the native modal', async () => {
  const pending = deferred<FormRecord>();
  vi.mocked(updateRecord).mockReturnValueOnce(pending.promise);
  const view = render();
  await flushPromises();
  const edit = view
    .findAll('button')
    .find((button) => button.text() === '编辑');
  if (!edit) throw new Error('Missing edit');
  await edit.trigger('click');
  await flushPromises();
  const save = view
    .findAll('button')
    .find((button) => button.text() === '保存记录');
  if (!save) throw new Error('Missing native confirm');
  await Promise.all([save.trigger('click'), save.trigger('click')]);
  await flushPromises();
  expect(updateRecord).toHaveBeenCalledTimes(1);
  expect(updateRecord).toHaveBeenCalledWith('1', '7', {
    schemaVersion: 1,
    revision: 0,
    data: original.data,
  });
  pending.resolve(original);
  await flushPromises();
  expect(view.find('aside').exists()).toBe(false);
  view.unmount();
});

it('closes a saving editor on route invalidation and ignores the late result', async () => {
  const pending = deferred<FormRecord>();
  vi.mocked(updateRecord).mockReturnValueOnce(pending.promise);
  const view = render();
  await flushPromises();
  const edit = view
    .findAll('button')
    .find((button) => button.text() === '编辑');
  if (!edit) throw new Error('Missing edit');
  await edit.trigger('click');
  await flushPromises();
  const save = view
    .findAll('button')
    .find((button) => button.text() === '保存记录');
  if (!save) throw new Error('Missing native confirm');
  await save.trigger('click');
  await flushPromises();
  context.route.params.formId = '2';
  await flushPromises();
  expect(view.find('aside').exists()).toBe(false);
  pending.resolve(original);
  await flushPromises();
  expect(view.find('aside').exists()).toBe(false);
  expect(updateRecord).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('rejects invalid adoption details without opening an editor with fallback schema', async () => {
  const view = render();
  await flushPromises();
  await summary(view).trigger('click');
  await flushPromises();
  const noSchema = structuredClone(original);
  Reflect.deleteProperty(noSchema, 'schema');
  for (const invalid of [
    noSchema,
    { ...original, id: '8' },
    { ...original, formId: '2' },
    { ...original, schemaVersion: 2 },
    { ...original, revision: -1 },
  ]) {
    vi.mocked(getRecord).mockResolvedValueOnce(invalid);
    view
      .getComponent({ name: 'AiSummaryDialog' })
      .vm.$emit('adopt', 'old_summary', 'Should not adopt');
    await flushPromises();
    expect(view.findComponent({ name: 'NativeRecordFormPort' }).exists()).toBe(
      false,
    );
    expect(view.text()).toContain('记录读取失败，请重试。');
  }
  expect(addRecord).not.toHaveBeenCalled();
  expect(updateRecord).not.toHaveBeenCalled();
  view.unmount();
});
