<script setup lang="ts">
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FormDefinition } from '#/api/lowcode/forms';

import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getForm,
  listForms,
  publishForm,
  removeForm,
  updateForm,
} from '#/api/lowcode/forms';

import { safeGridTotal } from '../record-form';
import FormDesigner from './FormDesigner.vue';
import FormSharing from './FormSharing.vue';

const access = useAccessStore();
const router = useRouter();
const can = (action: string) =>
  access.accessCodes.includes(`lowcode:form:${action}`);
const recordCan = (action: string) =>
  access.accessCodes.includes(`lowcode:record:${action}`);
const editor = ref(false);
const sharingOpened = ref(false);
const sharingForm = ref<FormDefinition>();
function openSharing(form: FormDefinition) {
  if (!can('publish')) return;
  sharingForm.value = form;
  sharingOpened.value = true;
}
const failed = ref(false);
const readOnly = ref(false);
const source = ref<FormDefinition>();
let serial = 0;
let openGeneration = 0;
onBeforeUnmount(() => {
  serial++;
  openGeneration++;
  latestQuery = Promise.resolve({ items: [], total: 0 });
});
let refreshVersion = 0;
type GridResult = { items: FormDefinition[]; total: number };
let latestQuery: Promise<GridResult> = Promise.resolve({ items: [], total: 0 });
function listParameters(
  pageNum: number,
  pageSize: number,
  sort: undefined | { field: string; order?: null | string },
  values: Record<string, unknown> = {},
) {
  return {
    pageNum,
    pageSize,
    name: String(values.name ?? '') || undefined,
    orderBy: sort?.order ? sort.field : 'id',
    order: sort?.order === 'asc' ? ('asc' as const) : ('desc' as const),
  };
}
const gridOptions: VxeTableGridOptions<FormDefinition> = {
  height: 'auto',
  rowConfig: { keyField: 'id' },
  columns: [
    { field: 'name', title: '名称', minWidth: 180, sortable: true },
    { field: 'formKey', title: '标识', minWidth: 160, sortable: true },
    {
      field: 'status',
      title: '状态',
      width: 100,
      sortable: true,
      formatter: ({ row }) =>
        ({ draft: '草稿', enabled: '已发布', disabled: '已停用' })[row.status],
    },
    {
      field: 'publishedVersion',
      title: '发布版本',
      width: 110,
      sortable: true,
    },
    { field: 'revision', title: '修订', width: 90 },
    {
      field: 'actions',
      title: '操作',
      fixed: 'right',
      width: 480,
      slots: { default: 'actions' },
    },
  ],
  pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
  sortConfig: { remote: true, multiple: false },
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
        const run = ++serial;
        failed.value = false;
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
            let response: Awaited<ReturnType<typeof listForms>> | undefined;
            let failure: unknown;
            try {
              response = await listForms(parameters);
            } catch (error) {
              failure = error;
            }
            if (run !== serial) return latestQuery;
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
            return {
              items: response.records,
              total: safeGridTotal(response.total),
            };
          }
        })();
        return latestQuery;
      },
    },
  },
};
const [Grid, gridApi] = useVbenVxeGrid<FormDefinition>({
  gridOptions,
  formOptions: {
    showCollapseButton: false,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'name',
        component: 'Input',
        label: '名称',
        componentProps: { clearable: true, maxlength: 100 },
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

      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
});
async function load() {
  refreshVersion++;
  await gridApi.query();
}
async function open(row?: FormDefinition, view = false) {
  const run = ++openGeneration;
  const allowed = () =>
    run === openGeneration &&
    (row ? can('query') && (view || can('edit')) : can('add'));
  if (!allowed()) return;
  if (row) {
    try {
      const definition = await getForm(row.id);
      if (!allowed()) return;
      source.value = definition;
    } catch {
      return;
    }
  } else source.value = undefined;
  readOnly.value = view;
  editor.value = true;
}
watch(
  () => [can('query'), can('edit'), can('add'), can('publish')],
  () => {
    openGeneration++;
    if (
      editor.value &&
      (source.value
        ? !can('query') || (!readOnly.value && !can('edit'))
        : !can('add'))
    )
      editor.value = false;
    if (!can('publish')) sharingOpened.value = false;
  },
  { flush: 'sync' },
);
async function action(
  row: FormDefinition,
  type: 'disable' | 'publish' | 'remove',
) {
  try {
    const messages = {
      remove: '删除空表单后无法恢复，是否继续？',
      disable: '停用后不能新增记录，历史数据仍可管理，是否继续？',
      publish: '将发布已保存的草稿，是否继续？',
    };
    await ElMessageBox.confirm(messages[type], '操作确认');
  } catch {
    return;
  }
  try {
    if (type === 'remove') await removeForm(row.id, row.revision);
    else if (type === 'publish') await publishForm(row.id, row.revision);
    else {
      const draft = await getForm(row.id);
      await updateForm(row.id, {
        ...draft,
        status: 'disabled',
        revision: row.revision,
      });
    }
    ElMessage.success('操作成功');
    await load();
  } catch {
    /* Shared interceptor reports the error. */
  }
}
</script>
<template>
  <Page title="表单管理" auto-content-height>
    <el-alert
      v-if="!can('list')"
      title="没有表单设计列表权限"
      type="warning"
      closable
    />
    <template v-else>
      <el-alert
        v-if="failed"
        title="表单加载失败"
        type="error"
        closable
        class="mb-3"
      >
        <el-button @click="load">重试</el-button>
      </el-alert>
      <Grid table-title="表单列表">
        <template #toolbar-actions>
          <el-button v-if="can('add')" type="primary" @click="open()">
            新增表单
          </el-button>
        </template>
        <template #actions="{ row }">
          <el-button v-if="can('query')" link @click="open(row, true)">
            详情
          </el-button>
          <el-button
            v-if="can('query') && can('edit')"
            link
            type="primary"
            @click="open(row)"
          >
            设计
          </el-button>
          <el-button v-if="can('publish')" link @click="action(row, 'publish')">
            发布
          </el-button>
          <el-button v-if="can('publish')" link @click="openSharing(row)">
            分享填写
          </el-button>
          <el-button
            v-if="row.status === 'enabled' && can('edit') && can('query')"
            link
            @click="action(row, 'disable')"
          >
            停用
          </el-button>
          <el-button
            v-if="
              row.publishedVersion &&
              recordCan('add') &&
              row.status === 'enabled'
            "
            link
            type="primary"
            @click="router.push(`/lowcode/runtime/${row.id}`)"
          >
            填写
          </el-button>
          <el-button
            v-if="row.publishedVersion && recordCan('list')"
            link
            type="primary"
            @click="router.push(`/lowcode/records/${row.id}`)"
          >
            数据
          </el-button>
          <el-button
            v-if="can('remove')"
            link
            type="danger"
            @click="action(row, 'remove')"
          >
            删除
          </el-button>
        </template>
      </Grid>
    </template>
    <FormDesigner
      v-model="editor"
      :source="source"
      :read-only="readOnly"
      @saved="load"
    />
    <FormSharing v-model="sharingOpened" :form="sharingForm" />
  </Page>
</template>
