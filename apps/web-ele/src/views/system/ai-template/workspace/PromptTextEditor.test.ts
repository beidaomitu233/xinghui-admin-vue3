import { flushPromises, mount } from '@vue/test-utils';

import { describe, expect, it } from 'vitest';

import PromptTextEditor from './PromptTextEditor.vue';

function render(value = '甲乙丙丁', readonly = false) {
  return mount(PromptTextEditor, {
    props: {
      modelValue: value,
      readonly,
      variables: [
        { name: 'order', label: '订单' },
        { name: 'user_request', label: '用户要求' },
        { name: '旧变量', label: '历史名称' },
      ],
    },
  });
}
describe('plain-text prompt editor with safe variable highlighting', () => {
  it('does not merge separate caret positions into one undo step', async () => {
    const wrapper = render('甲乙');
    const input = wrapper.get('textarea');
    input.element.setSelectionRange(2, 2);
    await input.trigger('beforeinput', { inputType: 'insertText' });
    input.element.value = '甲乙丙';
    input.element.setSelectionRange(3, 3);
    await input.trigger('input', { inputType: 'insertText' });
    input.element.setSelectionRange(0, 0);
    await input.trigger('select');
    await input.trigger('beforeinput', { inputType: 'insertText' });
    input.element.value = '丁甲乙丙';
    input.element.setSelectionRange(1, 1);
    await input.trigger('input', { inputType: 'insertText' });
    await input.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(input.element.value).toBe('甲乙丙');
    await input.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(input.element.value).toBe('甲乙');
    wrapper.unmount();
  });
  it('preserves old and bilingual tokens and renders HTML input as inert text', () => {
    const text =
      '{{user_request}} {{旧变量}} {{order:订单}} <img src=x onerror=alert(1)><script>alert(2)</script>';
    const wrapper = render(text);
    expect(
      wrapper.findAll('.prompt-token').map((token) => token.text()),
    ).toEqual(['{{user_request}}', '{{旧变量}}', '{{order:订单}}']);
    expect(wrapper.get('textarea').element.value).toBe(text);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
  it('keeps composition readable and emits a completed Chinese composition only once', async () => {
    const wrapper = render('甲乙');
    const input = wrapper.get('textarea');
    input.element.setSelectionRange(1, 1);
    await input.trigger('compositionstart');
    input.element.value = '甲客乙';
    await input.trigger('input', {
      inputType: 'insertCompositionText',
      isComposing: true,
    });
    input.element.setSelectionRange(2, 2);
    await input.trigger('beforeinput', {
      inputType: 'insertCompositionText',
      isComposing: true,
    });
    input.element.value = '甲客户甲乙';
    await input.trigger('input', {
      inputType: 'insertCompositionText',
      isComposing: true,
    });
    input.element.setSelectionRange(4, 4);
    expect(wrapper.classes()).toContain('is-composing');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await input.trigger('compositionend');
    await input.trigger('input', { inputType: 'insertCompositionText' });
    expect(wrapper.classes()).not.toContain('is-composing');
    expect(wrapper.emitted('update:modelValue')).toEqual([['甲客户甲乙']]);
    await input.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(input.element.value).toBe('甲乙');
    expect(input.element.selectionStart).toBe(1);
    wrapper.unmount();
  });
  it('preserves the live IME draft and selection during an asynchronous variable metadata rerender', async () => {
    const wrapper = render('甲乙');
    const input = wrapper.get('textarea');
    input.element.setSelectionRange(1, 1);
    await input.trigger('compositionstart');
    input.element.value = '甲客乙';
    input.element.setSelectionRange(2, 2);
    await input.trigger('input', {
      inputType: 'insertCompositionText',
      isComposing: true,
    });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await Promise.resolve();
    await wrapper.setProps({
      readonly: false,
      variables: [
        { name: 'order', label: '更新后的订单说明' },
        { name: 'customer', label: '新读取的客户说明' },
      ],
    });
    expect(input.element.value).toBe('甲客乙');
    expect(input.element.selectionStart).toBe(2);
    expect(input.element.selectionEnd).toBe(2);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    input.element.value = '甲客户乙';
    input.element.setSelectionRange(3, 3);
    await input.trigger('input', {
      inputType: 'insertCompositionText',
      isComposing: true,
    });
    await input.trigger('compositionend');
    await input.trigger('input', { inputType: 'insertText' });
    expect(input.element.value).toBe('甲客户乙');
    expect(input.element.selectionStart).toBe(3);
    expect(wrapper.emitted('update:modelValue')).toEqual([['甲客户乙']]);
    await input.trigger('keydown', { key: 'z', ctrlKey: true });
    await flushPromises();
    expect(input.element.value).toBe('甲乙');
    expect(input.element.selectionStart).toBe(1);
    wrapper.unmount();
  });
  it('replaces the selected range with a bilingual token and restores exact text and caret through undo and redo', async () => {
    const wrapper = render();
    const input = wrapper.get('textarea');
    input.element.setSelectionRange(1, 3);
    await wrapper.vm.insertVariable('order');
    await flushPromises();
    expect(input.element.value).toBe('甲{{order:订单}}丁');
    expect(input.element.selectionStart).toBe('甲{{order:订单}}'.length);
    await input.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(input.element.value).toBe('甲乙丙丁');
    expect(input.element.selectionStart).toBe(1);
    expect(input.element.selectionEnd).toBe(3);
    await input.trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
    expect(input.element.value).toBe('甲{{order:订单}}丁');
    wrapper.unmount();
  });
  it('keeps pasted multiline text literal and supports the browser history input events', async () => {
    const wrapper = render('');
    const input = wrapper.get('textarea');
    await input.trigger('beforeinput', { inputType: 'insertFromPaste' });
    input.element.value = '第一行\n{{order:订单}}\n<b>纯文本</b>';
    await input.trigger('input', { inputType: 'insertFromPaste' });
    expect(wrapper.find('b').exists()).toBe(false);
    await input.trigger('beforeinput', { inputType: 'historyUndo' });
    expect(input.element.value).toBe('');
    await input.trigger('beforeinput', { inputType: 'historyRedo' });
    expect(input.element.value).toBe('第一行\n{{order:订单}}\n<b>纯文本</b>');
    wrapper.unmount();
  });
  it('synchronizes the highlight viewport without changing text or selection', async () => {
    const wrapper = render('订单\n'.repeat(80));
    const input = wrapper.get('textarea');
    input.element.setSelectionRange(5, 9);
    input.element.scrollTop = 120;
    input.element.scrollLeft = 8;
    await input.trigger('scroll');
    const mirror = wrapper.get('pre').element;
    expect(mirror.scrollTop).toBe(120);
    expect(mirror.scrollLeft).toBe(8);
    expect(input.element.selectionStart).toBe(5);
    expect(input.element.selectionEnd).toBe(9);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
  it('keeps readonly text unchanged and accepts a server refresh without emitting a save', async () => {
    const wrapper = render('已保存', true);
    const input = wrapper.get('textarea');
    await input.setValue('拒绝修改');
    await wrapper.vm.insertVariable('order');
    expect(input.element.value).toBe('已保存');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.setProps({ modelValue: '服务端最新正文' });
    expect(input.element.value).toBe('服务端最新正文');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});
