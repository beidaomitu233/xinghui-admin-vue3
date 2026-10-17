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
export async function fill(label: string, value: string) {
  const target = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `input[aria-label="${label}"], textarea[aria-label="${label}"]`,
  );
  if (!target) throw new Error(`Missing input: ${label}`);
  await new DOMWrapper(target).setValue(value);
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
export async function settleDebounce() {
  await new Promise((resolve) => setTimeout(resolve, 350));
  await flushPromises();
}
