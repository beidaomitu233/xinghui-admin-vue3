import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus, { ElAlert } from 'element-plus';
import { describe, expect, it } from 'vitest';

import PageHint from './page-hint.vue';

describe('short page guidance', () => {
  it('keeps detailed rules folded and lets the user dismiss the banner', async () => {
    const wrapper = mount(PageHint, {
      props: { title: '简短提示', details: '操作限制仍保留' },
      global: { plugins: [ElementPlus] },
    });
    expect(wrapper.get('.el-alert__title').text()).toBe('简短提示');
    expect(wrapper.get('details').attributes('open')).toBeUndefined();
    expect(wrapper.get('summary').text()).toBe('查看说明');
    await wrapper.get('.el-alert__close-btn').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(ElAlert).emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
