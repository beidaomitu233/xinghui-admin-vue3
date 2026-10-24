<script lang="ts" setup>
import type { VbenGridQueryState } from '#/adapter/vxe-table';
import type { RoleInfo } from '#/api/system/role';

import { computed, ref, watch } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { createVbenGridQuery, useVbenVxeGrid } from '#/adapter/vxe-table';
import { changeRoleStatus, getRoleList, removeRole } from '#/api/system/role';

import RoleModal from './role-modal.vue';

const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const canQuery = computed(() => can('system:role:list'));
const error = ref('');
const mutating = ref(false);
let revision = 0;
const sortFields = new Set([
  'createTime',
  'roleKey',
  'roleName',
  'status',
  'updateTime',
]);
function order(sort: VbenGridQueryState['sort']) {
  return sort.field &&
    sortFields.has(sort.field) &&
    (sort.order === 'asc' || sort.order === 'desc')
    ? { orderBy: sort.field, order: sort.order }
    : { orderBy: 'createTime', order: 'desc' };
}
const query: () => Promise<{ items: RoleInfo[]; total: number }> =
  createVbenGridQuery(
    () => gridApi,
    async ({ page, sort, form }) => {
      if (!canQuery.value) return { items: [], total: 0 };
      const result = await getRoleList({
        pageNum: page.currentPage,
        pageSize: page.pageSize,
        roleName: String(form.roleName ?? '').trim(),
        roleKey: String(form.roleKey ?? '').trim(),
        status:
          form.status === '' || form.status === undefined
            ? undefined
            : String(form.status),
        ...order(sort),
      });
      return { items: result.records, total: result.total };
    },
    () => JSON.stringify([access.accessToken, canQuery.value, revision]),
  );
const [Grid, gridApi] = useVbenVxeGrid<RoleInfo>({
  formOptions: {
    collapsed: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'roleName',
        label: '角色名称',
        component: 'Input',
        defaultValue: '',
      },
      {
        fieldName: 'roleKey',
        label: '角色标识',
        component: 'Input',
        defaultValue: '',
      },
      {
        fieldName: 'status',
        label: '状态',
        component: 'Select',
        componentProps: {
          clearable: true,
          options: [
            { label: '正常', value: '1' },
            { label: '停用', value: '0' },
          ],
        },
      },
    ],
    handleSubmit: search,
    handleReset: reset,
  },
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'roleId' },
    columns: [
      { field: 'roleName', title: '角色名称', minWidth: 160, sortable: true },
      { field: 'roleKey', title: '角色标识', minWidth: 160, sortable: true },
      {
        field: 'status',
        title: '状态',
        width: 100,
        sortable: true,
        slots: { default: 'status' },
      },
      { field: 'createTime', title: '创建时间', width: 180, sortable: true },
      { field: 'updateTime', title: '更新时间', width: 180, sortable: true },
      { title: '操作', width: 150, slots: { default: 'actions' } },
    ],
    pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
    toolbarConfig: { refresh: true, custom: true, search: true, zoom: false },
    sortConfig: {
      remote: true,
      multiple: false,
      defaultSort: { field: 'createTime', order: 'desc' },
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query,
        querySuccess: () => {
          error.value = '';
        },
        queryError: () => {
          error.value = '角色列表加载失败，请重试';
        },
      },
    },
  },
});
const [EditModal, modalApi] = useVbenModal({ connectedComponent: RoleModal });
function open(row?: RoleInfo) {
  if (
    !can(row ? 'system:role:edit' : 'system:role:add') ||
    (row && !can('system:role:query'))
  )
    return;
  modalApi.setData({ id: row?.roleId }).open();
}
async function search() {
  const values = await gridApi.formApi.getValues();
  gridApi.formApi.setLatestSubmissionValues(values);
  await gridApi.grid.setCurrentPage(1);
  await gridApi.query();
}
async function reset() {
  await gridApi.formApi.resetForm();
  gridApi.formApi.setLatestSubmissionValues(await gridApi.formApi.getValues());
  await gridApi.grid.clearSort();
  // eslint-disable-next-line unicorn/no-array-sort -- 原生VXE表头排序API。
  await gridApi.grid.sort({ field: 'createTime', order: 'desc' });
  await gridApi.grid.setCurrentPage(1);
  await gridApi.query();
}
async function load() {
  revision += 1;
  await gridApi.query();
}
async function remove(row: RoleInfo) {
  if (!can('system:role:remove') || mutating.value) return;
  mutating.value = true;
  try {
    await ElMessageBox.confirm(
      `确定删除角色“${row.roleName}”吗？`,
      '删除角色',
      { type: 'warning' },
    );
    await removeRole(row.roleId);
    ElMessage.success('删除成功');
    await load();
  } catch {
    /* 取消或请求层显示错误 */
  } finally {
    mutating.value = false;
  }
}
async function status(row: RoleInfo, value: boolean | number | string) {
  if (!can('system:role:edit') || mutating.value) return;
  const next = value === 1 ? 1 : 0;
  mutating.value = true;
  try {
    await ElMessageBox.confirm(
      `确定${next === 1 ? '启用' : '停用'}角色“${row.roleName}”吗？`,
      '角色状态',
      { type: 'warning' },
    );
    await changeRoleStatus(row.roleId, next);
    row.status = next;
    ElMessage.success('状态已更新');
    await load();
  } catch {
    /* 取消或请求层显示错误 */
  } finally {
    mutating.value = false;
  }
}
watch([() => access.accessToken, canQuery], async () => {
  if (!gridApi.grid.loadData) return;
  await gridApi.grid.loadData([]);
  await reset();
});
</script>

<template>
  <Page
    title="角色管理"
    description="管理系统角色及其菜单权限"
    auto-content-height
    content-class="flex min-h-0 flex-col"
  >
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4">
      <el-button link @click="load">重试</el-button>
    </el-alert>
    <Grid class="min-h-0 flex-1">
      <template #toolbar-actions>
        <el-button v-if="can('system:role:add')" type="primary" @click="open()">
          新增角色
        </el-button>
      </template>
      <template #status="{ row }">
        <el-switch
          :model-value="row.status"
          :active-value="1"
          :inactive-value="0"
          :disabled="!can('system:role:edit') || mutating"
          @change="(value) => status(row, value)"
        />
      </template>
      <template #actions="{ row }">
        <el-button-group>
          <el-button
            v-if="can('system:role:edit') && can('system:role:query')"
            link
            type="primary"
            @click="open(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="can('system:role:remove')"
            link
            type="danger"
            :disabled="mutating"
            @click="remove(row)"
          >
            删除
          </el-button>
        </el-button-group>
      </template>
    </Grid>
    <EditModal @saved="load" />
  </Page>
</template>
