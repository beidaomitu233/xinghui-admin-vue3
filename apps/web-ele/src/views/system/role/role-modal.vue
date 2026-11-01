<script lang="ts" setup>
import type { TreeInstance } from 'element-plus';

import type { MenuInfo } from '#/api/system/menu';
import type { RoleForm } from '#/api/system/role';

import { computed, nextTick, ref, watch } from 'vue';

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
const keyword = ref('');
const activeGroup = ref('');
const checkedCount = ref(0);
const groupKeys = computed(
  () =>
    new Set(
      allKeys(
        activeGroup.value
          ? menus.value.filter((node) => node.menuId === activeGroup.value)
          : menus.value,
      ),
    ),
);
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
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
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
watch(
  busy,
  (value) => formApi.setState({ commonConfig: { disabled: value } }),
  { flush: 'sync' },
);
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
    keyword.value = '';
    activeGroup.value = '';
    checkedCount.value = 0;
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
      menus.value = nextMenus;
      menusEditable.value = canEditMenus;
      baseline = structuredClone(value);
      await formApi.setValues(value);
      ready = true;
      await nextTick();
      tree.value?.setCheckedKeys(value.menuIds);
      checkedCount.value = value.menuIds.length;
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
watch(
  () =>
    JSON.stringify([
      access.accessToken,
      ...[
        'system:role:query',
        'system:role:edit',
        'system:role:add',
        'system:menu:list',
      ].map((code) => can(code)),
    ]),
  () => {
    request += 1;
    ready = false;
    saved = true;
    busy.value = false;
    menus.value = [];
    void modalApi.close();
  },
);

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
  updateCount();
}
function updateCount() {
  checkedCount.value = tree.value?.getCheckedKeys().length ?? 0;
}
function selectGroup(select: boolean) {
  const keys = (tree.value?.getCheckedKeys() ?? []).map(String);
  tree.value?.setCheckedKeys(
    select
      ? [...new Set([...groupKeys.value, ...keys])]
      : keys.filter((key) => !groupKeys.value.has(key)),
  );
  updateCount();
}
function filterPermission(value: string, data: Record<string, unknown>) {
  return (
    groupKeys.value.has(String(data.menuId)) &&
    (!value ||
      `${data.menuName} ${data.perms ?? ''}`
        .toLocaleLowerCase()
        .includes(value.toLocaleLowerCase()))
  );
}
watch([keyword, activeGroup], () => {
  // eslint-disable-next-line unicorn/no-array-callback-reference -- Element Tree takes search text, not an array predicate.
  tree.value?.filter(keyword.value);
});
</script>

<template>
  <Modal class="w-full max-w-[1100px]">
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4" />
    <el-alert
      v-if="menuWarning"
      :title="menuWarning"
      type="warning"
      show-icon
      class="mb-4"
    />
    <Form />
    <section
      v-if="menusEditable"
      aria-label="角色权限"
      class="permission-panel"
    >
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <span class="font-medium">功能权限</span>
        <el-tag size="small" type="info">已选 {{ checkedCount }} 项</el-tag>
        <el-input
          v-model="keyword"
          placeholder="搜索页面、模块或权限标识"
          clearable
          class="!w-64"
          :disabled="busy"
        />
        <el-checkbox v-model="menuExpand" :disabled="busy" @change="expand">
          展开全部
        </el-checkbox>
        <el-checkbox v-model="menuAll" :disabled="busy" @change="checkAll">
          全选
        </el-checkbox>
      </div>
      <div class="permission-workspace">
        <el-scrollbar class="permission-groups">
          <el-menu
            :default-active="activeGroup"
            @select="(key: string) => (activeGroup = key)"
          >
            <el-menu-item index="">全部权限</el-menu-item>
            <el-menu-item
              v-for="item in menus"
              :key="item.menuId"
              :index="item.menuId"
            >
              {{ item.menuName }}
            </el-menu-item>
          </el-menu>
        </el-scrollbar>
        <div class="flex min-h-0 min-w-0 flex-col">
          <div class="flex items-center gap-3 border-b p-3">
            <span class="flex-1 text-sm text-muted-foreground">
              {{
                activeGroup
                  ? menus.find((item) => item.menuId === activeGroup)?.menuName
                  : '全部权限'
              }}
            </span>
            <el-button
              link
              type="primary"
              :disabled="busy"
              @click="selectGroup(true)"
            >
              选择当前分类
            </el-button>
            <el-button link :disabled="busy" @click="selectGroup(false)">
              清空当前分类
            </el-button>
          </div>
          <el-scrollbar class="min-h-0 flex-1 p-3">
            <el-tree
              ref="tree"
              :data="menus"
              :props="{
                label: 'menuName',
                children: 'children',
                disabled: () => busy,
              }"
              :filter-node-method="filterPermission"
              show-checkbox
              node-key="menuId"
              default-expand-all
              check-strictly
              @check="updateCount"
            >
              <template #default="{ data }">
                <span class="permission-node">
                  <span :class="{ 'font-medium': data.menuType !== 'F' }">
                    {{ data.menuName }}
                  </span>
                  <el-tag v-if="data.menuType === 'G'" size="small" type="info">
                    模块
                  </el-tag>
                  <span v-if="data.perms" class="text-xs text-muted-foreground">
                    {{ data.perms }}
                  </span>
                </span>
              </template>
            </el-tree>
          </el-scrollbar>
        </div>
      </div>
    </section>
    <el-alert
      v-else
      title="无菜单列表查看权限或列表不可用，保留原菜单权限"
      type="info"
      :closable="false"
    />
  </Modal>
</template>

<style scoped>
.permission-workspace {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  height: min(56vh, 600px);
  min-height: 320px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
}

.permission-groups {
  border-right: 1px solid hsl(var(--border));
}

.permission-groups :deep(.el-menu) {
  border-right: 0;
}

.permission-node {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding-block: 4px;
}

.permission-panel :deep(.el-tree-node__content) {
  height: auto;
  min-height: 36px;
}

@media (max-width: 640px) {
  .permission-workspace {
    grid-template-columns: 120px minmax(0, 1fr);
  }
}
</style>
