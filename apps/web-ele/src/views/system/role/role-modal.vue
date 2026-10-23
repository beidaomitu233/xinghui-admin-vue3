<script lang="ts" setup>
import type { TreeInstance } from 'element-plus';

import type { MenuInfo } from '#/api/system/menu';
import type { RoleForm } from '#/api/system/role';

import { nextTick, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import { getMenuTree } from '#/api/system/menu';
import {
  addRole,
  getMenuIdsByRoleId,
  getRole,
  updateRole,
} from '#/api/system/role';

const emit = defineEmits<{ saved: [] }>();
const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const tree = ref<TreeInstance>();
const menus = ref<MenuInfo[]>([]);
const menusEditable = ref(false);
const menuExpand = ref(true);
const menuAll = ref(false);
const busy = ref(false);
const error = ref('');
const menuWarning = ref('');
let baseline: RoleForm;
let ready = false;
let saved = false;
let request = 0;

function empty(): RoleForm {
  return { roleName: '', roleKey: '', status: 1, menuIds: [] };
}
const [Form, formApi] = useVbenForm({
  commonConfig: { labelWidth: 100, componentProps: { class: 'w-full' } },
  wrapperClass: 'grid-cols-1',
  showDefaultActions: false,
  schema: [
    {
      fieldName: 'roleName',
      label: '角色名称',
      component: 'Input',
      defaultValue: '',
      rules: z
        .string()
        .min(2, '角色名称需为2至30个字符')
        .max(30, '角色名称需为2至30个字符'),
    },
    {
      fieldName: 'roleKey',
      label: '角色标识',
      component: 'Input',
      defaultValue: '',
      rules: z
        .string()
        .regex(/^\w+$/, '只能使用字母、数字和下划线')
        .max(100, '角色标识不能超过100个字符'),
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'RadioGroup',
      defaultValue: 1,
      componentProps: {
        options: [
          { label: '正常', value: 1 },
          { label: '停用', value: 0 },
        ],
      },
    },
    {
      fieldName: 'menuIds',
      label: '菜单权限',
      component: 'Input',
      defaultValue: [],
    },
  ],
});
function checkedIds() {
  return menusEditable.value
    ? (tree.value?.getCheckedKeys() ?? []).map(String)
    : [...baseline.menuIds];
}
function comparable(value: RoleForm) {
  return JSON.stringify({
    roleName: value.roleName,
    roleKey: value.roleKey,
    status: value.status,
    menuIds: [...value.menuIds].toSorted(),
  });
}
watch(busy, (value) => formApi.setState({ commonConfig: { disabled: value } }), { flush: 'sync' });
const [Modal, modalApi] = useVbenModal({
  confirmText: '保存',
  onBeforeClose: async () => {
    if (busy.value) return false;
    if (!ready || saved) return true;
    const values = await formApi.getValues<RoleForm>();
    if (
      comparable({ ...baseline, ...values, menuIds: checkedIds() }) ===
      comparable(baseline)
    )
      return true;
    try {
      await ElMessageBox.confirm(
        '当前修改尚未保存，确定放弃吗？',
        '未保存的修改',
        {
          type: 'warning',
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
        },
      );
      return true;
    } catch {
      return false;
    }
  },
  onConfirm: async () => {
    if (
      busy.value ||
      !ready ||
      !can(baseline.roleId ? 'system:role:edit' : 'system:role:add')
    )
      return;
    busy.value = true;
    error.value = '';
    modalApi.lock();
    try {
      const validation = await formApi.validate();
      if (!validation.valid) return;
      const values = await formApi.getValues<RoleForm>();
      const payload = {
        ...baseline,
        ...values,
        roleId: baseline.roleId,
        dataScope: baseline.dataScope,
        menuIds: can('system:menu:list') ? checkedIds() : [...baseline.menuIds],
      };
      await (baseline.roleId ? updateRole(payload) : addRole(payload));
      saved = true;
      ElMessage.success('保存成功');
    } catch {
      error.value = '角色保存失败，请检查输入后重试';
    } finally {
      busy.value = false;
      modalApi.unlock();
    }
    if (saved) {
      await modalApi.close();
      emit('saved');
    }
  },
  onOpenChange: async (open) => {
    const current = ++request;
    if (!open) return;
    const token = access.accessToken;
    const { id } = modalApi.getData<{ id?: string }>();
    if (
      !can(id ? 'system:role:edit' : 'system:role:add') ||
      (id && !can('system:role:query'))
    ) {
      saved = true;
      await modalApi.close();
      return;
    }
    ready = false;
    saved = false;
    busy.value = true;
    error.value = '';
    menuWarning.value = '';
    menus.value = [];
    menusEditable.value = false;
    menuAll.value = false;
    menuExpand.value = true;
    modalApi.setState({
      title: id ? '编辑角色' : '新增角色',
      loading: true,
      confirmDisabled: true,
    });
    try {
      await formApi.resetForm();
      let value = empty();
      if (id) {
        const [role, menuIds] = await Promise.all([
          getRole(id),
          getMenuIdsByRoleId(id),
        ]);
        value = { ...value, ...role, menuIds };
      }
      let nextMenus: MenuInfo[] = [];
      let canEditMenus = false;
      if (can('system:menu:list')) {
        try {
          nextMenus = await getMenuTree();
          canEditMenus = true;
        } catch {
          menuWarning.value =
            '菜单列表加载失败，可编辑普通字段；保留原菜单权限。';
        }
      }
      if (current !== request || token !== access.accessToken) return;
      menus.value = nextMenus; menusEditable.value = canEditMenus;
      baseline = structuredClone(value);
      await formApi.setValues(value);
      ready = true;
      await nextTick();
      tree.value?.setCheckedKeys(value.menuIds);
    } catch {
      error.value = '角色加载失败，请关闭后重试';
    } finally {
      if (current === request) {
        busy.value = false;
        modalApi.setState({ loading: false, confirmDisabled: !ready });
      }
    }
  },
});
watch(() => JSON.stringify([access.accessToken, ...['system:role:query', 'system:role:edit', 'system:role:add', 'system:menu:list'].map(can)]), () => {
  request += 1; ready = false; saved = true; busy.value = false; menus.value = []; void modalApi.close();
});

function expand() {
  for (const node of Object.values(tree.value?.store.nodesMap ?? {}))
    node.expanded = menuExpand.value;
}
function allKeys(nodes: MenuInfo[]): string[] {
  return nodes.flatMap((node) => [
    node.menuId,
    ...allKeys(node.children ?? []),
  ]);
}
function checkAll() {
  tree.value?.setCheckedKeys(menuAll.value ? allKeys(menus.value) : []);
}
</script>

<template>
  <Modal class="w-full max-w-[600px]">
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4" />
    <el-alert
      v-if="menuWarning"
      :title="menuWarning"
      type="warning"
      show-icon
      class="mb-4"
    />
    <Form>
      <template #menuIds="{ disabled }">
        <div v-if="menusEditable" class="w-full">
          <el-checkbox :disabled="disabled" v-model="menuExpand" @change="expand">
            展开/折叠
          </el-checkbox>
          <el-checkbox :disabled="disabled" v-model="menuAll" @change="checkAll">
            全选/全不选
          </el-checkbox>
          <el-scrollbar max-height="260px">
            <el-tree
              ref="tree"
              :data="menus"
              :props="{ label: 'menuName', children: 'children', disabled: () => disabled }"
              show-checkbox
              node-key="menuId"
              default-expand-all
              check-strictly
            />
          </el-scrollbar>
        </div>
        <el-alert
          v-else
          title="无菜单列表查看权限或列表不可用，保留原菜单权限"
          type="info"
          :closable="false"
        />
      </template>
    </Form>
  </Modal>
</template>
