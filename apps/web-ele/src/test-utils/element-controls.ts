import type { VueWrapper } from '@vue/test-utils';

import { DOMWrapper, flushPromises } from '@vue/test-utils';

import { ElRadioGroup, ElSelect } from 'element-plus';

export function button(text: string, root: ParentNode = document.body) {
  const target = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) =>
      element.textContent?.trim() === text &&
      new DOMWrapper(element).isVisible(),
  );
  if (!target) throw new Error(`Missing visible button: ${text}`);
  return new DOMWrapper(target);
}
export async function click(text: string, root: ParentNode = document.body) {
  await button(text, root).trigger('click');
  await flushPromises();
}
export async function clickTab(
  label: string,
  root: ParentNode = document.body,
) {
  const target = [...root.querySelectorAll('.el-tabs__item')].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!target) throw new Error(`Missing tab: ${label}`);
  await new DOMWrapper(target).trigger('click');
  await flushPromises();
}
export async function clickPagerPage(
  page: number,
  root: ParentNode = document.body,
) {
  const target = [...root.querySelectorAll('.vxe-pager--num-btn')].find(
    (element) => element.textContent?.trim() === String(page),
  );
  if (!target) throw new Error(`Missing pager page: ${page}`);
  await new DOMWrapper(target).trigger('click');
  await flushPromises();
}
export async function fill(label: string, value: string) {
  // Element Plus 输入类的透传 aria-label 可能落在原生 input 上，也可能落在包裹层；
  // 原生 Vben 表单则以 label 文本标识字段。
  const target = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `input[aria-label="${label}"], textarea[aria-label="${label}"], [aria-label="${label}"] input, [aria-label="${label}"] textarea`,
  );
  if (target) {
    await new DOMWrapper(target).setValue(value);
    await flushPromises();
    return;
  }
  const labelElement = [
    ...document.querySelectorAll('label, .vben-form-item__label'),
  ].find(
    (element) =>
      (element.textContent ?? '')
        .replace(/\s|\*/g, '')
        .trim() === label.replace(/\s|\*/g, ''),
  );
  const field = labelElement?.parentElement?.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >('input, textarea');
  if (!field) throw new Error(`Missing input: ${label}`);
  await new DOMWrapper(field).setValue(value);
  await flushPromises();
}
export function selectControl(wrapper: VueWrapper, label: string) {
  const control = wrapper.findAllComponents(ElSelect).find((component) => {
    const props = component.props() as Record<string, unknown>;
    return (
      props.ariaLabel === label || component.attributes('aria-label') === label
    );
  });
  if (!control) throw new Error(`Missing Element Plus select: ${label}`);
  return control;
}
export async function selectValue(
  wrapper: VueWrapper,
  label: string,
  value: unknown,
) {
  const control = selectControl(wrapper, label);
  control.vm.$emit('update:modelValue', value);
  control.vm.$emit('change', value);
  await flushPromises();
}
export async function radioValue(
  wrapper: VueWrapper,
  label: string,
  value: boolean | string,
) {
  const control = wrapper
    .findAllComponents(ElRadioGroup)
    .find((component) => component.attributes('aria-label') === label);
  if (!control) throw new Error(`Missing Element Plus radio group: ${label}`);
  control.vm.$emit('update:modelValue', value);
  control.vm.$emit('change', value);
  await flushPromises();
}
export async function selectNative(label: string, value: string) {
  const target = document.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  );
  if (!target) throw new Error(`Missing native select: ${label}`);
  target.value = value;
  await new DOMWrapper(target).trigger('change');
  await flushPromises();
}
export async function settleDebounce() {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await flushPromises();
}
