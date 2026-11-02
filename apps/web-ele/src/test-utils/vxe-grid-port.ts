/* eslint-disable vue/one-component-per-file -- Native Grid API port for business regression tests. */
import { defineComponent, h, onMounted, ref } from 'vue';

/** Models this installed Vxe version's busy commitProxy behavior; it is not native UI evidence. */
export function useGridPort(options: any) {
  const rows = ref<any[]>([]);
  let page = 1;
  let size = options.gridOptions?.pagerConfig?.pageSize || 10;
  let ordering = options.gridOptions?.sortConfig?.defaultSort;
  let busy = false;
  let values: Record<string, unknown> = {};
  let submitted: Record<string, unknown> = {};
  const selected = ref<any[]>([]);
  const Pager = defineComponent({
    name: 'VxePagerUnitPort',
    emits: ['current-change'],
    setup(_, { emit }) {
      return () =>
        h(
          'button',
          { onClick: () => emit('current-change', page + 1) },
          '下一页',
        );
    },
  });
  const api = {
    formApi: {
      async getValues() {
        return values;
      },
      getLatestSubmissionValues() {
        return submitted;
      },
      setLatestSubmissionValues(next: Record<string, unknown>) {
        submitted = next;
      },
      async setValues(next: Record<string, unknown>) {
        values = next;
      },
      async resetForm() {
        values = {};
      },
      updateSchema: () => Promise.resolve(),
      async setFieldValue(key: string, value: unknown) {
        values[key] = value;
      },
    },
    grid: {
      getCurrentPage: () => page,
      getPageSize: () => size,
      getSortColumns: () => (ordering?.order ? [ordering] : []),
      async setCurrentPage(next: number) {
        page = next;
      },
      async setPageSize(next: number) {
        size = next;
      },
      async clearSort() {
        ordering = undefined;
      },
      async sort(next: unknown) {
        ordering = next;
      },
    },
    setGridOptions() {},
    async query() {
      if (busy) return;
      busy = true;
      try {
        const result = await options.gridOptions.proxyConfig.ajax.query(
          { page: { currentPage: page, pageSize: size }, sort: ordering },
          submitted,
        );
        rows.value = result.items;
        selected.value = [];
      } catch {
        /* The page owns the visible error; Vben query also consumes proxy failures. */
      } finally {
        busy = false;
      }
    },
  };
  const Grid = defineComponent({
    name: 'VxeGridUnitPort',
    setup(_, { slots }) {
      onMounted(() => api.query());
      return () =>
        h('section', [
          slots['toolbar-actions']?.(),
          rows.value.length > 0
            ? rows.value.map((row) =>
                h('article', [
                  h('input', {
                    type: 'checkbox',
                    'aria-label': `select-${row.id}`,
                    disabled:
                      options.gridOptions.checkboxConfig?.checkMethod?.({
                        row,
                      }) === false,
                    onChange(event: Event) {
                      selected.value = (event.target as HTMLInputElement)
                        .checked
                        ? [...selected.value, row]
                        : selected.value.filter((item) => item.id !== row.id);
                      options.gridEvents?.checkboxChange?.({
                        records: selected.value,
                      });
                    },
                  }),
                  h('span', String(row.title ?? '')),
                  slots.readState?.({ row }),
                  slots.actions?.({ row }),
                ]),
              )
            : h('p', '暂无通知'),
          h(Pager, {
            'onCurrent-change': async (next: number) => {
              page = next;
              await api.query();
            },
          }),
        ]);
    },
  });
  return [Grid, api] as const;
}
