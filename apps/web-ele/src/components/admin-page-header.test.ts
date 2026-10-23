import { mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import AdminPageHeader from './admin-page-header.vue';

describe('administration page heading', () => {
  it('provides one semantic heading without an empty description or action group', () => {
    const wrapper = mount(AdminPageHeader, { props: { title: '字典管理' } });
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.get('h1').text()).toBe('字典管理');
    expect(wrapper.find('p').exists()).toBe(false);
    expect(wrapper.find('[role="group"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps slotted actions interactive and description text safe', async () => {
    const save = vi.fn();
    const wrapper = mount(AdminPageHeader, {
      props: { title: 'AI 配置', description: '<b>接入与模型</b>' },
      slots: { actions: '<button type="button">保存</button>' },
    });
    wrapper.get('button').element.addEventListener('click', save);
    await wrapper.get('button').trigger('click');
    expect(save).toHaveBeenCalledOnce();
    expect(wrapper.get('[aria-label="页面操作"]').text()).toBe('保存');
    expect(wrapper.get('p').text()).toBe('<b>接入与模型</b>');
    expect(wrapper.find('p b').exists()).toBe(false);
    wrapper.unmount();
  });
});
