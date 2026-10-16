/* eslint-disable vue/one-component-per-file -- Lightweight view test stubs. */
import type { AiPage } from '#/api/system/ai-application';
import type { RequestLogRow } from '#/api/system/ai-request-log';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exportRequestLogs,
  listRequestLogs,
  requestLogStatistics,
} from '#/api/system/ai-request-log';

import RequestLogPanel from './RequestLogPanel.vue';

const access = vi.hoisted(() => ({ codes: [] as string[] }));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: access.codes }),
}));
vi.mock('#/api/system/ai-request-log', () => ({
  exportRequestLogs: vi.fn(),
  getRequestLog: vi.fn(),
  listRequestLogs: vi.fn(),
  requestLogStatistics: vi.fn(),
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn() },
  ElLoadingDirective: { mounted: () => {}, updated: () => {} },
  ...Object.fromEntries(
    [
      'ElAlert',
      'ElButton',
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
const Box = defineComponent({
  props: {
    title: { type: String, default: '' },
    label: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h('div', [props.title, props.label, slots.default?.(), slots.footer?.()]);
  },
});
const Select = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'select',
        {
          value: props.modelValue,
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value;
            emit('update:modelValue', value);
            emit('change', value);
          },
        },
        slots.default?.(),
      );
  },
});
const Option = defineComponent({
  props: {
    label: { type: String, default: '' },
    value: { type: String, default: '' },
  },
  setup(props) {
    return () => h('option', { value: props.value }, props.label);
  },
});
const Table = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props) {
    return () => h('pre', { 'data-rows': '' }, JSON.stringify(props.data));
  },
});
const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) {
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
function row(subject: string): RequestLogRow {
  return {
    appName: 'fixture',
    elapsedMs: 1,
    subjectRef: subject,
    tenantRef: 'fixture',
    request: {
      appId: '1',
      appVersionId: '11',
      attemptCount: 1,
      businessId: '1:7',
      businessType: 'lowcode.record',
      createdAt: '2026-10-16T08:00:00Z',
      deadline: '2026-10-16T08:01:00Z',
      draftRevision: null,
      errorCode: null,
      finishedAt: null,
      inputTokens: null,
      kind: 'BUSINESS',
      outputStarted: true,
      outputTokens: 0,
      requestId: '9007199254740993',
      stage: 'FINISHED',
      status: 'SUCCEEDED',
      usageKnown: false,
    },
  };
}
const page = (subject: string): AiPage<RequestLogRow> => ({
  records: [row(subject)],
  total: 1,
  pageNum: 1,
  pageSize: 20,
});
function mountPanel() {
  return mount(RequestLogPanel, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        ElAlert: Box,
        ElButton: Button,
        ElDatePicker: Box,
        ElDescriptions: Box,
        ElDescriptionsItem: Box,
        ElDialog: Box,
        ElForm: Box,
        ElFormItem: Box,
        ElInput: Box,
        ElOption: Option,
        ElPagination: Box,
        ElSelect: Select,
        ElTable: Table,
        ElTableColumn: Box,
      },
    },
  });
}
describe('request log scope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    access.codes = ['ai:request:list'];
    vi.mocked(listRequestLogs).mockResolvedValue(page('own-subject'));
    vi.mocked(requestLogStatistics).mockResolvedValue({
      requests: 1,
      businessRequests: 1,
      testRequests: 0,
      modelAttempts: 1,
      knownInputTokens: null,
      knownOutputTokens: 0,
      unknownInputAttempts: 1,
      unknownOutputAttempts: 0,
    });
  });
  it('discards a deferred audit export after switching to own before it can create a file', async () => {
    access.codes.push('ai:request:audit', 'ai:request:export');
    let resolveExport: ((value: RequestLogRow[]) => void) | undefined;
    vi.mocked(exportRequestLogs).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        }),
    );
    const create = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
    const wrapper = mountPanel();
    try {
      await flushPromises();
      await wrapper.findAll('select')[0]?.setValue('AUDIT');
      await flushPromises();
      const download = wrapper
        .findAll('button')
        .find((button) => button.text() === '导出 JSON');
      expect(download).toBeDefined();
      await download?.trigger('click');
      await flushPromises();
      expect(exportRequestLogs).toHaveBeenCalledOnce();
      await wrapper.findAll('select')[0]?.setValue('OWN');
      await flushPromises();
      resolveExport?.([row('must-not-download-audit')]);
      await flushPromises();
      expect(create).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });
  it('defaults to own scope and never offers audit without the independent permission', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    expect(vi.mocked(listRequestLogs).mock.calls[0]?.[0].scope).toBe('OWN');
    expect(
      wrapper.findAll('option').map((option) => option.attributes('value')),
    ).not.toContain('AUDIT');
    expect(wrapper.text()).toContain('未知 / 0');
    expect(wrapper.get('[data-rows]').text()).toContain('9007199254740993');
    wrapper.unmount();
  });
  it('requires an explicit audit switch and discards a late audit response after returning to own', async () => {
    access.codes.push('ai:request:audit');
    let resolveAudit: ((value: AiPage<RequestLogRow>) => void) | undefined;
    vi.mocked(listRequestLogs).mockImplementation(async (query) =>
      query.scope === 'AUDIT'
        ? new Promise((resolve) => {
            resolveAudit = resolve;
          })
        : page('own-subject'),
    );
    const wrapper = mountPanel();
    await flushPromises();
    expect(vi.mocked(listRequestLogs).mock.calls[0]?.[0].scope).toBe('OWN');
    await wrapper.findAll('select')[0]?.setValue('AUDIT');
    await flushPromises();
    await wrapper.findAll('select')[0]?.setValue('OWN');
    await flushPromises();
    resolveAudit?.(page('must-not-display-late-audit'));
    await flushPromises();
    expect(wrapper.get('[data-rows]').text()).toContain('own-subject');
    expect(wrapper.get('[data-rows]').text()).not.toContain(
      'must-not-display-late-audit',
    );
    expect(
      vi.mocked(listRequestLogs).mock.calls.map(([query]) => query.scope),
    ).toEqual(['OWN', 'AUDIT', 'OWN']);
    wrapper.unmount();
  });
});
