import type { FormRenderProps } from '../src/types';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { useExpandable } from '../src/form-render/expandable';

describe('form collapse DOM binding', () => {
  it('measures mounted rows through the explicit wrapper ref', async () => {
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    bounds.mockImplementation(function (this: HTMLElement) {
      return { top: this.dataset.row === '2' ? 10 : 0 } as DOMRect;
    });
    const styles = vi.spyOn(window, 'getComputedStyle');
    styles.mockReturnValue({
      getPropertyValue: () => '10px 10px',
    } as unknown as CSSStyleDeclaration);
    const props = {
      collapsedRows: 1,
      showCollapseButton: true,
    } as FormRenderProps;
    let measured = false;
    let keptIndex = 0;
    const component = defineComponent({
      setup() {
        const state = useExpandable(props);
        return () => {
          measured = state.isCalculated.value;
          keptIndex = state.keepFormItemIndex.value;
          return h(
            'div',
            {
              ref: state.setWrapperRef,
              style: { gridTemplateRows: '10px 10px' },
            },
            [1, 1, 1, 2].map((row) => h('span', { 'data-row': row })),
          );
        };
      },
    });
    const wrapper = mount(component);
    try {
      await flushPromises();
      expect(measured).toBe(true);
      expect(keptIndex).toBe(2);
    } finally {
      wrapper.unmount();
      bounds.mockRestore();
      styles.mockRestore();
    }
  });
});
