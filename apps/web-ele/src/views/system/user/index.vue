<script lang="ts" setup>
import type { FormInstance, FormRules } from 'element-plus';

import type { UserForm, UserImportSummary, UserInfo } from '#/api/system/user';
import type { EntityDialogMode } from '#/composables/use-entity-dialog';

import { computed, nextTick, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { getRoleList } from '#/api/system/role';
import {
  addUser,
  downloadUserImportTemplate,
  exportUsers,
  getUser,
  getUserList,
  importUsers,
  removeUser,
  resetUserPwd,
  updateUser,
} from '#/api/system/user';
import { useEntityDialog } from '#/composables/use-entity-dialog';

const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);
const canQuery = computed(() => can('system:user:list'));
const filters = reactive({ username: '', mobile: '', status: '' });
const page = reactive({ pageNum: 1, pageSize: 10 });
const rows = ref<UserInfo[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const importInput = ref<HTMLInputElement>();
const importLoading = ref(false);
const templateLoading = ref(false);
const exportLoading = ref(false);
const importSummary = ref<UserImportSummary>();
const importError = ref('');
const roleOptions = ref<{ roleId: string; roleName: string; status: number }[]>(
  [],
);
const formRef = ref<FormInstance>();
const emptyUserForm = (): UserForm => ({
  username: '',
  nickname: '',
  email: '',
  mobile: '',
  avatar: '',
  status: 1,
  password: '',
  roleIds: [],
});
function canOpenDialog(mode: EntityDialogMode) {
  if (mode === 'create') return can('system:user:add');
  if (mode === 'view') return can('system:user:query');
  return can('system:user:edit') && can('system:user:query');
}

const {
  beforeClose,
  clearFieldError,
  fieldErrors,
  form,
  loading: formLoading,
  mode: dialogMode,
  open: openDialog,
  requestClose,
  reset: resetDialog,
  saving,
  submit: save,
  submitError,
  visible: dialogVisible,
} = useEntityDialog<UserForm>({
  allowed: canOpenDialog,
  empty: emptyUserForm,
  prepare: async (mode, id) => {
    await loadRoles();
    if (mode === 'create') return emptyUserForm();
    if (!id) throw new Error('缺少用户 ID');
    const detail = await getUser(id);
    return {
      ...emptyUserForm(),
      ...detail.user,
      password: '',
      roleIds: detail.roleIds ?? [],
    };
  },
  save: (mode, value) => {
    const payload = { ...value, roleIds: [...value.roleIds] };
    if (mode === 'edit' && !payload.password) delete payload.password;
    return mode === 'create' ? addUser(payload) : updateUser(payload);
  },
  validate: async () => {
    if (!formRef.value) return false;
    try {
      await formRef.value.validate();
      return true;
    } catch {
      return false;
    }
  },
  onSaved: load,
  parseError: (message) => {
    const patterns = [
      ['username', /用户名|用户账号|账号/],
      ['mobile', /手机号/],
      ['password', /密码/],
      ['nickname', /昵称/],
      ['email', /邮箱/],
      ['roleIds', /角色/],
    ] as const;
    const field = patterns.find(([, pattern]) => pattern.test(message))?.[0];
    return {
      message,
      fieldErrors: field ? { [field]: message } : {},
    };
  },
});
const isEdit = computed(() => dialogMode.value === 'edit');
const rules: FormRules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    {
      pattern: /^\w{2,30}$/,
      message: '账号需为2至30位字母、数字或下划线',
      trigger: 'blur',
    },
  ],
  password: [
    {
      validator: (_rule, value, callback) => {
        if (!isEdit.value && !value) callback(new Error('请输入密码'));
        else if (value && (value.length < 6 || value.length > 20))
          callback(new Error('密码需为6至20位'));
        else callback();
      },
      trigger: 'blur',
    },
  ],
  mobile: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
  nickname: [{ max: 30, message: '昵称不能超过30个字符', trigger: 'blur' }],
};

async function load() {
  if (!canQuery.value) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await getUserList({
      ...page,
      ...currentFilters(),
    });
    rows.value = data.records ?? [];
    total.value = Number(data.total ?? 0);
  } catch {
    rows.value = [];
    total.value = 0;
    error.value = '用户列表加载失败，请重试';
  } finally {
    loading.value = false;
  }
}
function currentFilters() {
  return {
    ...(filters.username.trim() && { username: filters.username.trim() }),
    ...(filters.mobile.trim() && { mobile: filters.mobile.trim() }),
    ...(filters.status !== '' && { status: filters.status }),
  };
}
function search() {
  page.pageNum = 1;
  void load();
}
function showPendingUsers() {
  filters.username = '';
  filters.mobile = '';
  filters.status = '0';
  page.pageNum = 1;
  void load();
}
function reset() {
  filters.username = '';
  filters.mobile = '';
  filters.status = '';
  search();
}
async function loadRoles() {
  const options: { roleId: string; roleName: string; status: number }[] = [];
  let pageNum = 1;
  let totalRoles = 0;
  do {
    const result = await getRoleList({ pageNum, pageSize: 100 });
    options.push(
      ...(result.records ?? []).map((role) => ({
        roleId: role.roleId,
        roleName: role.roleName,
        status: role.status,
      })),
    );
    totalRoles = Number(result.total ?? 0);
    if (!result.records?.length) break;
    pageNum += 1;
  } while (options.length < totalRoles);
  roleOptions.value = options;
}
const add = () => openDialog('create');
const edit = (row: UserInfo) => openDialog('edit', row.userId);
const view = (row: UserInfo) => openDialog('view', row.userId);
async function resetDialogForm() {
  if (!resetDialog()) return;
  await nextTick();
  formRef.value?.clearValidate();
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
onMounted(load);
</script>

<template>
  <Page title="用户管理">
    <el-form :inline="true" :model="filters">
      <el-form-item label="账号">
        <el-input v-model="filters.username" clearable @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="filters.mobile" clearable @keyup.enter="search" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="filters.status" clearable style="width: 120px">
          <el-option label="启用" value="1" />
          <el-option label="禁用" value="0" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </el-form-item>
    </el-form>
    <div class="mb-4 flex flex-wrap gap-2">
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
      <el-button
        v-if="canOpenDialog('create')"
        type="primary"
        :loading="formLoading"
        @click="add"
      >
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
        <template #reference><el-button link>导入字段说明</el-button></template>
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
    </div>
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
      <el-table
        :data="importSummary.rows"
        height="320"
        empty-text="工作簿没有数据行"
        class="mb-4"
      >
        <el-table-column prop="rowNumber" label="行号" width="90" />
        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'success'
                  ? 'success'
                  : row.status === 'failed'
                    ? 'danger'
                    : 'info'
              "
            >
              {{
                row.status === 'success'
                  ? '成功'
                  : row.status === 'failed'
                    ? '失败'
                    : '跳过'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="field" label="字段" width="130" />
        <el-table-column
          prop="reason"
          label="原因"
          min-width="220"
          show-overflow-tooltip
        />
      </el-table>
    </template>
    <el-table v-loading="loading" :data="rows" empty-text="暂无用户">
      <el-table-column prop="username" label="账号" />
      <el-table-column prop="nickname" label="昵称" />
      <el-table-column prop="mobile" label="手机号" />
      <el-table-column prop="email" label="邮箱" />
      <el-table-column label="状态">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="创建时间" />
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
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
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="page.pageNum"
      v-model:page-size="page.pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      class="mt-4 justify-end"
      @change="load"
    />
    <el-dialog
      v-model="dialogVisible"
      :title="
        dialogMode === 'create'
          ? '新增用户'
          : dialogMode === 'edit'
            ? '编辑用户'
            : '用户详情'
      "
      width="560px"
      destroy-on-close
      :before-close="beforeClose"
    >
      <el-alert
        v-if="submitError"
        :title="submitError"
        type="error"
        show-icon
        class="mb-4"
      />
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :disabled="dialogMode === 'view'"
        label-width="90px"
      >
        <el-form-item
          label="账号"
          prop="username"
          :error="fieldErrors.username"
        >
          <el-input
            v-model="form.username"
            autocomplete="off"
            @input="clearFieldError('username')"
          />
        </el-form-item>
        <el-form-item
          v-if="dialogMode !== 'view'"
          label="密码"
          prop="password"
          :error="fieldErrors.password"
        >
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="isEdit ? '留空则不修改' : '至少6位'"
            @input="clearFieldError('password')"
          />
        </el-form-item>
        <el-form-item
          label="昵称"
          prop="nickname"
          :error="fieldErrors.nickname"
        >
          <el-input
            v-model="form.nickname"
            @input="clearFieldError('nickname')"
          />
        </el-form-item>
        <el-form-item label="手机号" prop="mobile" :error="fieldErrors.mobile">
          <el-input v-model="form.mobile" @input="clearFieldError('mobile')" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email" :error="fieldErrors.email">
          <el-input v-model="form.email" @input="clearFieldError('email')" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
          <el-popover placement="top" :width="240" trigger="click">
            <template #reference>
              <el-button link class="ml-2">启用说明</el-button>
            </template>
            <p>
              待激活账号需先核对角色，并重置和安全交付一次性密码，再启用登录。
            </p>
          </el-popover>
        </el-form-item>
        <el-form-item label="角色" prop="roleIds" :error="fieldErrors.roleIds">
          <el-select
            v-model="form.roleIds"
            multiple
            clearable
            class="w-full"
            @change="clearFieldError('roleIds')"
          >
            <el-option
              v-for="role in roleOptions"
              :key="role.roleId"
              :label="
                role.status === 1
                  ? role.roleName
                  : `${role.roleName}（已停用，可移除）`
              "
              :disabled="
                role.status !== 1 && !form.roleIds.includes(role.roleId)
              "
              :value="role.roleId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="requestClose">
          {{ dialogMode === 'view' ? '关闭' : '取消' }}
        </el-button>
        <template v-if="dialogMode !== 'view'">
          <el-button :disabled="saving" @click="resetDialogForm">
            重置
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="formLoading"
            @click="save"
          >
            保存
          </el-button>
        </template>
      </template>
    </el-dialog>
  </Page>
</template>
