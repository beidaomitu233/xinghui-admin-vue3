<script lang="ts" setup>
import type { UserImportSummary, UserInfo } from '#/api/system/user';
import type { EntityDialogMode } from '#/composables/use-entity-dialog';

import { computed, ref } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
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
const can = (code: string) => accessStore.accessCodes.includes(code);
const canQuery = computed(() => can('system:user:list'));
const error = ref('');
const importInput = ref<HTMLInputElement>();
const importLoading = ref(false);
const templateLoading = ref(false);
const exportLoading = ref(false);
const importSummary = ref<UserImportSummary>();
const importError = ref('');
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
let ordering: { order: 'asc' | 'desc'; orderBy: string } = {
  orderBy: 'createTime',
  order: 'desc',
};
let latestQuery: Promise<{ items: UserInfo[]; total: number }> | undefined;
const [Grid, gridApi] = useVbenVxeGrid<UserInfo>({
  tableTitle: '用户列表',
  formOptions: {
    collapsed: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'username',
        label: '账号',
        component: 'Input',
        defaultValue: '',
      },
      {
        fieldName: 'mobile',
        label: '手机号',
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
            { label: '启用', value: '1' },
            { label: '禁用', value: '0' },
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
      // eslint-disable-next-line unicorn/no-array-sort -- VxeGrid.sort 是原生表头排序 API，非数组排序。
      await gridApi.grid.sort({ field: 'createTime', order: 'desc' });
      ordering = { orderBy: 'createTime', order: 'desc' };
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'userId' },
    columns: [
      { field: 'username', title: '账号', minWidth: 140, sortable: true },
      { field: 'nickname', title: '昵称', minWidth: 120, sortable: true },
      { field: 'mobile', title: '手机号', minWidth: 140, sortable: true },
      { field: 'email', title: '邮箱', minWidth: 180, sortable: true },
      {
        field: 'status',
        title: '状态',
        width: 100,
        sortable: true,
        slots: { default: 'status' },
      },
      { field: 'createTime', title: '创建时间', width: 180, sortable: true },
      {
        title: '操作',
        width: 280,
        fixed: 'right',
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
      refresh: { code: 'query' },
      zoom: true,
      search: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: async (
          {
            page,
            sort,
          }: {
            page: { currentPage: number; pageSize: number };
            sort: { field: string; order: 'asc' | 'desc' | null };
          },
          values: Record<string, unknown>,
        ) => {
          ordering =
            sort?.order && sortableFields.has(sort.field)
              ? { orderBy: sort.field, order: sort.order }
              : { orderBy: 'createTime', order: 'desc' };
          const pending = (async () => {
            if (!canQuery.value) return { items: [], total: 0 };
            let parameters = {
              pageNum: page.currentPage,
              pageSize: page.pageSize,
              ...filterValues(values),
              ...ordering,
            };
            for (;;) {
              let response: Awaited<ReturnType<typeof getUserList>> | undefined;
              let failure: unknown;
              try {
                response = await getUserList(parameters);
              } catch (error_) {
                failure = error_;
              }
              // 本仓 Vxe 忙碌时忽略 commitProxy。读取原生当前页/排序和最近提交表单，
              // 在返回结果前接续处理期间的新操作，避免旧页覆盖新筛选。
              if (gridApi.grid.getCurrentPage) {
                const submitted = filterValues(
                  gridApi.formApi.getLatestSubmissionValues(),
                );
                if (
                  JSON.stringify(submitted) !==
                  JSON.stringify(filterValues(parameters))
                ) {
                  await gridApi.grid.setCurrentPage(1);
                }
                const currentSort = gridApi.grid.getSortColumns()[0];
                const currentOrder: typeof ordering =
                  currentSort?.order && sortableFields.has(currentSort.field)
                    ? {
                        orderBy: currentSort.field,
                        order: currentSort.order === 'asc' ? 'asc' : 'desc',
                      }
                    : { orderBy: 'createTime', order: 'desc' };
                const current = {
                  pageNum: gridApi.grid.getCurrentPage(),
                  pageSize: gridApi.grid.getPageSize(),
                  ...submitted,
                  ...currentOrder,
                };
                if (JSON.stringify(current) !== JSON.stringify(parameters)) {
                  parameters = current;
                  ordering = currentOrder;
                  continue;
                }
              }
              if (failure) throw failure;
              if (!response) throw new Error('用户列表未返回结果');
              return { items: response.records ?? [], total: response.total };
            }
          })();
          latestQuery = pending;
          // 旧请求完成时等待最新查询，使迟到结果无法覆盖新筛选/排序。
          let active = pending;
          for (;;) {
            try {
              const result = await active;
              if (active !== latestQuery && latestQuery) {
                active = latestQuery;
                continue;
              }
              error.value = '';
              return result;
            } catch (error_) {
              if (active !== latestQuery && latestQuery) {
                active = latestQuery;
                continue;
              }
              error.value = '用户列表加载失败，请重试';
              throw error_;
            }
          }
        },
      },
    },
  },
});
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
    ...ordering,
  };
}
async function load() {
  await gridApi.query();
}
async function showPendingUsers() {
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
    description="管理账号、角色与登录状态"
    auto-content-height
    content-class="flex min-h-0 flex-col"
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
    <Grid class="min-h-0 flex-1">
      <template #toolbar-actions>
        <el-button
          v-if="canQuery"
          :loading="templateLoading"
          @click="downloadTemplate"
        >
          下载导入模板
        </el-button>
        <el-button
          v-if="can('system:user:add')"
          type="primary"
          :loading="importLoading"
          @click="chooseImportFile"
        >
          {{ importLoading ? '正在导入' : '导入用户' }}
        </el-button>
        <el-button
          v-if="canQuery"
          :loading="exportLoading"
          @click="exportCurrentUsers"
        >
          导出当前筛选结果
        </el-button>
        <el-button v-if="canOpenDialog('create')" type="primary" @click="add">
          新增用户
        </el-button>
        <span
          v-if="can('system:user:add')"
          class="self-center text-sm text-muted-foreground"
        >
          .xlsx，最多1000行 / 5 MiB
        </span>
        <el-popover
          v-if="can('system:user:add')"
          placement="bottom"
          :width="280"
          trigger="click"
        >
          <template #reference>
            <el-button link>导入字段说明</el-button>
          </template>
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
      <template #status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'danger'">
          {{ row.status === 1 ? '启用' : '禁用' }}
        </el-tag>
      </template>
      <template #actions="{ row }">
        <el-button v-if="canOpenDialog('view')" link @click="view(row)">
          详情
        </el-button>
        <el-button v-if="canOpenDialog('edit')" link @click="edit(row)">
          编辑
        </el-button>
        <el-button
          v-if="can('system:user:edit')"
          link
          @click="resetPassword(row)"
        >
          重置密码
        </el-button>
        <el-button
          v-if="can('system:user:remove')"
          link
          type="danger"
          @click="remove(row)"
        >
          删除
        </el-button>
      </template>
    </Grid>
    <EditModal @saved="load" />
  </Page>
</template>
