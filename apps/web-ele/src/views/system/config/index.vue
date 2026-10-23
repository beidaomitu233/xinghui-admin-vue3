<script lang="ts" setup>
import type { ConfigView } from '#/api/system/config';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  addConfig,
  editConfig,
  getConfig,
  listConfigs,
  removeConfig,
} from '#/api/system/config';
import AdminPageHeader from '#/components/admin-page-header.vue';
import PageHint from '#/components/page-hint.vue';

const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);
const rows = ref<ConfigView[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number>();
const form = reactive({ configKey: '', configValue: '' });

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

async function load() {
  if (!can('system:config:list')) return;
  loading.value = true;
  try {
    rows.value = await listConfigs();
  } finally {
    loading.value = false;
  }
}

function openAdd() {
  editingId.value = undefined;
  form.configKey = 'sys.index.footerText';
  form.configValue = '';
  dialogVisible.value = true;
}

async function openEdit(row: ConfigView) {
  const latest = can('system:config:query')
    ? await getConfig(row.configId)
    : row;
  editingId.value = latest.configId;
  form.configKey = latest.configKey;
  form.configValue = latest.configValue;
  dialogVisible.value = true;
}

async function save() {
  if (!form.configValue.trim()) {
    ElMessage.warning('请输入参数值');
    return;
  }
  saving.value = true;
  try {
    const data = { configKey: form.configKey, configValue: form.configValue };
    await (editingId.value === undefined
      ? addConfig(data)
      : editConfig(editingId.value, data));
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: ConfigView) {
  await ElMessageBox.confirm(`确定删除“${row.configName}”吗？`, '删除参数', {
    type: 'warning',
  });
  await removeConfig(row.configId);
  ElMessage.success('删除成功');
  await load();
}

onMounted(load);
</script>

<template>
  <Page content-class="admin-page">
    <AdminPageHeader title="参数设置">
      <template #actions>
        <el-button v-if="can('system:config:list')" @click="load">
          刷新
        </el-button>
        <el-button
          v-if="can('system:config:add')"
          type="primary"
          @click="openAdd"
        >
          新增页脚文案
        </el-button>
      </template>
    </AdminPageHeader>
    <el-card>
      <PageHint
        title="敏感配置不回显"
        details="仅展示允许管理的参数；敏感配置不会在此页面回显。验证码首次保存前沿用部署配置。注册开关仅保留记录，当前没有自助注册入口。"
      />
      <el-empty
        v-if="!can('system:config:list')"
        description="无参数查看权限"
      />
      <el-table v-else v-loading="loading" :data="rows" row-key="configId">
        <el-table-column prop="configName" label="名称" min-width="170" />
        <el-table-column prop="configKey" label="参数键" min-width="210" />
        <el-table-column prop="configValue" label="参数值" min-width="160" />
        <el-table-column label="生效状态" min-width="110">
          <template #default="{ row }">
            <span v-if="row.configKey === 'sys.account.captchaOnOff'">
              {{ row.runtimeActive ? '数据库已接管' : '沿用部署配置' }}
            </span>
            <span v-else>已保存</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="165">
          <template #default="{ row }">
            <el-button
              v-if="can('system:config:edit')"
              link
              type="primary"
              @click="openEdit(row)"
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
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId === undefined ? '新增页脚文案' : '修改参数'"
      width="480px"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="参数键">
          <el-input :model-value="form.configKey" disabled />
        </el-form-item>
        <el-form-item label="参数值" required>
          <el-select
            v-if="valueOptions[form.configKey]"
            v-model="form.configValue"
            class="w-full"
          >
            <el-option
              v-for="option in valueOptions[form.configKey]"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-input
            v-else
            v-model="form.configValue"
            maxlength="100"
            show-word-limit
            placeholder="请输入纯文本"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          保存
        </el-button>
      </template>
    </el-dialog>
  </Page>
</template>
