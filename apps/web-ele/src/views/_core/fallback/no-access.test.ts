import { mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import NoAccessPage from './no-access.vue';

const { logout } = vi.hoisted(() => ({
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('#/store', () => ({ useAuthStore: () => ({ logout }) }));

describe('no access page', () => {
  it('explains missing permissions and lets the user log out', async () => {
    const wrapper = mount(NoAccessPage, {
      global: {
        stubs: {
          Page: {
            props: ['title'],
            template: '<div>{{ title }}<slot /></div>',
          },
          'el-button': { template: '<button><slot /></button>' },
        },
      },
    });

    expect(wrapper.text()).toContain('暂无可访问页面');
    expect(wrapper.text()).toContain('联系管理员分配角色和菜单权限');
    await wrapper.find('button').trigger('click');
    expect(logout).toHaveBeenCalledWith(false);
  });
});
