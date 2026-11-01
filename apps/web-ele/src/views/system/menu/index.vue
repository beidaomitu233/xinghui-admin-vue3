<script lang="ts" setup>
import type { MenuInfo } from '#/api/system/menu';

import { computed, nextTick, ref, watch } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { createVbenGridQuery, useVbenVxeGrid } from '#/adapter/vxe-table';
import { getMenuTree, removeMenu } from '#/api/system/menu';

import MenuModal from './menu-modal.vue';
import { filterMenuTree, sortMenuSiblings } from './menu-order';

const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const canQuery = computed(() => can('system:menu:list'));
const error = ref('');
const expanded = ref(true);
const mutating = ref(false);
let revision = 0;
const query: () => Promise<{ items: MenuInfo[]; total: number }> =
  createVbenGridQuery(
    () => gridApi,
    async ({ form }) => {
      if (!canQuery.value) return { items: [], total: 0 };
      const tree = await getMenuTree();
      const items = sortMenuSiblings(
        filterMenuTree(
          tree,
          String(form.menuName ?? ''),
          String(form.status ?? ''),
        ),
      );
      return { items, total: items.length };
    },
    () => JSON.stringify([access.accessToken, canQuery.value, revision]),
  );
const [Grid, gridApi] = useVbenVxeGrid<MenuInfo>({
  formOptions: {
    collapsed: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'menuName',
        label: '菜单名称',
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
            { label: '正常', value: '0' },
            { label: '停用', value: '1' },
          ],
        },
      },
    ],
    handleSubmit: search,
    handleReset: reset,
  },
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'menuId' },
    treeConfig: {
      rowField: 'menuId',
      parentField: 'parentId',
      childrenField: 'children',
      expandAll: true,
      reserve: true,
    },
    pagerConfig: { enabled: false },
    columns: [
      {
        field: 'menuName',
        title: '菜单名称',
        minWidth: 200,
        treeNode: true,
        sortable: true,
      },
      { field: 'icon', title: '图标', width: 120 },
      {
        field: 'menuType',
        title: '类型',
        width: 110,
        formatter: ({ cellValue }: { cellValue: string }) =>
          ({ M: '目录', C: '页面', G: '业务模块', F: '操作权限' })[
            cellValue as 'C' | 'F' | 'G' | 'M'
          ] || cellValue,
      },
      { field: 'orderNum', title: '显示顺序', width: 100, sortable: true },
      { field: 'perms', title: '权限标识', minWidth: 180, sortable: true },
      { field: 'component', title: '组件路径', minWidth: 180, sortable: true },
      {
        field: 'status',
        title: '状态',
        width: 100,
        sortable: true,
        slots: { default: 'status' },
      },
      { field: 'createTime', title: '创建时间', width: 180, sortable: true },
      { title: '操作', width: 200, slots: { default: 'actions' } },
    ],
    sortConfig: {
      remote: false,
      multiple: false,
      defaultSort: { field: 'orderNum', order: 'asc' },
      sortMethod: ({
        data,
        sortList,
      }: {
        data: MenuInfo[];
        sortList: { field: string; order: 'asc' | 'desc' }[];
      }) => sortMenuSiblings(data, sortList[0]?.field, sortList[0]?.order),
    },
    toolbarConfig: { refresh: true, custom: true, search: true, zoom: false },
    proxyConfig: {
      ajax: {
        query,
        querySuccess: () => {
          error.value = '';
          void nextTick(() => gridApi.grid.setAllTreeExpand(expanded.value));
        },
        queryError: () => {
          error.value = '菜单列表加载失败，请重试';
          void gridApi.grid.loadData([]);
        },
      },
    },
  },
});
const [EditModal, modalApi] = useVbenModal({ connectedComponent: MenuModal });
function add(row?: MenuInfo) {
  if (!can('system:menu:add') || row?.menuType === 'F') return;
  modalApi.setData({ parentId: row?.menuId }).open();
}
function edit(row: MenuInfo) {
  if (can('system:menu:edit') && can('system:menu:query'))
    modalApi.setData({ id: row.menuId }).open();
}
async function search() {
  gridApi.formApi.setLatestSubmissionValues(await gridApi.formApi.getValues());
  await gridApi.query();
}
async function reset() {
  await gridApi.formApi.resetForm();
  gridApi.formApi.setLatestSubmissionValues(await gridApi.formApi.getValues());
  await gridApi.grid.clearSort();
  await gridApi.query();
}
async function load() {
  revision += 1;
  await gridApi.query();
}
async function toggleTree() {
  expanded.value = !expanded.value;
  await gridApi.grid.setAllTreeExpand(expanded.value);
}
async function remove(row: MenuInfo) {
  if (!can('system:menu:remove') || mutating.value) return;
  mutating.value = true;
  try {
    await ElMessageBox.confirm(
      `确定删除菜单“${row.menuName}”吗？`,
      '删除菜单',
      { type: 'warning' },
    );
    await removeMenu(row.menuId);
    ElMessage.success('删除成功');
    await load();
  } catch {
    /* 取消或请求层显示业务约束 */
  } finally {
    mutating.value = false;
  }
}
watch([() => access.accessToken, canQuery], async () => {
  if (!gridApi.grid.loadData) return;
  await gridApi.grid.loadData([]);
  if (gridApi.formApi.isMounted) await reset();
});
</script>

<template>
  <Page
    title="菜单管理"
    description="配置系统菜单和按钮权限；筛选时保留父级以呈现层级"
    auto-content-height
    content-class="flex min-h-0 flex-col"
  >
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4">
      <el-button link @click="load">重试</el-button>
    </el-alert>
    <Grid class="min-h-0 flex-1">
      <template #toolbar-actions>
        <el-button-group>
          <el-button @click="toggleTree">
            {{ expanded ? '收起全部' : '展开全部' }}
          </el-button>
          <el-button
            v-if="can('system:menu:add')"
            type="primary"
            @click="add()"
          >
            新增菜单
          </el-button>
        </el-button-group>
      </template>
      <template #status="{ row }">
        <el-tag :type="row.status === '0' ? 'success' : 'danger'">
          {{ row.status === '0' ? '正常' : '停用' }}
        </el-tag>
      </template>
      <template #actions="{ row }">
        <el-button-group>
          <el-button
            v-if="can('system:menu:edit') && can('system:menu:query')"
            link
            type="primary"
            @click="edit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="can('system:menu:add') && row.menuType !== 'F'"
            link
            type="primary"
            @click="add(row)"
          >
            新增
          </el-button>
          <el-button
            v-if="can('system:menu:remove')"
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
