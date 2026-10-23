<script setup lang="ts">
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { NoticeInfo } from '#/api/system/notice';

import { onBeforeUnmount, ref } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeNoticeStatus,
  getNoticeList,
  removeBatchNotice,
  removeNotice,
} from '#/api/system/notice';
import { DICT_TYPE, useDictionary } from '#/composables/use-dictionary';

import NoticeModal from './NoticeModal.vue';

const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`system:notice:${action}`);
const dictionary = useDictionary(DICT_TYPE.NOTICE_TYPE);
const selected = ref<NoticeInfo[]>([]);
const failed = ref(false);
let generation = 0;
let refreshVersion = 0;
type GridResult = { items: NoticeInfo[]; total: number };
let latestQuery: Promise<GridResult> = Promise.resolve({ items: [], total: 0 });
onBeforeUnmount(() => {
  generation++;
  latestQuery = Promise.resolve({ items: [], total: 0 });
});
const [Editor, editorApi] = useVbenModal({ connectedComponent: NoticeModal });
function listParameters(
  pageNum: number,
  pageSize: number,
  sort: undefined | { field: string; order?: null | string },
  values: Record<string, unknown> = {},
) {
  return {
    pageNum,
    pageSize,
    noticeTitle: String(values.noticeTitle ?? '') || undefined,
    noticeType: String(values.noticeType ?? '') || undefined,
    status: String(values.status ?? '') || undefined,
    orderBy: sort?.order ? sort.field : 'createTime',
    order: sort?.order === 'asc' ? ('asc' as const) : ('desc' as const),
  };
}
const gridOptions: VxeTableGridOptions<NoticeInfo> = {
  height: 'auto',
  rowConfig: { keyField: 'noticeId' },
  columns: [
    { type: 'checkbox', width: 50 },
    { field: 'noticeTitle', title: '公告标题', minWidth: 220, sortable: true },
    {
      field: 'noticeType',
      title: '类型',
      width: 130,
      sortable: true,
      formatter: ({ row }) => dictionary.label(row.noticeType),
    },
    {
      field: 'status',
      title: '状态',
      width: 100,
      sortable: true,
      formatter: ({ row }) => (String(row.status) === '0' ? '正常' : '关闭'),
    },
    { field: 'createBy', title: '创建人', width: 130 },
    { field: 'createTime', title: '创建时间', minWidth: 180, sortable: true },
    {
      field: 'actions',
      title: '操作',
      fixed: 'right',
      width: 250,
      slots: { default: 'actions' },
    },
  ],
  pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
  sortConfig: {
    remote: true,
    multiple: false,
    defaultSort: { field: 'createTime', order: 'desc' },
  },
  toolbarConfig: {
    custom: true,
    refresh: true,
    refreshOptions: { code: 'query' },
    search: true,
    zoom: true,
  },
  proxyConfig: {
    sort: true,
    ajax: {
      query: ({ page, sort }, values) => {
        const run = ++generation;
        failed.value = false;
        selected.value = [];
        latestQuery = (async (): Promise<GridResult> => {
          if (!can('list')) return { items: [], total: 0 };
          let parameters = listParameters(
            page.currentPage,
            page.pageSize,
            sort,
            values,
          );
          for (;;) {
            const requestRefresh = refreshVersion;
            let response: Awaited<ReturnType<typeof getNoticeList>> | undefined;
            let failure: unknown;
            try {
              response = await getNoticeList(parameters);
            } catch (error) {
              failure = error;
            }
            if (run !== generation) return latestQuery;
            if (!can('list')) return { items: [], total: 0 };
            if (gridApi.grid.getCurrentPage) {
              const submitted = gridApi.formApi.getLatestSubmissionValues();
              const current = listParameters(
                gridApi.grid.getCurrentPage(),
                gridApi.grid.getPageSize(),
                gridApi.grid.getSortColumns()[0],
                submitted,
              );
              if (JSON.stringify(current) !== JSON.stringify(parameters)) {
                parameters = current;
                continue;
              }
            }
            if (requestRefresh !== refreshVersion) continue;
            if (failure) {
              failed.value = true;
              throw failure;
            }
            if (!response) throw new Error('列表未返回结果');
            const items = response.records || response.rows || [];
            const total = Number(response.total);
            if (
              (typeof response.total === 'string' &&
                !/^\d+$/.test(response.total)) ||
              !Number.isSafeInteger(total) ||
              total < 0
            )
              throw new Error('列表总数格式不正确');
            await dictionary.ensureLabels(items.map((item) => item.noticeType));
            if (run !== generation) return latestQuery;
            if (requestRefresh !== refreshVersion) continue;
            if (gridApi.grid.getCurrentPage) {
              const current = listParameters(
                gridApi.grid.getCurrentPage(),
                gridApi.grid.getPageSize(),
                gridApi.grid.getSortColumns()[0],
                gridApi.formApi.getLatestSubmissionValues(),
              );
              if (JSON.stringify(current) !== JSON.stringify(parameters)) {
                parameters = current;
                continue;
              }
            }
            return { items, total };
          }
        })();
        return latestQuery;
      },
    },
  },
};
const [Grid, gridApi] = useVbenVxeGrid<NoticeInfo>({
  gridOptions,
  gridEvents: {
    checkboxChange: ({ records }) => {
      selected.value = records;
    },
    checkboxAll: ({ records }) => {
      selected.value = records;
    },
  },
  formOptions: {
    showCollapseButton: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'noticeTitle',
        component: 'Input',
        label: '公告标题',
        componentProps: { clearable: true },
      },
      {
        fieldName: 'noticeType',
        component: 'Select',
        label: '公告类型',
        componentProps: () => ({
          clearable: true,
          options: dictionary.options.value,
        }),
      },
      {
        fieldName: 'status',
        component: 'Select',
        label: '状态',
        componentProps: {
          clearable: true,
          options: [
            { label: '正常', value: '0' },
            { label: '关闭', value: '1' },
          ],
        },
      },
    ],
    handleSubmit: async () => {
      const values = await gridApi.formApi.getValues();
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
    handleReset: async () => {
      await gridApi.formApi.resetForm();
      const values = await gridApi.formApi.getValues();
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.clearSort();
      // eslint-disable-next-line unicorn/no-array-sort -- Native Vxe header API.
      await gridApi.grid.sort({ field: 'createTime', order: 'desc' });
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
});
async function refreshList() {
  refreshVersion++;
  await gridApi.query();
}
function edit(row?: NoticeInfo, readOnly = false) {
  if (row ? !can('query') || (!readOnly && !can('edit')) : !can('add')) return;
  editorApi.setData({ id: row?.noticeId, readOnly }).open();
}
async function remove(row?: NoticeInfo) {
  if (!can('remove')) return;
  const records = row ? [row] : [...selected.value];
  if (records.length === 0) return;
  try {
    await ElMessageBox.confirm(`确定删除${records.length}条公告？`, '删除公告');
  } catch {
    return;
  }
  await (row
    ? removeNotice(row.noticeId)
    : removeBatchNotice(records.map((item) => item.noticeId)));
  ElMessage.success('公告已删除');
  await refreshList();
}
async function status(row: NoticeInfo) {
  if (!can('edit')) return;
  const value = String(row.status) === '0' ? 1 : 0;
  try {
    await ElMessageBox.confirm(
      value ? '关闭这条公告？' : '启用这条公告？',
      '修改状态',
    );
  } catch {
    return;
  }
  await changeNoticeStatus(row.noticeId, value);
  await refreshList();
}
</script>
<template>
  <Page title="通知公告" auto-content-height>
    <el-alert
      v-if="failed"
      title="公告列表加载失败，请重试"
      type="error"
      closable
      class="mb-3"
    >
      <el-button @click="gridApi.query()">重试</el-button>
    </el-alert>
    <Grid v-if="can('list')" table-title="公告列表">
      <template #toolbar-actions>
        <el-button v-if="can('add')" type="primary" @click="edit()">
          新增公告
        </el-button>
        <el-button
          v-if="can('remove')"
          type="danger"
          :disabled="selected.length === 0"
          @click="remove()"
        >
          批量删除
        </el-button>
      </template>
      <template #actions="{ row }">
        <el-button v-if="can('query')" link @click="edit(row, true)">
          详情
        </el-button>
        <el-button
          v-if="can('edit') && can('query')"
          link
          type="primary"
          @click="edit(row)"
        >
          编辑
        </el-button>
        <el-button v-if="can('edit') && can('query')" link @click="status(row)">
          {{ String(row.status) === '0' ? '关闭' : '启用' }}
        </el-button>
        <el-button v-if="can('remove')" link type="danger" @click="remove(row)">
          删除
        </el-button>
      </template>
    </Grid>
    <el-alert v-else title="没有公告列表权限" type="warning" closable />
    <Editor @success="refreshList" />
  </Page>
</template>
