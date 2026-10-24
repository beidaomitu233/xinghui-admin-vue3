<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { UserImportSummary, UserInfo } from '#/api/system/user';
import type { EntityDialogMode } from '#/composables/use-entity-dialog';

import { computed, ref, watch } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { ChevronDown, Search } from '@vben/icons';
import { usePreferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { createVbenGridQuery, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  downloadUserImportTemplate,
  exportUsers,
  getUserList,
  importUsers,
  removeUser,
  resetUserPwd,
} from '#/api/system/user';

import UserModal from './user-modal.vue';

const accessStore = useAccessStore();
const { isMobile } = usePreferences();
const can = (code: string) => accessStore.accessCodes.includes(code);
const canQuery = computed(() => can('system:user:list'));
const error = ref('');
const importInput = ref<HTMLInputElement>();
const importLoading = ref(false);
const templateLoading = ref(false);
const exportLoading = ref(false);
const importSummary = ref<UserImportSummary>();
const importError = ref('');
const quickSearch = ref('');
let queryRevision = 0;
const [EditModal, modalApi] = useVbenModal({ connectedComponent: UserModal });
function canOpenDialog(mode: EntityDialogMode) {
  if (mode === 'create') return can('system:user:add');
  if (mode === 'view') return can('system:user:query');
  return can('system:user:edit') && can('system:user:query');
}
function open(mode: EntityDialogMode, id?: string) {
  if (canOpenDialog(mode)) modalApi.setData({ mode, id }).open();
}
const add = () => open('create');
const edit = (row: UserInfo) => open('edit', row.userId);
const view = (row: UserInfo) => open('view', row.userId);
const sortableFields = new Set([
  'createTime',
  'email',
  'mobile',
  'nickname',
  'status',
  'username',
]);
function userOrdering(sort: { field?: unknown; order?: unknown }): {
  order: 'asc' | 'desc';
  orderBy: string;
} {
  if (
    typeof sort.field === 'string' &&
    sortableFields.has(sort.field) &&
    (sort.order === 'asc' || sort.order === 'desc')
  ) {
    return { orderBy: sort.field, order: sort.order };
  }
  return { orderBy: 'createTime', order: 'desc' };
}
const queryUsers: () => Promise<{ items: UserInfo[]; total: number }> =
  createVbenGridQuery(
    () => gridApi,
    async ({ page, sort, form }) => {
      if (!canQuery.value) return { items: [], total: 0 };
      const result = await getUserList({
        pageNum: page.currentPage,
        pageSize: page.pageSize,
        ...filterValues(form),
        ...userOrdering(sort),
      });
      return { items: result.records ?? [], total: result.total };
    },
    () =>
      JSON.stringify([accessStore.accessToken, canQuery.value, queryRevision]),
  );
const columns = computed<NonNullable<VxeTableGridOptions<UserInfo>['columns']>>(
  () => [
    { field: 'username', title: '账号', minWidth: 136, sortable: true },
    { field: 'nickname', title: '昵称', minWidth: 110, sortable: true },
    { field: 'mobile', title: '手机号', minWidth: 125, sortable: true },
    { field: 'email', title: '邮箱', minWidth: 170, sortable: true },
    {
      field: 'status',
      title: '状态',
      width: 96,
      sortable: true,
      slots: { default: 'status' },
    },
    { field: 'createTime', title: '创建时间', width: 168, sortable: true },
    {
      title: '操作',
      width: 180,
      fixed: isMobile.value ? undefined : 'right',
      showOverflow: false,
      slots: { default: 'actions' },
    },
  ],
);
const [Grid, gridApi] = useVbenVxeGrid<UserInfo>({
  tableTitle: '',
  showSearchForm: false,
  separator: false,
  class: '!rounded-none !bg-transparent',
  gridClass: '!p-0',
  formOptions: {
    collapsed: false,
    showCollapseButton: false,
    actionLayout: 'newLine',
    actionPosition: 'left',
    actionButtonsReverse: true,
    actionWrapperClass: 'border-t mt-1 pt-3',
    resetButtonOptions: { plain: true },
    commonConfig: { labelWidth: 60, labelClass: '!justify-start' },
    wrapperClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'username',
        label: '账号',
        component: 'Input',
        componentProps: { placeholder: '输入账号关键词', clearable: true },
        defaultValue: '',
      },
      {
        fieldName: 'mobile',
        label: '手机号',
        component: 'Input',
        componentProps: { placeholder: '输入手机号', clearable: true },
        defaultValue: '',
      },
      {
        fieldName: 'status',
        label: '状态',
        component: 'Select',
        componentProps: {
          clearable: true,
          options: [
            { label: '启用', value: '1' },
            { label: '禁用', value: '0' },
          ],
        },
      },
    ],
    handleSubmit: async () => {
      const values = await gridApi.formApi.getValues();
      quickSearch.value = String(values.username ?? '');
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
    handleReset: async () => {
      quickSearch.value = '';
      await gridApi.formApi.resetForm();
      const values = await gridApi.formApi.getValues();
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.clearSort();
      // eslint-disable-next-line unicorn/no-array-sort -- VxeGrid.sort 是原生表头排序 API，非数组排序。
      await gridApi.grid.sort({ field: 'createTime', order: 'desc' });
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
  gridOptions: {
    layouts: [
      ['Toolbar', 'Form'],
      ['Table', 'Pager'],
    ],
    height: 'auto',
    align: 'left',
    headerAlign: 'left',
    round: false,
    cellConfig: { height: 48 },
    headerCellConfig: { height: 44 },
    rowConfig: { keyField: 'userId' },
    columns: columns.value,
    pagerConfig: {
      pageSize: 20,
      pageSizes: [10, 20, 50, 100],
      layouts: ['Total', 'Sizes', 'PrevPage', 'Number', 'NextPage'],
    },
    sortConfig: {
      remote: true,
      multiple: false,
      trigger: 'cell',
      defaultSort: { field: 'createTime', order: 'desc' },
    },
    toolbarConfig: {
      custom: true,
      refresh: true,
      refreshOptions: { code: 'query' },
      zoom: false,
      search: false,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: queryUsers,
        querySuccess: () => {
          error.value = '';
        },
        queryError: () => {
          error.value = '用户列表加载失败，请重试';
        },
      },
    },
  },
});
const gridState = gridApi.useStore();
async function searchAccounts() {
  const values = {
    ...(await gridApi.formApi.getValues()),
    username: quickSearch.value.trim(),
  };
  await gridApi.formApi.setValues(values);
  gridApi.formApi.setLatestSubmissionValues(values);
  await gridApi.grid.setCurrentPage(1);
  await gridApi.query(values);
}
watch(columns, (nextColumns) =>
  gridApi.setGridOptions({ columns: nextColumns }),
);
const [ImportGrid] = useVbenVxeGrid({
  gridOptions: {
    height: 320,
    pagerConfig: { enabled: false },
    columns: [
      { field: 'rowNumber', title: '行号', width: 90 },
      {
        field: 'status',
        title: '结果',
        width: 100,
        formatter: ({ cellValue }: { cellValue: string }) =>
          ({ success: '成功', failed: '失败', skipped: '跳过' })[
            cellValue as 'failed' | 'skipped' | 'success'
          ],
      },
      { field: 'field', title: '字段', width: 130 },
      { field: 'reason', title: '原因', minWidth: 220 },
    ],
  },
});
function filterValues(values: Record<string, unknown>) {
  const username = String(values.username ?? '').trim();
  const mobile = String(values.mobile ?? '').trim();
  return {
    ...(username && { username }),
    ...(mobile && { mobile }),
    ...(values.status !== '' &&
      values.status !== undefined &&
      values.status !== null && { status: String(values.status) }),
  };
}
function currentFilters() {
  return {
    ...filterValues(gridApi.formApi.getLatestSubmissionValues()),
    ...userOrdering(gridApi.grid.getSortColumns()[0] ?? {}),
  };
}
async function load() {
  queryRevision += 1;
  await gridApi.query();
}
async function showPendingUsers() {
  quickSearch.value = '';
  const values = { username: '', mobile: '', status: '0' };
  await gridApi.formApi.setValues(values);
  gridApi.formApi.setLatestSubmissionValues(values);
  await gridApi.grid.setCurrentPage(1);
  await gridApi.query(values);
}
async function remove(row: UserInfo) {
  try {
    await ElMessageBox.confirm(`确定删除用户“${row.username}”？`, '删除确认', {
      type: 'warning',
    });
    await removeUser(row.userId);
    ElMessage.success('删除成功');
    await load();
  } catch {
    /* 取消或请求层显示错误 */
  }
}
async function resetPassword(row: UserInfo) {
  try {
    const activationHint =
      row.status === 0
        ? ' 当前账号仍处于禁用状态；重置密码不会启用账号。完成角色检查和密码交付后，请在编辑中启用。'
        : '';
    await ElMessageBox.confirm(
      `将为“${row.username}”生成独立的随机临时密码，旧会话将失效。新密码只会在操作完成后显示一次。${activationHint}`,
      '重置密码',
      { type: 'warning' },
    );
    const temporaryPassword = await resetUserPwd(row.userId);
    await ElMessageBox.alert(
      `账号：${row.username} 临时密码：${temporaryPassword}。请现在安全保存并交付；关闭后无法再次查看。`,
      '临时密码（只显示一次）',
      {
        confirmButtonText: '我已安全保存',
        closeOnClickModal: false,
        closeOnPressEscape: false,
      },
    );
  } catch {
    /* 取消或请求层显示错误 */
  }
}

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function downloadTemplate() {
  if (!canQuery.value || templateLoading.value) return;
  templateLoading.value = true;
  try {
    saveBlob(await downloadUserImportTemplate(), '用户导入模板.xlsx');
  } catch {
    /* 请求层显示错误 */
  } finally {
    templateLoading.value = false;
  }
}

async function exportCurrentUsers() {
  if (!canQuery.value || exportLoading.value) return;
  exportLoading.value = true;
  try {
    saveBlob(await exportUsers(currentFilters()), '用户列表.xlsx');
  } catch {
    /* 请求层显示错误，包括导出行数超限 */
  } finally {
    exportLoading.value = false;
  }
}

function chooseImportFile() {
  if (can('system:user:add')) importInput.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !can('system:user:add')) return;

  importSummary.value = undefined;
  importError.value = '';
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    importError.value = '请选择 .xlsx 格式的工作簿';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    importError.value = '文件不能超过 5 MiB';
    return;
  }

  importLoading.value = true;
  try {
    importSummary.value = await importUsers(file);
    await load();
  } catch {
    importError.value = importSummary.value
      ? '导入结果已返回，但用户列表刷新失败；请手动刷新列表核对账号状态。'
      : '未能确认导入结果；请先刷新列表核对账号是否已创建，再决定是否重试。';
  } finally {
    importLoading.value = false;
  }
}

function csvCell(value: number | string) {
  const text = String(value);
  let leadingLength = 0;
  for (const character of text) {
    if (!/\s/u.test(character) && (character.codePointAt(0) ?? 32) >= 32) break;
    leadingLength += character.length;
  }
  const firstMeaningful = text.slice(leadingLength);
  const safe = /^[=+\-@]/u.test(firstMeaningful) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadImportErrors() {
  const failures = importSummary.value?.rows.filter(
    (row) => row.status === 'failed',
  );
  if (!failures?.length) return;
  const csv = [
    ['行号', '状态', '字段', '原因'].map((value) => csvCell(value)).join(','),
    ...failures.map((row) =>
      [row.rowNumber, '失败', row.field, row.reason]
        .map((value) => csvCell(value))
        .join(','),
    ),
  ].join('\r\n');
  saveBlob(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
    '用户导入错误行.csv',
  );
}
</script>

<template>
  <Page
    title="用户管理"
    class="user-management"
    header-class="!px-5 !py-3"
    auto-content-height
    content-class="flex min-h-0 flex-col !p-5"
  >
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4">
      <el-button link @click="load">重试</el-button>
    </el-alert>
    <el-alert
      v-if="importError"
      :title="importError"
      type="error"
      show-icon
      class="mb-4"
    />
    <template v-if="importSummary">
      <el-alert
        :title="`导入结果：共 ${importSummary.totalRows} 行，成功 ${importSummary.successCount}，失败 ${importSummary.failureCount}，跳过 ${importSummary.skippedCount}`"
        :type="importSummary.failureCount > 0 ? 'warning' : 'success'"
        show-icon
        class="mb-3"
      />
      <el-alert
        v-if="importSummary.successCount > 0"
        title="新账号待激活"
        type="info"
        show-icon
        class="mb-3"
      >
        <el-button
          v-if="canQuery"
          link
          type="primary"
          @click="showPendingUsers"
        >
          查看禁用账号
        </el-button>
      </el-alert>
      <div class="mb-2 flex justify-end">
        <el-button
          v-if="importSummary.failureCount > 0"
          size="small"
          @click="downloadImportErrors"
        >
          下载错误行报告
        </el-button>
      </div>
      <ImportGrid :grid-options="{ data: importSummary.rows }" class="mb-4" />
    </template>
    <Grid class="min-h-0 flex-1 !rounded-none !bg-transparent">
      <template #toolbar-actions>
        <el-button v-if="canOpenDialog('create')" type="primary" @click="add">
          新增用户
        </el-button>
        <el-button
          v-if="can('system:user:add')"
          :loading="importLoading"
          @click="chooseImportFile"
        >
          {{ importLoading ? '正在导入' : '导入用户' }}
        </el-button>
        <el-dropdown v-if="canQuery" trigger="click" class="ml-3">
          <el-button :loading="templateLoading || exportLoading">
            更多操作
            <ChevronDown class="ml-2 size-3.5" />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                :disabled="templateLoading"
                @click="downloadTemplate"
              >
                下载导入模板
              </el-dropdown-item>
              <el-dropdown-item
                :disabled="exportLoading"
                @click="exportCurrentUsers"
              >
                导出筛选结果
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-popover
          v-if="can('system:user:add')"
          placement="bottom"
          :width="280"
          trigger="click"
        >
          <template #reference>
            <el-button text class="ml-2">导入说明</el-button>
          </template>
          <p>.xlsx，最多1000行 / 5 MiB。</p>
          <p>角色标识：多个值用逗号分隔。逐行处理，错误行会列出原因。</p>
          <p class="mt-2">
            导入不回显密码。新账号待激活，核对角色后再重置密码并启用。
          </p>
        </el-popover>
        <input
          ref="importInput"
          type="file"
          accept=".xlsx"
          style="display: none"
          @change="handleImportFile"
        />
      </template>
      <template #toolbar-tools>
        <div class="flex items-center gap-2">
          <el-input
            v-model="quickSearch"
            class="w-[200px]"
            placeholder="搜索账号"
            aria-label="搜索账号"
            clearable
            @keyup.enter="searchAccounts"
            @clear="searchAccounts"
          >
            <template #prefix>
              <Search class="size-4" />
            </template>
          </el-input>
          <el-tooltip
            :content="gridState.showSearchForm ? '收起筛选' : '高级筛选'"
          >
            <el-button
              text
              :type="gridState.showSearchForm ? 'primary' : undefined"
              :aria-label="gridState.showSearchForm ? '收起筛选' : '高级筛选'"
              :aria-expanded="!!gridState.showSearchForm"
              @click="gridApi.toggleSearchForm()"
            >
              <i class="vxe-icon-funnel" aria-hidden="true"></i>
            </el-button>
          </el-tooltip>
        </div>
      </template>
      <template #status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'danger'">
          {{ row.status === 1 ? '启用' : '禁用' }}
        </el-tag>
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2 whitespace-nowrap">
          <el-button
            v-if="canOpenDialog('view')"
            link
            type="primary"
            class="!m-0"
            @click="view(row)"
          >
            详情
          </el-button>
          <el-button
            v-if="canOpenDialog('edit')"
            link
            type="primary"
            class="!m-0"
            @click="edit(row)"
          >
            编辑
          </el-button>
          <el-dropdown
            v-if="can('system:user:edit') || can('system:user:remove')"
            trigger="click"
            class="!ml-0"
          >
            <el-button link type="primary">
              更多
              <ChevronDown class="ml-1 size-3" />
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-if="can('system:user:edit')"
                  @click="resetPassword(row)"
                >
                  重置密码
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="can('system:user:remove')"
                  @click="remove(row)"
                >
                  <span class="text-destructive">删除用户</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>
    </Grid>
    <EditModal @saved="load" />
  </Page>
</template>

<style scoped>
/* Only this business page is the layout sample pending user review. */
.user-management :deep(.vxe-grid--form-wrapper > div) {
  margin-bottom: 16px;
  padding: 20px 20px 16px;
  border-radius: 0;
  background: hsl(var(--card));
}

.user-management :deep(.vxe-toolbar) {
  background: transparent;
  padding-bottom: 16px;
}

.user-management :deep(.vxe-grid--layout-body-content-wrapper) {
  background: hsl(var(--card));
}

.user-management :deep(.vxe-tools--operate .vxe-button) {
  border-color: transparent;
  border-radius: 4px;
  background: transparent;
}

.user-management :deep(.vxe-table) {
  --vxe-ui-table-header-background-color: hsl(var(--card));
}

.user-management :deep(.vxe-cell) {
  padding-right: 20px !important;
  padding-left: 20px !important;
}

.user-management :deep(.vxe-pager) {
  margin-top: 0;
  border-top: 1px solid hsl(var(--border));
  padding: 12px 20px;
}

.user-management :deep(.vxe-pager--total) {
  margin-right: auto;
  margin-left: 0;
}

.user-management :deep(.vxe-pager--sizes) {
  margin-right: 0;
}

@media (max-width: 767px) {
  .user-management :deep(.vxe-toolbar) {
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>
