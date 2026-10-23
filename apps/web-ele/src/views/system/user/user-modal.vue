<script lang="ts" setup>
import type { RoleInfo } from '#/api/system/role';
import type { UserForm } from '#/api/system/user';
import type { EntityDialogMode } from '#/composables/use-entity-dialog';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import { getRoleList } from '#/api/system/role';
import { addUser, getUser, updateUser } from '#/api/system/user';

const emit = defineEmits<{ saved: [] }>();
const access = useAccessStore();
const mode = ref<EntityDialogMode>('create');
const submitError = ref('');
const rolesEditable = ref(false);
const roleWarning = ref('');
let baseline: UserForm;
const busy = ref(false);
let prepared = false;
let saved = false;
let request = 0;

function emptyForm(): UserForm {
  return {
    username: '',
    nickname: '',
    mobile: '',
    email: '',
    avatar: '',
    password: '',
    status: 1,
    roleIds: [],
  };
}
function allowed() {
  if (mode.value === 'create')
    return access.accessCodes.includes('system:user:add');
  return (
    access.accessCodes.includes('system:user:query') &&
    (mode.value === 'view' || access.accessCodes.includes('system:user:edit'))
  );
}

const [Form, formApi] = useVbenForm({
  commonConfig: { componentProps: { class: 'w-full' }, labelWidth: 90 },
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  schema: [
    {
      fieldName: 'username',
      label: '账号',
      component: 'Input',
      rules: z
        .string()
        .regex(/^\w{2,30}$/, '账号需为2至30位字母、数字或下划线'),
    },
    {
      fieldName: 'password',
      label: '密码',
      component: 'Input',
      componentProps: {
        type: 'password',
        showPassword: true,
        autocomplete: 'new-password',
      },
    },
    {
      fieldName: 'nickname',
      label: '昵称',
      component: 'Input',
      rules: z.string().max(30, '昵称不能超过30个字符'),
    },
    {
      fieldName: 'mobile',
      label: '手机号',
      component: 'Input',
      rules: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
    },
    {
      fieldName: 'email',
      label: '邮箱',
      component: 'Input',
      rules: z.union([z.literal(''), z.string().email('邮箱格式不正确')]),
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'RadioGroup',
      componentProps: {
        options: [
          { label: '启用', value: 1 },
          { label: '禁用', value: 0 },
        ],
      },
      help: '待激活账号需先核对角色，并重置和安全交付一次性密码，再启用登录。',
    },
    {
      fieldName: 'roleIds',
      label: '角色',
      component: 'Select',
      componentProps: { multiple: true, clearable: true, options: [] },
    },
  ],
});

const [Modal, modalApi] = useVbenModal({
  confirmText: '保存',
  onBeforeClose: async () => {
    if (busy.value) return false;
    if (saved || mode.value === 'view' || !prepared) return true;
    const values = await formApi.getValues<UserForm>();
    const changed = Object.keys(emptyForm()).some((key) => {
      const field = key as keyof UserForm;
      return (
        JSON.stringify(values[field] ?? baseline[field]) !==
        JSON.stringify(baseline[field])
      );
    });
    if (!changed) return true;
    try {
      await ElMessageBox.confirm(
        '当前修改尚未保存，确定放弃吗？',
        '未保存的修改',
        {
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
          type: 'warning',
        },
      );
      return true;
    } catch {
      return false;
    }
  },
  onConfirm: async () => {
    if (busy.value || !prepared || mode.value === 'view' || !allowed()) return;
    busy.value = true;
    submitError.value = '';
    modalApi.lock();
    try {
      const validation = await formApi.validate();
      if (!validation.valid) return;
      const values = await formApi.getValues<UserForm>();
      const payload: UserForm = {
        ...baseline,
        ...values,
        roleIds:
          rolesEditable.value && access.accessCodes.includes('system:role:list')
            ? [...(values.roleIds ?? [])]
            : [...baseline.roleIds],
      };
      if (mode.value === 'edit' && !payload.password) delete payload.password;
      await (mode.value === 'create' ? addUser(payload) : updateUser(payload));
      saved = true;
      ElMessage.success('保存成功');
    } catch (error) {
      const failure = error as {
        message?: string;
        msg?: string;
        response?: { data?: { msg?: string } };
      };
      const message =
        failure?.response?.data?.msg ??
        failure?.msg ??
        failure?.message ??
        '保存失败，请检查输入后重试';
      submitError.value = message;
      const fields = [
        ['username', /用户名|用户账号|账号/],
        ['mobile', /手机号/],
        ['password', /密码/],
        ['nickname', /昵称/],
        ['email', /邮箱/],
        ['roleIds', /角色/],
      ] as const;
      const field = fields.find(([, pattern]) => pattern.test(message))?.[0];
      if (field) formApi.form.setFieldError(field, message);
    } finally {
      busy.value = false;
      modalApi.unlock();
    }
    if (saved) {
      await modalApi.close();
      emit('saved');
    }
  },
  onOpenChange: async (isOpen) => {
    const current = ++request;
    if (!isOpen) return;
    const data = modalApi.getData<{ id?: string; mode: EntityDialogMode }>();
    mode.value = data.mode;
    saved = false;
    prepared = false;
    rolesEditable.value = false;
    roleWarning.value = '';
    submitError.value = '';
    if (!allowed()) {
      saved = true;
      await modalApi.close();
      return;
    }
    busy.value = true;
    modalApi.setState({
      loading: true,
      title: { create: '新增用户', edit: '编辑用户', view: '用户详情' }[
        mode.value
      ],
      showConfirmButton: mode.value !== 'view',
      cancelText: mode.value === 'view' ? '关闭' : '取消',
    });
    try {
      await formApi.resetForm();
      let value = emptyForm();
      if (mode.value !== 'create') {
        if (!data.id) throw new Error('缺少用户 ID');
        const detail = await getUser(data.id);
        value = {
          ...value,
          ...detail.user,
          roleIds: detail.roleIds ?? [],
          nickname: detail.user.nickname ?? '',
          email: detail.user.email ?? '',
          mobile: detail.user.mobile ?? '',
          password: '',
        };
      }
      const roles: RoleInfo[] = [];
      if (access.accessCodes.includes('system:role:list')) {
        try {
          for (let pageNum = 1; ; pageNum += 1) {
            const result = await getRoleList({ pageNum, pageSize: 100 });
            roles.push(...result.records);
            if (
              result.records.length === 0 ||
              roles.length >= Number(result.total)
            )
              break;
          }
          rolesEditable.value = true;
        } catch {
          roleWarning.value =
            '角色列表加载失败，可继续修改普通资料；原角色保持不变。';
        }
      }
      if (current !== request) return;
      baseline = structuredClone(value);
      formApi.setState({ commonConfig: { disabled: mode.value === 'view' } });
      formApi.updateSchema([
        {
          fieldName: 'password',
          dependencies: { if: () => mode.value !== 'view', triggerFields: [] },
          componentProps: {
            placeholder: mode.value === 'edit' ? '留空则不修改' : '6至20位密码',
          },
          rules: z
            .string()
            .refine(
              (password) =>
                (mode.value === 'edit' && password === '') ||
                (password.length >= 6 && password.length <= 20),
              '密码需为6至20位',
            ),
        },
        {
          fieldName: 'roleIds',
          help: rolesEditable.value
            ? '停用角色只能保留或移除，不能新分配。'
            : '无角色列表查看权限或列表不可用，仅保留原角色。',
          componentProps: (values) => ({
            disabled: !rolesEditable.value || mode.value === 'view',
            options: rolesEditable.value
              ? roles.map((role) => ({
                  label:
                    role.status === 1
                      ? role.roleName
                      : `${role.roleName}（已停用，可移除）`,
                  value: role.roleId,
                  disabled:
                    role.status !== 1 &&
                    !(values.roleIds ?? []).includes(role.roleId),
                }))
              : value.roleIds.map((id) => ({ label: id, value: id })),
          }),
        },
      ]);
      await formApi.setValues(value);
      prepared = true;
    } catch {
      submitError.value = '表单数据加载失败，请关闭后重试';
      modalApi.setState({ confirmDisabled: true });
    } finally {
      if (current === request) {
        busy.value = false;
        modalApi.setState({
          loading: false,
          confirmDisabled: !prepared,
        });
      }
    }
  },
});

async function reset() {
  if (busy.value || mode.value === 'view' || !prepared) return;
  await formApi.resetForm();
  await formApi.setValues(baseline);
  submitError.value = '';
}
</script>

<template>
  <Modal class="w-full max-w-[560px]">
    <el-alert
      v-if="submitError"
      :title="submitError"
      type="error"
      show-icon
      class="mb-4"
    />
    <el-alert
      v-if="roleWarning"
      :title="roleWarning"
      type="warning"
      show-icon
      class="mb-4"
    />
    <Form />
    <template #prepend-footer>
      <el-button v-if="mode !== 'view'" :disabled="busy" @click="reset">
        重置
      </el-button>
    </template>
  </Modal>
</template>
