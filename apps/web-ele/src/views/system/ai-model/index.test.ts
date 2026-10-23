import type { AiModelPage } from '#/api/system/ai-model';

import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';

import ElementPlus from 'element-plus';
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
import { createAiModel, listAiModels } from '#/api/system/ai-model';

import ModelPage from './index.vue';

const accessState = vi.hoisted(() => ({ codes: [] as string[] }));

vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: accessState.codes }),
}));
vi.mock('#/api/system/ai-model', () => ({
  createAiModel: vi.fn(),
  getAiModel: vi.fn(),
  listAiModels: vi.fn(),
  removeAiModel: vi.fn(),
  setAiModelEnabled: vi.fn(),
  updateAiModel: vi.fn(),
  saveAiModelCredential: vi.fn(),
  testAiModel: vi.fn(),
}));

const pages: ReturnType<typeof mount>[] = [];
function mountPage() {
  const wrapper = mount(ModelPage, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
  pages.push(wrapper);
  return wrapper;
}
beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
});
afterEach(() => {
  for (const wrapper of pages) if (wrapper.exists()) wrapper.unmount();
  pages.length = 0;
  document.body.innerHTML = '';
});
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred not initialized');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('aI model configuration page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accessState.codes = [
      'ai:model:list',
      'ai:model:query',
      'ai:model:add',
      'ai:model:edit',
      'ai:model:remove',
    ];
    vi.mocked(listAiModels).mockResolvedValue({
      records: [
        {
          id: 1,
          providerCode: 'openai',
          modelCode: 'gpt-4.1-mini',
          endpointUrl: 'https://api.example.com/v1',
          credentialEnvName: 'OPENAI_API_KEY',
          credentialMode: 'ENV',
          credentialConfigured: false,
          timeoutSeconds: 30,
          enabled: true,
          revision: 0,
          createTime: '2026-09-27T00:00:00',
          updateTime: '2026-09-27T00:00:00',
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    });
  });

  it('loads the server page and displays only the credential reference', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listAiModels).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 });
    expect(wrapper.text()).toContain('gpt-4.1-mini');
    expect(wrapper.text()).toContain('OPENAI_API_KEY');
    expect(wrapper.text()).toContain('密钥不会回显');
    expect(wrapper.text()).not.toContain('sk-live-secret-value');
  });

  it('offers retry after a list failure', async () => {
    vi.mocked(listAiModels).mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountPage();
    await flushPromises();

    const retry = wrapper
      .findAll('button')
      .find((button) => button.text().includes('重新加载'));
    expect(retry).toBeDefined();
    if (!retry) throw new Error('Reload button missing');
    await retry.trigger('click');
    await flushPromises();
    expect(listAiModels).toHaveBeenCalledTimes(2);
  });

  it('does not query the management API without the list permission', async () => {
    accessState.codes = [];
    const wrapper = mountPage();
    await flushPromises();

    expect(listAiModels).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('无模型配置查看权限');
  });
  it('coalesces a same-parameter refresh after a write and blocks double submit during async form reads', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const initialCall = vi.mocked(listAiModels).mock.results[0];
    if (initialCall?.type !== 'return')
      throw new Error('Initial native query missing');
    const original: AiModelPage = await initialCall.value;
    const slow = deferred<AiModelPage>();
    const accepted = deferred<string>();
    const originalModel = original.records[0];
    if (!originalModel) throw new Error('Initial model fixture missing');
    const updated: AiModelPage = {
      ...original,
      total: 2,
      records: [
        ...original.records,
        {
          ...originalModel,
          id: '9007199254740993123',
          modelCode: 'created-during-list',
        },
      ],
    };
    vi.mocked(listAiModels)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(updated);
    vi.mocked(createAiModel).mockReturnValueOnce(accepted.promise);
    const grid = wrapper.findComponent({ name: 'VxeGrid' });
    expect(grid.exists()).toBe(true);
    void (
      grid.vm as unknown as { commitProxy: (code: string) => Promise<unknown> }
    ).commitProxy('query');
    await flushPromises();
    expect(listAiModels).toHaveBeenCalledTimes(2);
    const create = wrapper
      .findAll('button')
      .find((button) => button.text() === '新增模型');
    if (!create) throw new Error('Create action missing');
    await create.trigger('click');
    await flushPromises();
    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][data-state="open"]',
    );
    if (!dialog) throw new Error('Native model editor missing');
    for (const [placeholder, value] of [
      ['如 openai', 'openai'],
      ['如 gpt-4.1-mini', 'created-during-list'],
      ['https://api.example.com/v1', 'https://api.example.com/v1'],
    ]) {
      const input = dialog.querySelector<HTMLInputElement>(
        `input[placeholder="${placeholder}"]`,
      );
      if (!input) throw new Error(`Input missing: ${placeholder}`);
      await new DOMWrapper(input).setValue(value);
    }
    const save = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '保存',
    );
    if (!save) throw new Error('Save action missing');
    const saveButton = new DOMWrapper(save);
    await Promise.all([
      saveButton.trigger('click'),
      saveButton.trigger('click'),
    ]);
    await flushPromises();
    expect(createAiModel).toHaveBeenCalledTimes(1);
    accepted.resolve('9007199254740993123');
    await flushPromises();
    slow.resolve(original);
    await flushPromises();
    await vi.waitFor(() => expect(listAiModels).toHaveBeenCalledTimes(3));
    expect(wrapper.text()).toContain('created-during-list');
    expect(createAiModel).toHaveBeenCalledTimes(1);
  });
});
