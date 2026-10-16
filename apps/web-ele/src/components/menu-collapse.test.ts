import { mount } from '@vue/test-utils';

import { describe, expect, it } from 'vitest';

import Menu from '../../../../packages/@core/ui-kit/menu-ui/src/menu.vue';

describe('uI04 collapsed navigation', () => {
  it('keeps a labelled local icon for a root group and restores its title when expanded', async () => {
    const wrapper = mount(Menu, {
      props: {
        collapse: true,
        menus: [
          {
            name: '消息中心',
            path: '/messages',
            icon: '#',
            children: [{ name: '通知公告', path: '/infra/notice' }],
          },
        ],
      },
    });
    const group = wrapper.find('[aria-label="消息中心"]');
    expect(group.exists()).toBe(true);
    expect(group.attributes('title')).toBe('消息中心');
    const content = group.findComponent({ name: 'SubMenuContent' });
    expect(content.props('isTopLevelMenuSubmenu')).toBe(true);
    expect(content.text()).not.toContain('消息中心');
    expect(content.find('svg.lucide-menu').exists()).toBe(true);
    await wrapper.setProps({ collapse: false });
    expect(
      wrapper
        .find('[aria-label="消息中心"]')
        .findComponent({ name: 'SubMenuContent' })
        .text(),
    ).toContain('消息中心');
    wrapper.unmount();
  });
});
