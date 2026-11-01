<script lang="ts" setup>
import type { ConfigChange, ConfigView } from '#/api/system/config';

import { ref } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  addConfig,
  editConfig,
  getConfig,
  listConfigs,
  removeConfig,
} from '#/api/system/config';

const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const error = ref('');
const submitError = ref('');
const busy = ref(false);
const editingId = ref<number>();
let ready = false;
let saved = false;
let baseline: ConfigChange = {
  configKey: 'sys.index.footerText',
  configValue: '',
};
const valueOptions: Record<string, { label: string; value: string }[]> = {
  'sys.index.skinName': [
    { label: '蓝色', value: 'skin-blue' },
    { label: '绿色', value: 'skin-green' },
    { label: '紫色', value: 'skin-purple' },
    { label: '红色', value: 'skin-red' },
    { label: '黄色', value: 'skin-yellow' },
  ],
  'sys.index.sideTheme': [
    { label: '深色', value: 'theme-dark' },
    { label: '浅色', value: 'theme-light' },
  ],
  'sys.account.captchaOnOff': [
    { label: 'true', value: 'true' },
    { label: 'false', value: 'false' },
  ],
  'sys.account.registerUser': [
    { label: 'true', value: 'true' },
    { label: 'false', value: 'false' },
  ],
};

const [Grid, gridApi] = useVbenVxeGrid<ConfigView>({
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'configId' },
    // 服务端固定白名单目录最多5项，完整返回；原生本地排序作用于完整集合。
    pagerConfig: { enabled: false },
    sortConfig: { remote: false, multiple: false },
    toolbarConfig: { refresh: true, custom: true },
    columns: [
      { field: 'configName', title: '名称', minWidth: 170, sortable: true },
      { field: 'configKey', title: '参数键', minWidth: 210, sortable: true },
      { field: 'configValue', title: '参数值', minWidth: 160, sortable: true },
      {
        field: 'runtimeActive',
        title: '生效状态',
        minWidth: 140,
        slots: { default: 'runtime' },
      },
      { title: '操作', width: 165, slots: { default: 'actions' } },
    ],
    proxyConfig: {
      ajax: {
        query: async () => {
          if (!can('system:config:list')) return { items: [], total: 0 };
          try {
            const items = await listConfigs();
            error.value = '';
            return { items, total: items.length };
          } catch (error_) {
            error.value = '参数列表加载失败，请重试';
            throw error_;
          }
        },
      },
    },
  },
});
const [Form, formApi] = useVbenForm({
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  commonConfig: { componentProps: { class: 'w-full' }, labelWidth: 90 },
  schema: [
    {
      fieldName: 'configKey',
      label: '参数键',
      component: 'Input',
      componentProps: { disabled: true },
    },
    {
      fieldName: 'configValue',
      label: '参数值',
      component: 'Input',
      defaultValue: '',
      rules: z
        .string()
        .max(100, '最多100个字符')
        .refine((value) => !!value.trim(), '请输入参数值'),
    },
  ],
});
const [Modal, modalApi] = useVbenModal({
  confirmText: '保存',
  onBeforeClose: async () => {
    if (busy.value) return false;
    if (!ready || saved) return true;
    const value = await formApi.getValues<ConfigChange>();
    if (value.configValue === baseline.configValue) return true;
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
      !ready ||
      busy.value ||
      !can(
        editingId.value === undefined
          ? 'system:config:add'
          : 'system:config:edit',
      )
    )
      return;
    busy.value = true;
    modalApi.lock();
    submitError.value = '';
    try {
      const validation = await formApi.validate();
      if (!validation.valid) return;
      const values = await formApi.getValues<ConfigChange>();
      const payload = {
        configKey: baseline.configKey,
        configValue: values.configValue,
      };
      await (editingId.value === undefined
        ? addConfig(payload)
        : editConfig(editingId.value, payload));
      saved = true;
      ElMessage.success('保存成功');
    } catch {
      submitError.value = '保存失败，请检查参数后重试';
    } finally {
      busy.value = false;
      modalApi.unlock();
    }
    if (saved) {
      await modalApi.close();
      await gridApi.query();
    }
  },
});
async function open(row?: ConfigView) {
  if (!can(row ? 'system:config:edit' : 'system:config:add') || busy.value)
    return;
  ready = false;
  saved = false;
  submitError.value = '';
  editingId.value = row?.configId;
  busy.value = true;
  modalApi
    .setState({
      title: row ? '修改参数' : '新增页脚文案',
      loading: true,
      confirmDisabled: true,
    })
    .open();
  try {
    await formApi.resetForm();
    const value =
      row && can('system:config:query') ? await getConfig(row.configId) : row;
    baseline = {
      configKey: value?.configKey ?? 'sys.index.footerText',
      configValue: value?.configValue ?? '',
    };
    const options = valueOptions[baseline.configKey];
    formApi.updateSchema([
      {
        fieldName: 'configValue',
        component: options ? 'Select' : 'Input',
        componentProps: () =>
          options
            ? { options }
            : {
                maxlength: 100,
                showWordLimit: true,
                placeholder: '请输入纯文本',
              },
      },
    ]);
    await formApi.setValues(baseline);
    ready = true;
  } catch {
    submitError.value = '参数加载失败，请关闭后重试';
  } finally {
    busy.value = false;
    modalApi.setState({ loading: false, confirmDisabled: !ready });
  }
}
async function remove(row: ConfigView) {
  if (!row.deletable || !can('system:config:remove')) return;
  try {
    await ElMessageBox.confirm(`确定删除“${row.configName}”吗？`, '删除参数', {
      type: 'warning',
    });
  } catch {
    return;
  }
  await removeConfig(row.configId);
  ElMessage.success('删除成功');
  await gridApi.query();
}
</script>

<template>
  <Page
    title="参数设置"
    description="维护平台允许管理的系统参数"
    auto-content-height
    content-class="flex min-h-0 flex-col"
  >
    <el-alert
      title="敏感配置不回显"
      type="info"
      show-icon
      :closable="false"
      class="mb-4"
    >
      仅展示允许管理的参数；验证码首次保存前沿用部署配置。注册开关仅保留记录，当前没有自助注册入口。
    </el-alert>
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4">
      <el-button link @click="gridApi.query()">重试</el-button>
    </el-alert>
    <el-empty v-if="!can('system:config:list')" description="无参数查看权限" />
    <Grid v-else class="min-h-0 flex-1">
      <template #toolbar-actions>
        <el-button
          v-if="can('system:config:add')"
          type="primary"
          @click="open()"
        >
          新增页脚文案
        </el-button>
      </template>
      <template #runtime="{ row }">
        {{
          row.configKey === 'sys.account.captchaOnOff'
            ? row.runtimeActive
              ? '数据库已接管'
              : '沿用部署配置'
            : '已保存'
        }}
      </template>
      <template #actions="{ row }">
        <el-button
          v-if="can('system:config:edit')"
          link
          type="primary"
          @click="open(row)"
        >
          修改
        </el-button>
        <el-button
          v-if="row.deletable && can('system:config:remove')"
          link
          type="danger"
          @click="remove(row)"
        >
          删除
        </el-button>
      </template>
    </Grid>
    <Modal class="w-full max-w-[480px]">
      <el-alert
        v-if="submitError"
        :title="submitError"
        type="error"
        show-icon
        class="mb-4"
      />
      <Form />
    </Modal>
  </Page>
</template>
