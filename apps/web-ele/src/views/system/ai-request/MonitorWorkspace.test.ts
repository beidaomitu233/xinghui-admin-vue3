import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import MonitorWorkspace from './MonitorWorkspace.vue';

const access = vi.hoisted(() => ({ accessCodes: [] as string[] }));
const summary = vi.hoisted(() => vi.fn());
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));
vi.mock('#/api/system/ai-scene', () => ({ getSceneMonitor: summary }));
vi.mock('../ai-config/KeySettingsPanel.vue', () => ({
  default: { template: '<div data-keys>Key 设置内容</div>' },
}));
vi.mock('./RequestLogPanel.vue', () => ({
  default: {
    name: 'ControlledLogs',
    props: ['controlledFilters'],
    template: '<div data-logs>授权请求日志</div>',
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  access.accessCodes = [];
  summary.mockResolvedValue({
    observedAt: '2026-10-17T00:00:00Z',
    window: { from: '2026-10-16T00:00:00Z', to: '2026-10-17T00:00:00Z' },
    scope: 'OWN',
    requestKind: 'BUSINESS',
    keyCards: {
      enabledKeyVersions: null,
      recentlyFailedKeyVersions: null,
      unavailableReason: 'NO_CONFIGURATION_QUERY',
    },
    calls: { requests: 7, modelAttempts: 9 },
  });
});
const drawer = {
  props: ['modelValue'],
  template: '<section v-if="modelValue"><slot /></section>',
};
describe('monitor permissions and unknown metrics', () => {
  it('opens Key settings for config-only access without requesting logs or global statistics', async () => {
    access.accessCodes = ['ai:config:list', 'ai:config:query'];
    const wrapper = mount(MonitorWorkspace, {
      props: { initialKeySettings: true },
      global: { stubs: { ElDrawer: drawer } },
    });
    await flushPromises();
    expect(wrapper.find('[data-keys]').exists()).toBe(true);
    expect(wrapper.find('[data-logs]').exists()).toBe(false);
    expect(summary).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('keeps unknown Key counts distinct from zero and scopes calls to OWN by default', async () => {
    access.accessCodes = ['ai:request:list'];
    const wrapper = mount(MonitorWorkspace, {
      global: { stubs: { ElDrawer: drawer } },
    });
    await flushPromises();
    expect(summary).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'OWN',
        requestKind: 'BUSINESS',
      }),
    );
    expect(
      wrapper.findAll('article strong').map((item) => item.text()),
    ).toEqual(['—', '—', '7', '9']);
    expect(wrapper.find('option[value="AUDIT"]').exists()).toBe(false);
    expect(wrapper.find('[data-keys]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('applies the same scope, type, scene, model, result and time to cards and the log panel', async () => {
    access.accessCodes = ['ai:request:list', 'ai:request:audit'];
    const wrapper = mount(MonitorWorkspace, {
      global: { stubs: { ElDrawer: drawer } },
    });
    await flushPromises();
    await wrapper.get('input[aria-label="筛选场景"]').setValue('scene.a');
    await wrapper.get('input[aria-label="筛选模型"]').setValue('model-1');
    await wrapper.get('select[aria-label="请求类型"]').setValue('TEST');
    await flushPromises();
    const query = summary.mock.calls.at(-1)?.[0];
    const filters = wrapper
      .getComponent({ name: 'ControlledLogs' })
      .props('controlledFilters');
    expect(query).toMatchObject({
      requestKind: 'TEST',
      sceneKey: 'scene.a',
      modelRef: 'model-1',
      scope: 'OWN',
    });
    const { result, ...common } = query;
    expect(filters).toEqual({ ...common, status: result });
    wrapper.unmount();
  });
});
