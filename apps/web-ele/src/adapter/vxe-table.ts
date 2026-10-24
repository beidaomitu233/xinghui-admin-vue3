import type {
  ExtendedVxeGridApi,
  VxeTableGridOptions,
} from '@vben/plugins/vxe-table';

import { getCurrentScope, h, onScopeDispose } from 'vue';

import { setupVbenVxeTable, useVbenVxeGrid } from '@vben/plugins/vxe-table';
import { cloneDeep, isEqual } from '@vben/utils';

import { ElButton, ElImage } from 'element-plus';

import { useVbenForm } from './form';

setupVbenVxeTable({
  configVxeTable: (vxeUI) => {
    vxeUI.setConfig({
      grid: {
        layouts: [
          ['Toolbar', 'Form'],
          ['Top', 'Table', 'Bottom', 'Pager'],
        ],
        cellConfig: { height: 48 },
        headerCellConfig: { height: 44 },
        sortConfig: { trigger: 'cell' },
        // 采用当前VXE的原生选项；刷新保留原生页码/排序。
        toolbarConfig: { refreshOptions: { code: 'query' } },
        align: 'left',
        headerAlign: 'left',
        border: false,
        columnConfig: {
          resizable: true,
        },
        minHeight: 180,
        formConfig: {
          // 全局禁用vxe-table的表单配置，使用formOptions
          enabled: false,
        },
        proxyConfig: {
          autoLoad: true,
          response: {
            result: 'items',
            total: 'total',
            list: 'items',
          },
          showActiveMsg: true,
          showResponseMsg: false,
        },
        round: true,
        showOverflow: true,
        showHeaderOverflow: true,
        size: 'small',
      } as VxeTableGridOptions,
    });

    // 表格配置项可以用 cellRender: { name: 'CellImage' },
    vxeUI.renderer.add('CellImage', {
      renderTableDefault(renderOpts, params) {
        const { props } = renderOpts;
        const { column, row } = params;
        const src = row[column.field];
        return h(ElImage, { src, previewSrcList: [src], ...props });
      },
    });

    // 表格配置项可以用 cellRender: { name: 'CellLink' },
    vxeUI.renderer.add('CellLink', {
      renderTableDefault(renderOpts) {
        const { props } = renderOpts;
        return h(
          ElButton,
          { size: 'small', link: true },
          { default: () => props?.text },
        );
      },
    });

    // 这里可以自行扩展 vxe-table 的全局配置，比如自定义格式化
    // vxeUI.formats.add
  },
  useVbenForm,
});

export { useVbenVxeGrid };

export interface VbenGridQueryState {
  form: Record<string, unknown>;
  page: { currentPage: number; pageSize: number };
  resourceKey?: number | string;
  sort: { field?: string; order?: 'asc' | 'desc' | null };
}

/**
 * VXE 4.17 在 loading 时忽略新的 query；返回前核对原生状态，接续最新查询。
 * 页面先提交 Form/设置原生页码；白名单、权限及响应映射仍由 fetch 实现。
 * 不转换业务值，也不拥有分页、排序、工具栏或 loading 状态。
 */
export function createVbenGridQuery<Result>(
  getApi: () => Pick<ExtendedVxeGridApi, 'formApi' | 'grid'>,
  fetch: (state: VbenGridQueryState) => Promise<Result>,
  getResourceKey: () => number | string | undefined = () => undefined,
): () => Promise<Result> {
  let disposed = false;
  let inFlight: Promise<Result> | undefined;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
    });

  const read = (): VbenGridQueryState => {
    const { formApi, grid } = getApi();
    const sort = grid.getSortColumns()[0];
    return cloneDeep({
      form: formApi?.getLatestSubmissionValues?.() ?? {},
      page: {
        currentPage: grid.getCurrentPage(),
        pageSize: grid.getPageSize(),
      },
      resourceKey: getResourceKey(),
      // VXE 的空串（恢复默认）与 undefined 都收敛为 null，保持 asc/desc/null 契约。
      sort: {
        field: sort?.field,
        order:
          sort?.order === 'asc' || sort?.order === 'desc' ? sort.order : null,
      },
    });
  };
  const ensureActive = () => {
    if (disposed) throw new DOMException('Grid scope disposed', 'AbortError');
  };
  return () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      for (;;) {
        ensureActive();
        const snapshot = read();
        let outcome:
          | { error: unknown; ok: false }
          | { ok: true; value: Result };
        try {
          outcome = { ok: true, value: await fetch(snapshot) };
        } catch (error) {
          outcome = { error, ok: false };
        }
        ensureActive();
        if (!isEqual(snapshot, read())) continue;
        if (!outcome.ok) throw outcome.error;
        return outcome.value;
      }
    })().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}

export type * from '@vben/plugins/vxe-table';
