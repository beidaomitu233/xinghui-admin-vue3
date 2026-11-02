import type { Component } from 'vue';

import { defineComponent, h, reactive, ref } from 'vue';

interface PopupPortOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  showCancelButton?: boolean;
  showConfirmButton?: boolean;
  onOpenChange?: (open: boolean) => unknown;
  onBeforeClose?: () => unknown;
  onConfirm?: () => unknown;
}
/** Unit-test boundary for popup focus/portal behavior. Real popup behavior is verified in Chrome. */
export function useModalPort(options: PopupPortOptions) {
  const opened = ref(false);
  const locked = ref(false);
  const state = reactive<Record<string, unknown>>({ ...options });
  const api = {
    setState(value: Record<string, unknown>) {
      Object.assign(state, value);
      return api;
    },
    lock() {
      locked.value = true;
    },
    unlock() {
      locked.value = false;
    },
    open() {
      if (!opened.value) {
        opened.value = true;
        void options.onOpenChange?.(true);
      }
      return api;
    },
    async close() {
      if (!opened.value || (await options.onBeforeClose?.()) === false) return;
      opened.value = false;
      void options.onOpenChange?.(false);
    },
  };
  const Modal: Component = defineComponent({
    name: 'ModalUnitPort',
    setup(_, { slots }) {
      return () =>
        opened.value
          ? h('section', { role: 'dialog' }, [
              h('h2', String(state.title || '')),
              slots.default?.(),
              slots.footer
                ? slots.footer()
                : [
                    state.showCancelButton === false
                      ? null
                      : h(
                          'button',
                          {
                            disabled: locked.value,
                            onClick: () => api.close(),
                          },
                          String(state.cancelText || '取消'),
                        ),
                    state.showConfirmButton === false
                      ? null
                      : h(
                          'button',
                          {
                            disabled:
                              locked.value || state.confirmDisabled === true,
                            onClick: () => options.onConfirm?.(),
                          },
                          String(state.confirmText || '确认'),
                        ),
                  ],
            ])
          : null;
    },
  });
  return [Modal, api] as const;
}
