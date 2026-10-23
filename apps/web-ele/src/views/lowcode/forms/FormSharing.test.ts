import type { FormDefinition } from '#/api/lowcode/forms';

import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FormSharing from './FormSharing.vue';

const api = vi.hoisted(() => ({ readSharing: vi.fn(), saveSharing: vi.fn() }));
const resolve = vi.hoisted(() =>
  vi.fn(({ params }) => ({ href: `/base/#/forms/fill/${params.token}` })),
);
vi.mock('#/api/lowcode/forms', () => api);
vi.mock('vue-router', () => ({ useRouter: () => ({ resolve }) }));
const wrappers: ReturnType<typeof mount>[] = [];
function form(id: string): FormDefinition {
  return {
    id,
    name: `表单${id}`,
    formKey: `form_${id}`,
    status: 'enabled',
    revision: 1,
    schema: { fields: [] },
    publishedVersion: 1,
    createTime: '',
    updateTime: '',
  };
}
async function render() {
  const wrapper = mount(FormSharing, {
    props: { modelValue: false, form: form('1') },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template:
            '<section v-if="modelValue"><slot /><slot name="footer" /></section>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
  return wrapper;
}
function button(wrapper: ReturnType<typeof mount>, text: string) {
  const found = wrapper
    .findAll('button')
    .find((entry) => entry.text() === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});
describe('sharing settings', () => {
  it('does not expose a late previous form token and resolves a hash/base URL in a private new tab', async () => {
    let finish: (value: unknown) => void = () => {};
    api.readSharing.mockImplementationOnce(
      () =>
        new Promise((resolveRead) => {
          finish = resolveRead;
        }),
    );
    api.readSharing.mockResolvedValueOnce({
      enabled: true,
      accessMode: 'login',
      revision: 2,
      token: 'current-token',
    });
    const wrapper = await render();
    await wrapper.setProps({ form: form('2') });
    await flushPromises();
    finish({
      enabled: true,
      accessMode: 'public',
      revision: 9,
      token: 'previous-token',
    });
    await flushPromises();
    expect(wrapper.get('a').attributes()).toMatchObject({
      href: new URL('/base/#/forms/fill/current-token', location.href).href,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(wrapper.get('input[aria-label="填写链接"]').element).toHaveProperty(
      'value',
      expect.not.stringContaining('previous-token'),
    );
    expect(resolve).toHaveBeenCalledWith({
      name: 'LowcodeSharedFill',
      params: { token: 'current-token' },
    });
  });
  it('starts disabled and login-scoped, explicitly confirms public enable and removes a revoked link', async () => {
    api.readSharing.mockResolvedValueOnce({
      enabled: false,
      accessMode: 'login',
      revision: 0,
      token: null,
    });
    api.saveSharing
      .mockResolvedValueOnce({
        enabled: true,
        accessMode: 'public',
        revision: 1,
        token: 'new-token',
      })
      .mockResolvedValueOnce({
        enabled: false,
        accessMode: 'public',
        revision: 2,
        token: null,
      });
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(
      Object.assign('confirm' as const, {
        action: 'confirm' as const,
        value: '',
      }),
    );
    const wrapper = await render();
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe(
      'false',
    );
    expect(
      wrapper.get('input[type="radio"][value="login"]').element,
    ).toHaveProperty('checked', true);
    await wrapper.get('[role="switch"]').trigger('click');
    await wrapper.get('input[type="radio"][value="public"]').setValue();
    await button(wrapper, '保存分享设置').trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.saveSharing).toHaveBeenNthCalledWith(1, '1', {
      enabled: true,
      accessMode: 'public',
      revision: 0,
      rotate: false,
    });
    expect(wrapper.find('a').exists()).toBe(true);
    await button(wrapper, '撤销链接').trigger('click');
    await flushPromises();
    expect(api.saveSharing).toHaveBeenNthCalledWith(2, '1', {
      enabled: false,
      accessMode: 'public',
      revision: 1,
      rotate: false,
    });
    expect(wrapper.find('a').exists()).toBe(false);
  });
});
